import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Bot, ChevronDown, Play, RefreshCw, ShieldCheck, Sparkles, Square, Wallet } from 'lucide-react'
import { analyzeLiquidity } from '../../engine/liquidity'
import { analyzeMarketStructure, findSwingPoints } from '../../engine/marketStructure'
import { analyzeSetup } from '../../engine/setup'
import { analyzeSupportResistance } from '../../engine/supportResistance'
import { buildTradingContext } from '../../engine/ai/context'
import { analyzeMultiTimeframeBias, buildAgentResearch, executeSimulationTrade, learnFromTrades, useMultiTimeframeCandles } from '../../engine/agent'
import { BOT_CYCLES_PER_UNIT, BOT_PLANS, type BotPlan } from '../../engine/agent/botPlans'
import type { OHLCV, SymbolSpec, Timeframe, TradeOrder } from '../../types'

interface Props {
  symbol: string
  timeframe: Timeframe
  candles: OHLCV[]
  currentPrice: number
  activePosition: TradeOrder | null
  tradeHistory: TradeOrder[]
  accountBalance?: number
  accountCurrency?: string
  symbolSpec?: SymbolSpec | null
  conversionRate?: number
  botPlan?: BotPlan
  botOrderIds?: string[]
  onBotOrder?: (order: TradeOrder) => void
  onBotClose?: (id: string) => void | Promise<void>
  onBotRunningChange?: (running: boolean) => void
  onReviewSetup?: (setup?: import('../../engine/setup/types').SetupCandidate | null) => void
  scanM1Candles?: OHLCV[]
}

type RiskMode = 'SAFE' | 'NORMAL' | 'RISK'
const riskModes: Record<RiskMode, { label: string; percent: number; description: string }> = {
  SAFE: { label: 'Safe', percent: 0.25, description: 'Smallest simulated risk' },
  NORMAL: { label: 'Normal', percent: 0.5, description: 'Balanced simulated risk' },
  RISK: { label: 'Risk', percent: 1, description: 'Higher simulated risk' },
}
type Phase = 'READY' | 'ANALYZING' | 'RUNNING'
const SCAN_TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1']
const BOT_CYCLE_SECONDS = 3 as const
const BOT_RESULT_DELAY_MS = 1800 as const
const BOT_START_DELAY_MS = 1000 as const
const BOT_RISK_MODE: RiskMode = 'SAFE'

export function TradingAgentPanel({
  symbol,
  timeframe,
  candles,
  currentPrice,
  activePosition,
  tradeHistory,
  accountBalance = 10000,
  accountCurrency = 'USD',
  symbolSpec = null,
  conversionRate,
  botPlan = 'FREE',
  botOrderIds = [],
  onBotOrder,
  onBotClose,
  onBotRunningChange,
  onReviewSetup,
  scanM1Candles = [],
}: Props) {
  const plan = BOT_PLANS[botPlan]
  const readStoredLotSize = (): string => typeof window !== 'undefined' ? window.sessionStorage.getItem('shafx-simulator-lot-size') || '0.10' : '0.10'
  const [lotSize, setLotSize] = useState(readStoredLotSize)
  const [phase, setPhase] = useState<Phase>('READY')
  const [autoTradingEnabled, setAutoTradingEnabled] = useState(false)
  const [wins, setWins] = useState(0)
  const [losses, setLosses] = useState(0)
  const [cycles, setCycles] = useState(0)
  const [cycleUnits, setCycleUnits] = useState(0)
  const [unitRound, setUnitRound] = useState(0)
  const [pendingUnitCompletion, setPendingUnitCompletion] = useState(false)
  const [botSessionStarted, setBotSessionStarted] = useState(false)
  const [tradeCloseAt, setTradeCloseAt] = useState<number | null>(null)
  const [tradeSecondsLeft, setTradeSecondsLeft] = useState(0)
  const [scanFrame, setScanFrame] = useState<Timeframe>('M1')
  const [scanSeconds, setScanSeconds] = useState(0)
  const [scanComplete, setScanComplete] = useState(false)
  const [scanNonce, setScanNonce] = useState(0)
  const [lastResult, setLastResult] = useState<'WIN' | 'LOSS' | 'WAIT' | null>(null)
  const [status, setStatus] = useState('Ready to scan')
  const [bias, setBias] = useState('Neutral')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [botPositionId, setBotPositionId] = useState<string | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const processedHistory = useRef(new Set<string>())
  const analysisTimer = useRef<number | null>(null)
  const scanInterval = useRef<number | null>(null)
  const tradeCloseTimer = useRef<number | null>(null)
  const runInFlightRef = useRef(false)
  const runBotCycleRef = useRef<(() => Promise<void>) | null>(null)

  const tradingContext = useMemo(() => {
    const swings = findSwingPoints(candles, 2)
    const structure = analyzeMarketStructure(candles, 2)
    const tolerance = symbol.includes('JPY') ? 0.1 : 0.001
    const supportResistance = analyzeSupportResistance(candles, tolerance, swings)
    const liquidity = analyzeLiquidity(candles, swings, tolerance)
    const setup = analyzeSetup({ currentPrice: candles[candles.length - 1]?.close ?? currentPrice, structure, supportResistance, liquidity })
    return buildTradingContext(symbol, timeframe, candles, structure, supportResistance, liquidity, setup)
  }, [candles, currentPrice, symbol, timeframe, scanNonce])

  const timeframeFrames = useMultiTimeframeCandles(symbol, timeframe, candles, scanM1Candles)
  const multiTimeframe = useMemo(() => analyzeMultiTimeframeBias(timeframeFrames), [timeframeFrames])
  const fastScanCandidates = useMemo(() => {
    const qualityWeight: Record<'weak' | 'moderate' | 'strong', number> = { weak: 1, moderate: 2, strong: 3 }
    return SCAN_TIMEFRAMES.flatMap((scanTimeframe) => {
      const frameCandles = timeframeFrames[scanTimeframe] ?? []
      if (frameCandles.length < 5) return []
      const swings = findSwingPoints(frameCandles, 2)
      const structure = analyzeMarketStructure(frameCandles, 2)
      const tolerance = symbol.includes('JPY') ? 0.1 : 0.001
      const supportResistance = analyzeSupportResistance(frameCandles, tolerance, swings)
      const liquidity = analyzeLiquidity(frameCandles, swings, tolerance)
      const framePrice = frameCandles[frameCandles.length - 1]?.close ?? currentPrice
      const setupResult = analyzeSetup({ currentPrice: framePrice, structure, supportResistance, liquidity })
      const preferredSetup = setupResult.preferredSetup
      if (!preferredSetup || preferredSetup.status !== 'candidate') return []
      const context = buildTradingContext(symbol, scanTimeframe, frameCandles, structure, supportResistance, liquidity, setupResult)
      return [{ timeframe: scanTimeframe, setup: preferredSetup, context, score: preferredSetup.confidence + qualityWeight[preferredSetup.quality] * 5 }]
    }).sort((a, b) => b.score - a.score)
  }, [currentPrice, scanNonce, symbol, timeframeFrames])
  const activeBotScan = fastScanCandidates[0] ?? null
  const botTrades = useMemo(() => tradeHistory.filter((trade) => botOrderIds.includes(trade.id)).sort((a, b) => new Date(b.closeTime ?? b.openTime).getTime() - new Date(a.closeTime ?? a.openTime).getTime()), [botOrderIds, tradeHistory])
  const activeBotOrder = activePosition && botOrderIds.includes(activePosition.id) ? activePosition : null

  const learning = useMemo(() => learnFromTrades(tradeHistory.filter((trade) => trade.status === 'closed').map((trade) => ({ symbol: trade.symbol, direction: trade.type, profit: trade.profit, riskRewardRatio: trade.riskRewardRatio }))), [tradeHistory])
  const research = useMemo(() => buildAgentResearch({ context: tradingContext, learning, multiTimeframe }), [learning, multiTimeframe, tradingContext])
  const setup = tradingContext.setup.preferredSetup
  const bestOpportunity = activeBotScan?.setup ?? setup
  const riskAmount = accountBalance * (riskModes[BOT_RISK_MODE].percent / 100)
  const displayedUnitNumber = unitRound === BOT_CYCLES_PER_UNIT ? Math.max(1, cycleUnits) : Math.min(cycleUnits + 1, plan.maxDailyCycleUnits ?? cycleUnits + 1)
  const bestOpportunityRef = useRef(bestOpportunity)
  const showBotActivity = botSessionStarted
  const confidenceDisplay = bestOpportunity ? Math.max(50, Math.min(95, bestOpportunity.confidence)) : 0
  const parsedLotSize = Number(lotSize)
  const lotSizeValid = symbolSpec ? Number.isFinite(parsedLotSize) && parsedLotSize >= symbolSpec.minLotSize && parsedLotSize <= symbolSpec.maxLotSize && Math.abs((parsedLotSize / symbolSpec.lotStep) - Math.round(parsedLotSize / symbolSpec.lotStep)) < 1e-8 : false

  useEffect(() => {
    bestOpportunityRef.current = bestOpportunity
  }, [bestOpportunity])

  useEffect(() => {
    const onLotSize = (event: Event): void => {
      const detail = (event as CustomEvent<string>).detail
      if (detail) setLotSize(detail)
    }
    window.addEventListener('shafx-lot-size', onLotSize)
    return () => window.removeEventListener('shafx-lot-size', onLotSize)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !lotSize.trim()) return
    window.sessionStorage.setItem('shafx-simulator-lot-size', lotSize)
    window.dispatchEvent(new CustomEvent<string>('shafx-lot-size', { detail: lotSize }))
  }, [lotSize])


  useEffect(() => {
    setBias(multiTimeframe.dominantBias ?? (setup?.direction === 'BUY' ? 'Bullish' : setup?.direction === 'SELL' ? 'Bearish' : 'Neutral'))
  }, [multiTimeframe.dominantBias, setup?.direction])

  useEffect(() => {
    onBotRunningChange?.(autoTradingEnabled && (phase === 'RUNNING' || phase === 'ANALYZING'))
  }, [autoTradingEnabled, onBotRunningChange, phase])

  useEffect(() => {
    setAutoTradingEnabled(false)
    setPhase('READY')
    setBotPositionId(null)
    setUnitRound(0)
    setPendingUnitCompletion(false)
    setBotSessionStarted(false)
    setTradeCloseAt(null)
    setTradeSecondsLeft(0)
    setLastResult(null)
    setScanComplete(false)
    setStatus('Ready to trade ' + symbol)
  }, [symbol])

  useEffect(() => {
    let cancelled = false
    const loadUsage = async () => {
      try {
        const response = await fetch('/api/bot/usage', { credentials: 'same-origin' })
        if (!response.ok) return
        const data = await response.json()
        if (!cancelled) {
          setCycleUnits(Number(data.usedCycleUnits) || 0)
          setUnitRound(Number(data.currentUnitRound) || 0)
          if (data.runId) setRunId(String(data.runId))
          if (data.plan && data.plan !== botPlan) setStatus(String(data.plan) + ' bot entitlement is active.')
        }
      } catch {
        if (!cancelled) setStatus('Unable to load bot allowance.')
      }
    }
    void loadUsage()
    return () => { cancelled = true }
  }, [botPlan])

  useEffect(() => {
    if (!botPositionId) return
    const closed = tradeHistory.find((trade) => trade.id === botPositionId && trade.status === 'closed')
    if (!closed || processedHistory.current.has(closed.id)) return
    processedHistory.current.add(closed.id)
    setBotPositionId(null)
    setTradeCloseAt(null)
    setTradeSecondsLeft(0)
    const profit = closed.profit ?? 0
    if (profit >= 0) {
      setWins((v) => v + 1)
      setLastResult('WIN')
      setStatus('WIN • ' + closed.type + ' ' + closed.symbol + ' closed with +' + profit.toFixed(2) + ' ' + accountCurrency)
    } else {
      setLosses((v) => v + 1)
      setLastResult('LOSS')
      setStatus('LOSS • ' + closed.type + ' ' + closed.symbol + ' closed with ' + profit.toFixed(2) + ' ' + accountCurrency)
    }
    if (pendingUnitCompletion) {
      setAutoTradingEnabled(false)
      setPhase('READY')
      setStatus('Unit complete • 5/5 rounds finished. Continue to the next unit when you are ready.')
    }
  }, [accountCurrency, botPositionId, pendingUnitCompletion, tradeHistory])

  useEffect(() => {
    if (!tradeCloseAt) return
    const updateCountdown = (): void => {
      const seconds = Math.max(0, (tradeCloseAt - Date.now()) / 1000)
      setTradeSecondsLeft(Number(seconds.toFixed(1)))
      if (seconds <= 0) setTradeCloseAt(null)
    }
    updateCountdown()
    const timer = window.setInterval(updateCountdown, 100)
    return () => window.clearInterval(timer)
  }, [tradeCloseAt])

  useEffect(() => {
    runBotCycleRef.current = async (): Promise<void> => {
      if (runInFlightRef.current) return
      runInFlightRef.current = true

      try {
        if (!autoTradingEnabled || phase !== 'RUNNING') return
        if (activePosition || botPositionId) {
          setStatus('MONITORING • waiting for the current simulated round to close')
          return
        }
        if (!symbolSpec || !onBotOrder) {
          setStatus('BOT ERROR • simulator order engine is not ready')
          return
        }
        if (!lotSizeValid) {
          setStatus('BOT ERROR • choose a valid lot size')
          setAutoTradingEnabled(false)
          setPhase('READY')
          return
        }
        if (pendingUnitCompletion || (cycleUnits >= (plan.maxDailyCycleUnits ?? Number.MAX_SAFE_INTEGER) && unitRound === 0)) {
          setAutoTradingEnabled(false)
          setPhase('READY')
          setStatus('UNIT LIMIT REACHED • continue after the current unit is confirmed')
          return
        }

        const scan = activeBotScan
        const nextRound = unitRound + 1
        const unitNumber = unitRound === 0 ? Math.min(cycleUnits + 1, plan.maxDailyCycleUnits ?? cycleUnits + 1) : displayedUnitNumber

        setScanComplete(true)
        setLastResult(null)
        setStatus(scan
          ? 'PROPOSAL • ' + scan.setup.direction + ' on ' + scan.timeframe + ' • confidence ' + scan.setup.confidence + '%'
          : 'PROPOSAL • building a simulator setup from current market structure…')

        const result = executeSimulationTrade({
          context: scan
            ? { tradingContext: scan.context, preferredSetup: scan.setup, hasOpenPosition: false, permission: 'AUTONOMOUS_SIMULATION', multiTimeframe, learning, research }
            : { tradingContext, preferredSetup: setup, hasOpenPosition: false, permission: 'AUTONOMOUS_SIMULATION', multiTimeframe, learning, research },
          accountBalance,
          accountCurrency,
          riskPercent: riskModes[BOT_RISK_MODE].percent,
          symbolSpec,
          conversionRate,
          lotSize: parsedLotSize,
          allowSimulationFallback: true,
        })

        const order = result.order
        if (!order) {
          setLastResult('WAIT')
          setStatus('WAIT • the risk/setup gate did not produce a valid simulated order')
          return
        }

        setCycles((value) => value + 1)
        setUnitRound(nextRound)
        setBotPositionId(order.id)
        setLastResult(null)
        setTradeCloseAt(Date.now() + BOT_RESULT_DELAY_MS)
        setTradeSecondsLeft(BOT_RESULT_DELAY_MS / 1000)
        setStatus(
          'BUY/SELL • ' + order.type + ' ' + order.symbol
          + ' • Unit ' + unitNumber + '/' + (plan.maxDailyCycleUnits ?? '∞')
          + ' • Round ' + nextRound + '/' + BOT_CYCLES_PER_UNIT
        )

        onBotOrder(order)

        if (tradeCloseTimer.current) window.clearTimeout(tradeCloseTimer.current)
        tradeCloseTimer.current = window.setTimeout(async () => {
          try {
            await onBotClose?.(order.id)
          } finally {
            setTradeCloseAt(null)
            setTradeSecondsLeft(0)

            const sessionRunId = runId ?? 'v3-' + crypto.randomUUID()
            try {
              const response = await fetch('/api/bot/usage', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ runId: sessionRunId }),
              })
              const data = await response.json().catch(() => ({}))
              if (response.ok && data.ok) {
                setRunId(sessionRunId)
                setCycleUnits(Number(data.usedCycleUnits) || cycleUnits)
                setUnitRound(Number(data.currentUnitRound) || nextRound)
                if (data.completedUnit || nextRound >= BOT_CYCLES_PER_UNIT) {
                  setPendingUnitCompletion(true)
                  setAutoTradingEnabled(false)
                  setPhase('READY')
                  setStatus('UNIT COMPLETE • 5/5 rounds finished • tap Continue next unit')
                }
              } else if (nextRound >= BOT_CYCLES_PER_UNIT) {
                setPendingUnitCompletion(true)
                setAutoTradingEnabled(false)
                setPhase('READY')
                setStatus('UNIT COMPLETE locally • server allowance sync needs another pass')
              } else {
                setStatus('RESULT • round closed • server allowance sync pending')
              }
            } catch {
              if (nextRound >= BOT_CYCLES_PER_UNIT) {
                setPendingUnitCompletion(true)
                setAutoTradingEnabled(false)
                setPhase('READY')
                setStatus('UNIT COMPLETE locally • server allowance sync needs another pass')
              }
            }
          }
        }, BOT_RESULT_DELAY_MS)
      } catch (error) {
        setAutoTradingEnabled(false)
        setPhase('READY')
        setStatus('BOT ERROR • ' + (error instanceof Error ? error.message : 'Unable to open simulator trade'))
      } finally {
        runInFlightRef.current = false
      }
    }

    return () => { runBotCycleRef.current = null }
  }, [accountBalance, accountCurrency, activeBotScan, activePosition, autoTradingEnabled, botPositionId, conversionRate, cycleUnits, displayedUnitNumber, learning, lotSizeValid, multiTimeframe, onBotClose, onBotOrder, parsedLotSize, pendingUnitCompletion, phase, plan.maxDailyCycleUnits, research, runId, setup, symbol, symbolSpec, tradingContext, unitRound])
  useEffect(() => {
    if (phase !== 'RUNNING') return
    const kickoff = window.setTimeout(() => { void runBotCycleRef.current?.() }, BOT_START_DELAY_MS)
    const timer = window.setInterval(() => { void runBotCycleRef.current?.() }, BOT_CYCLE_SECONDS * 1000)
    return () => {
      window.clearTimeout(kickoff)
      window.clearInterval(timer)
    }
  }, [phase])

  useEffect(() => () => {
    if (analysisTimer.current) window.clearTimeout(analysisTimer.current)
    if (scanInterval.current) window.clearInterval(scanInterval.current)
    onBotRunningChange?.(false)
  }, [onBotRunningChange])

  const startAutomaticTrading = (): void => {
    if (!symbolSpec || autoTradingEnabled) return
    if (cycleUnits >= (plan.maxDailyCycleUnits ?? Number.MAX_SAFE_INTEGER)) {
      setStatus('Daily bot units are exhausted.')
      return
    }
    if (analysisTimer.current) window.clearTimeout(analysisTimer.current)
    setPendingUnitCompletion(false)
    setBotSessionStarted(true)
    setLastResult(null)
    setScanComplete(false)
    setAutoTradingEnabled(true)
    setPhase('ANALYZING')
    setScanFrame('M1')
    setScanSeconds(0)
    setStatus('BOT START • scanning all seven timeframes…')
    analysisTimer.current = window.setTimeout(() => {
      setPhase('RUNNING')
      setStatus('BOT RUNNING • first simulated trade in about 1 second.')
    }, BOT_START_DELAY_MS)
  }

  const continueNextUnit = (): void => {
    if (cycleUnits >= (plan.maxDailyCycleUnits ?? Number.MAX_SAFE_INTEGER)) {
      setStatus('Daily bot units are exhausted.')
      return
    }
    setUnitRound(0)
    setPendingUnitCompletion(false)
    setBotSessionStarted(true)
    setLastResult(null)
    startAutomaticTrading()
  }

  const stopAutomaticTrading = (): void => {
    if (analysisTimer.current) window.clearTimeout(analysisTimer.current)
    setAutoTradingEnabled(false)
    setPhase('READY')
    setStatus('Automatic trading is OFF. No new bot trades will be opened.')
  }

  const rescanBot = (): void => {
    if (analysisTimer.current) window.clearTimeout(analysisTimer.current)
    if (scanInterval.current) window.clearInterval(scanInterval.current)
    setLastResult(null)
    setScanComplete(false)
    setScanSeconds(0)
    setPhase('ANALYZING')
    setScanFrame('M1')
    setScanNonce((value) => value + 1)
    let index = 0
    scanInterval.current = window.setInterval(() => {
      index = (index + 1) % SCAN_TIMEFRAMES.length
      setScanFrame(SCAN_TIMEFRAMES[index])
      setScanSeconds((value) => Math.min(10, value + 1))
    }, 1000)
    setStatus(activePosition ? 'Refreshing all timeframe structure, liquidity and setup…' : 'Scanning M1/M5/M15/M30/H1/H4/D1 for the best opportunity…')
    analysisTimer.current = window.setTimeout(() => {
      if (scanInterval.current) window.clearInterval(scanInterval.current)
      setScanSeconds(10)
      setScanComplete(true)
      setPhase('READY')
      const opportunity = bestOpportunityRef.current
      setStatus(opportunity && activeBotScan
        ? 'Opportunity found on ' + activeBotScan.timeframe + ' • ' + opportunity.direction + ' • ' + opportunity.confidence + '%'
        : 'No clean opportunity found across all seven timeframes.')
    }, 10000)
  }

  return (
    <section className="rounded-2xl border border-shafx-border bg-shafx-surface p-3.5 text-sm shadow-[0_14px_36px_rgba(0,0,0,.22)] sm:p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-shafx-accent/10 text-shafx-accent"><Bot className="h-5 w-5" /></div>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{plan.label}</h2>
            <p className="mt-0.5 text-[10px] leading-4 text-shafx-textMuted">Structure, liquidity, setup and risk analysis. Simulator-only execution.</p>
          </div>
        </div>
        <span className={phase === 'RUNNING' ? 'flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-shafx-success/20 bg-shafx-success/5 px-2.5 text-[9px] font-semibold text-shafx-success' : 'flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-shafx-border bg-shafx-bg px-2.5 text-[9px] font-semibold text-shafx-textMuted'}>
          <Activity className="h-3 w-3" />
          {phase === 'ANALYZING' ? 'Analyzing' : phase === 'RUNNING' ? 'Running' : 'Ready'}
        </span>
      </header>

  {showBotActivity && (
      <section className="mt-3 rounded-xl border border-shafx-success/20 bg-shafx-success/[0.025] p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-shafx-textMuted">AI BOT RUN • TRADE ACTIVITY</div>
            <div className="mt-1 text-sm font-semibold">{activeBotOrder ? activeBotOrder.type + ' ' + activeBotOrder.symbol + ' is OPEN' : lastResult === 'WIN' ? 'Last round: WIN' : lastResult === 'LOSS' ? 'Last round: LOSS' : 'Bot is preparing the next trade…'}</div>
          </div>
          <span className="rounded-full border border-shafx-border px-2.5 py-1 font-mono text-[9px] text-shafx-accent bg-shafx-accent/5 border-shafx-accent/30">Unit {displayedUnitNumber}/{plan.maxDailyCycleUnits === null ? '∞' : plan.maxDailyCycleUnits} • Round {unitRound}/5</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-[9px] text-shafx-textMuted">
          <div className="rounded-lg border border-shafx-border bg-shafx-bg px-2 py-2"><span className="block">WIN</span><strong className="mt-0.5 block font-mono text-shafx-success">{wins}</strong></div>
          <div className="rounded-lg border border-shafx-border bg-shafx-bg px-2 py-2"><span className="block">LOSS</span><strong className="mt-0.5 block font-mono text-shafx-danger">{losses}</strong></div>
          <div className="rounded-lg border border-shafx-border bg-shafx-bg px-2 py-2"><span className="block">Daily units</span><strong className="mt-0.5 block font-mono text-shafx-text">{cycleUnits}/{plan.maxDailyCycleUnits === null ? '∞' : plan.maxDailyCycleUnits}</strong></div>
        </div>
        {activeBotOrder && <div className="mt-3 rounded-xl border border-shafx-success/30 bg-shafx-success/5 p-3">
          <div className="flex items-center justify-between gap-2"><span className={activeBotOrder.type === 'BUY' ? 'text-lg font-bold text-shafx-success' : 'text-lg font-bold text-shafx-danger'}>{activeBotOrder.type} {activeBotOrder.lotSize.toFixed(2)} LOT</span><span className="font-mono text-sm">{tradeSecondsLeft.toFixed(1)}s</span></div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[9px]">
            <div className="rounded-lg border border-shafx-border bg-shafx-bg p-2"><span className="block text-shafx-textMuted">Entry</span><b className="font-mono">{activeBotOrder.entryPrice}</b></div>
            <div className="rounded-lg border border-shafx-danger/20 bg-shafx-danger/[0.04] p-2"><span className="block text-shafx-textMuted">Stop Loss</span><b className="font-mono text-shafx-danger">{activeBotOrder.stopLoss}</b></div>
            <div className="rounded-lg border border-shafx-success/20 bg-shafx-success/[0.04] p-2"><span className="block text-shafx-textMuted">Take Profit</span><b className="font-mono text-shafx-success">{activeBotOrder.takeProfit}</b></div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-shafx-border"><div className="h-full rounded-full bg-shafx-success" style={{ width: Math.max(0, Math.min(100, ((2500 - tradeSecondsLeft * 1000) / 2500) * 100)) + '%' }} /></div>
          <div className="mt-2 text-[9px] text-shafx-textMuted">AI simulation is running this {activeBotOrder.type} trade. The round closes automatically, then the next round starts.</div>
        </div>}
        {botTrades.length > 0 && <div className="mt-3 space-y-1.5">
          {botTrades.slice(0, 5).map((trade) => {
            const profit = trade.profit ?? 0
            return <div key={trade.id} className="flex items-center justify-between gap-2 rounded-lg border border-shafx-border bg-shafx-bg px-2.5 py-2 text-[9px]">
              <span className={trade.type === 'BUY' ? 'font-semibold text-shafx-success' : 'font-semibold text-shafx-danger'}>{trade.type} {trade.symbol} • {trade.lotSize.toFixed(2)} lots</span>
              <span className={profit >= 0 ? 'font-mono text-shafx-success' : 'font-mono text-shafx-danger'}>{profit >= 0 ? '+' : ''}{profit.toFixed(2)} {accountCurrency}</span>
            </div>
          })}
        </div>}
      </section>

      )

      <section className="mt-3 rounded-xl border border-shafx-accent/30 bg-shafx-accent/[0.045] p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-shafx-textMuted">Automatic trading</div>
            <div className="mt-1 text-base font-semibold">{autoTradingEnabled ? 'Bot is running' : 'Bot is stopped'}</div>
            <p className="mt-1 text-[10px] leading-4 text-shafx-textMuted">{autoTradingEnabled ? 'SHAFX will scan this market automatically and place simulated trades when the setup passes its rules.' : 'Start the bot to let SHAFX scan this market automatically and place simulated trades for you.'}</p>
          </div>
          <span className={autoTradingEnabled ? 'rounded-full border border-shafx-success/20 bg-shafx-success/5 px-2.5 py-1 text-[9px] font-semibold text-shafx-success' : 'rounded-full border border-shafx-border bg-shafx-bg px-2.5 py-1 text-[9px] font-semibold text-shafx-textMuted'}>{autoTradingEnabled ? 'ON' : 'OFF'}</span>
        </div>
        <button
          type="button"
          disabled={!symbolSpec || phase === 'ANALYZING'}
          onClick={autoTradingEnabled ? stopAutomaticTrading : pendingUnitCompletion ? continueNextUnit : startAutomaticTrading}
          className={autoTradingEnabled ? 'mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-shafx-danger/30 bg-shafx-danger/10 px-3 text-[10px] font-semibold text-shafx-danger active:bg-shafx-danger/20 disabled:opacity-40' : 'mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-shafx-accent px-3 text-[10px] font-semibold text-white active:opacity-90 disabled:opacity-40'}
        >
          {autoTradingEnabled ? <Square className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
          {autoTradingEnabled ? 'Stop automatic trading' : pendingUnitCompletion ? 'Continue next unit' : 'Start automatic trading'}
        </button>
        <div className="mt-2 grid grid-cols-3 gap-2 text-[9px] text-shafx-textMuted">
          <div className="rounded-lg border border-shafx-border bg-shafx-bg px-2 py-2"><span className="block">Market</span><strong className="mt-0.5 block font-mono text-shafx-text">{symbol}</strong></div>
          <div className="rounded-lg border border-shafx-border bg-shafx-bg px-2 py-2"><span className="block">Round</span><strong className="mt-0.5 block font-mono text-shafx-text">3s</strong></div>
          <div className="rounded-lg border border-shafx-border bg-shafx-bg px-2 py-2"><span className="block">Mode</span><strong className="mt-0.5 block text-shafx-text">Simulator</strong></div>
        </div>
      </section>

      <div className="mt-3 rounded-xl border border-shafx-border bg-shafx-bg p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-shafx-textMuted">Bot stake</div>
            <div className="mt-1 text-sm font-semibold">Lot size per round</div>
          </div>
          <span className="rounded-lg border border-shafx-border px-2 py-1 font-mono text-[9px] text-shafx-textMuted">5 rounds = 1 unit</span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={() => {
            const next = Math.max(symbolSpec?.minLotSize ?? 0.01, Number((parsedLotSize - (symbolSpec?.lotStep ?? 0.01)).toFixed(4)))
            setLotSize(String(next))
          }} className="min-h-11 min-w-11 rounded-xl border border-shafx-border bg-shafx-surface text-base font-semibold">−</button>
          <label className="flex-1">
            <span className="sr-only">Bot lot size</span>
            <input type="number" inputMode="decimal" step={symbolSpec?.lotStep ?? 0.01} min={symbolSpec?.minLotSize ?? 0.01} max={symbolSpec?.maxLotSize ?? 100} value={lotSize} onChange={(event) => setLotSize(event.target.value)} className="min-h-11 w-full rounded-xl border border-shafx-border bg-shafx-surface px-3 text-center font-mono text-sm focus:border-shafx-accent focus:outline-none" aria-label="Bot lot size" />
          </label>
          <button type="button" onClick={() => {
            const next = Math.min(symbolSpec?.maxLotSize ?? 100, Number((parsedLotSize + (symbolSpec?.lotStep ?? 0.01)).toFixed(4)))
            setLotSize(String(next))
          }} className="min-h-11 min-w-11 rounded-xl border border-shafx-border bg-shafx-surface text-base font-semibold">+</button>
        </div>
        <p className="mt-2 text-[9px] leading-4 text-shafx-textMuted">This lot size is used for each simulated bot round. One unit contains 5 rounds; the Free Bot has 5 units per day, so it can execute up to 25 simulated trade rounds per day.</p>
      </div>

      <div className="mt-3 rounded-xl border border-shafx-border bg-shafx-bg p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-shafx-textMuted">Market read</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <div className="text-xl font-semibold">{phase === 'ANALYZING' ? 'Analyzing…' : bias}</div>
              <span className="rounded-lg border border-shafx-accent/20 bg-shafx-accent/5 px-2.5 py-1 text-[9px] font-semibold text-shafx-accent">All TFs</span>
              <span className="rounded-lg border border-shafx-border px-2.5 py-1 text-[9px] text-shafx-textMuted">{research.agreement.toFixed(0)}% evidence agreement</span>
            </div>
          </div>
          <Sparkles className="h-5 w-5 shrink-0 text-shafx-accent" />
        </div>
        {phase === 'ANALYZING' ? (
          <div className="mt-3 rounded-xl border border-shafx-accent/25 bg-shafx-accent/[0.05] p-4 text-center">
            <div className="text-2xl font-semibold text-shafx-accent">{scanFrame}</div>
            <div className="mt-1 text-[10px] text-shafx-textMuted">Scanning all seven timeframes • {scanSeconds}/10s</div>
            <div className="mt-3 grid grid-cols-7 gap-1">
              {SCAN_TIMEFRAMES.map((frame) => <span key={frame} className={frame === scanFrame ? 'rounded-md bg-shafx-accent px-1 py-1.5 text-[8px] font-semibold text-white' : 'rounded-md border border-shafx-border px-1 py-1.5 text-[8px] text-shafx-textMuted'}>{frame}</span>)}
            </div>
          </div>
        ) : scanComplete && bestOpportunity ? (
          <div className="mt-3 rounded-xl border border-shafx-success/30 bg-shafx-success/[0.055] p-4 text-center">
            <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-shafx-success">OPPORTUNITY FOUND</div>
            <div className="mt-1 text-3xl font-semibold">{bestOpportunity.direction}</div>
            <div className="mt-1 text-base font-semibold text-shafx-accent">Found on {activeBotScan?.timeframe ?? timeframe}</div>
            <div className="mt-2 text-6xl font-black leading-none tracking-tight text-shafx-accent">{confidenceDisplay}%</div>
            <div className="mt-1 text-[9px] uppercase tracking-[0.16em] text-shafx-textMuted">AI confidence</div>
            <div className="mt-2 text-[10px] text-shafx-textMuted">Entry {bestOpportunity.entryPrice}</div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[9px]">
              <div className="rounded-lg border border-shafx-border bg-shafx-bg p-2"><span className="block text-shafx-textMuted">Entry</span><b className="font-mono">{bestOpportunity.entryPrice}</b></div>
              <div className="rounded-lg border border-shafx-danger/20 bg-shafx-danger/[0.04] p-2"><span className="block text-shafx-textMuted">Stop Loss</span><b className="font-mono text-shafx-danger">{bestOpportunity.stopLoss}</b></div>
              <div className="rounded-lg border border-shafx-success/20 bg-shafx-success/[0.04] p-2"><span className="block text-shafx-textMuted">Take Profit</span><b className="font-mono text-shafx-success">{bestOpportunity.takeProfit}</b></div>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-[11px] leading-5 text-shafx-textMuted">Every scan recalculates the current simulated market across M1, M5, M15, M30, H1, H4 and D1. The selected chart timeframe never limits the bot.</p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={!symbolSpec || phase === 'ANALYZING'}
            onClick={rescanBot}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-shafx-accent/35 bg-shafx-accent/10 px-3 text-[10px] font-semibold text-shafx-accent active:bg-shafx-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RefreshCw className={phase === 'ANALYZING' ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
            {phase === 'ANALYZING' ? 'Refreshing analysis…' : 'Refresh analysis'}
          </button>
          {phase === 'RUNNING' && <span className="rounded-xl border border-shafx-success/20 bg-shafx-success/5 px-2.5 py-2 text-[9px] font-semibold text-shafx-success">Auto scan ON</span>}
        </div>
        {onReviewSetup && <button type="button" onClick={() => onReviewSetup(bestOpportunity)} className="mt-2 min-h-10 w-full rounded-xl border border-shafx-border bg-shafx-surface px-3 text-[10px] font-semibold text-shafx-textMuted active:bg-shafx-accent/10">Review AI strategy</button>}
      </div>

}

      <div className="mt-3 rounded-xl border border-shafx-border bg-shafx-bg p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div>
        

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <section className="rounded-xl border border-shafx-accent/25 bg-shafx-accent/[0.045] p-3.5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-shafx-accent" />
            <div><div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-shafx-textMuted">Automatic protection</div><div className="text-sm font-semibold">{riskModes[BOT_RISK_MODE].label} simulation mode</div></div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
            <div className="rounded-lg border border-shafx-border bg-shafx-bg px-2.5 py-2"><span className="text-shafx-textMuted">Balance</span><div className="mt-0.5 font-mono text-xs">${accountBalance.toFixed(2)}</div></div>
            <div className="rounded-lg border border-shafx-border bg-shafx-bg px-2.5 py-2"><span className="text-shafx-textMuted">Max risk</span><div className="mt-0.5 font-mono text-xs text-shafx-danger">${riskAmount.toFixed(2)}</div></div>
          </div>
          <p className="mt-3 text-[9px] leading-4 text-shafx-textMuted">The AI sets the protective Stop Loss and Take Profit from the chosen setup. You control the bot lot size above.</p>
        </section>

        <section className="rounded-xl border border-shafx-border bg-shafx-bg p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div><div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-shafx-textMuted">Bot cycle</div><div className="mt-1 text-sm font-semibold">3s automatic round</div></div>
            <Wallet className="h-4 w-4 text-shafx-accent" />
          </div>
          <div className="mt-3 rounded-lg border border-shafx-border px-2.5 py-2 text-[10px] text-shafx-textMuted">
            <span>Allowance</span>
            <span className="float-right font-mono text-shafx-text">{cycleUnits}{plan.maxDailyCycleUnits === null ? ' / ∞' : ' / ' + plan.maxDailyCycleUnits}</span>
          </div>
          <p className="mt-2 text-[9px] leading-4 text-shafx-textMuted">The simulator bot manages its scan cadence automatically. Use Refresh analysis when you want a fresh market read immediately.</p>
        </section>
      </div>

      <div className="mt-3 rounded-xl border border-shafx-border bg-shafx-bg p-3">
        <div className="flex items-center justify-between gap-3"><span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-shafx-textMuted">Current status</span><span className="text-[9px] text-shafx-textMuted">Round {unitRound}/5</span></div>
        <p className="mt-1.5 text-[11px] leading-5 text-shafx-text">{status}</p><p className="mt-1 text-[9px] text-shafx-textMuted">Refresh market recalculates all seven timeframes. Run starts the simulator immediately and uses a 3-second round cadence.</p>
        {lastResult && <div className={lastResult === 'WIN' ? 'mt-2 text-[10px] text-shafx-success' : lastResult === 'LOSS' ? 'mt-2 text-[10px] text-shafx-danger' : 'mt-2 text-[10px] text-shafx-textMuted'}>{lastResult === 'WIN' ? 'Profit → analyze again' : lastResult === 'LOSS' ? 'Loss → re-check strategy' : 'Waiting for a valid setup'}</div>}
      </div>

      <button type="button" onClick={() => setDetailsOpen((open) => !open)} className="mt-3 flex min-h-12 w-full items-center justify-between rounded-xl border border-shafx-border bg-shafx-bg px-3 text-xs text-shafx-textMuted">
        <span>Advanced analysis</span>
        <ChevronDown className={detailsOpen ? 'h-4 w-4 rotate-180 transition-transform' : 'h-4 w-4 transition-transform'} />
      </button>

      {detailsOpen && <div className="mt-2 space-y-2 rounded-xl border border-shafx-border bg-shafx-bg p-3 text-[10px] text-shafx-textMuted">
        <div>Learning: {learning.summary}</div>
        <div>Research agreement: {research.agreement.toFixed(0)}%.</div>
        <div>Current price: {currentPrice}</div>
        <div>{riskModes[BOT_RISK_MODE].description}.</div>
        <div>Multi-timeframe context is used before a simulated order is considered.</div>
      </div>}

      <div className="mt-3 rounded-xl border border-shafx-warning/15 bg-shafx-warning/[0.035] p-3 text-[9px] leading-4 text-shafx-textMuted">
        <strong className="text-shafx-warning">Simulator only.</strong> This bot never sends broker orders. It creates SHAFX simulated positions and is not financial advice.
      </div>
    </section>
  )
}
