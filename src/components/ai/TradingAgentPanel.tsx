import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Bot, ChevronDown, Play, RefreshCw, ShieldCheck, Sparkles, Square, Wallet } from 'lucide-react'
import { analyzeLiquidity } from '../../engine/liquidity'
import { analyzeMarketStructure, findSwingPoints } from '../../engine/marketStructure'
import { analyzeSetup } from '../../engine/setup'
import { analyzeSupportResistance } from '../../engine/supportResistance'
import { buildTradingContext } from '../../engine/ai/context'
import { analyzeMultiTimeframeBias, buildAgentResearch, executeSimulationTrade, learnFromTrades, useMultiTimeframeCandles } from '../../engine/agent'
import { BOT_PLANS, cycleUnitsForSeconds, type BotPlan } from '../../engine/agent/botPlans'
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
  onBotOrder?: (order: TradeOrder) => void
  onBotClose?: (id: string) => void | Promise<void>
  onBotRunningChange?: (running: boolean) => void
  onReviewSetup?: () => void
  scanM1Candles?: OHLCV[]
}

type RiskMode = 'SAFE' | 'NORMAL' | 'RISK'
const riskModes: Record<RiskMode, { label: string; percent: number; description: string }> = {
  SAFE: { label: 'Safe', percent: 0.25, description: 'Smallest simulated risk' },
  NORMAL: { label: 'Normal', percent: 0.5, description: 'Balanced simulated risk' },
  RISK: { label: 'Risk', percent: 1, description: 'Higher simulated risk' },
}
type Phase = 'READY' | 'ANALYZING' | 'RUNNING'
const FAST_SCAN_TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15', 'M30']
const BOT_CYCLE_SECONDS = 5 as const
const BOT_RESULT_DELAY_MS = 4500 as const
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
  const [, setWins] = useState(0)
  const [losses, setLosses] = useState(0)
  const [cycles, setCycles] = useState(0)
  const [cycleUnits, setCycleUnits] = useState(0)
  const [scanNonce, setScanNonce] = useState(0)
  const [lastResult, setLastResult] = useState<'WIN' | 'LOSS' | 'WAIT' | null>(null)
  const [status, setStatus] = useState('Ready to scan')
  const [bias, setBias] = useState('Neutral')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [botPositionId, setBotPositionId] = useState<string | null>(null)
  const botCloseTimer = useRef<number | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const processedHistory = useRef(new Set<string>())
  const analysisTimer = useRef<number | null>(null)
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
    return FAST_SCAN_TIMEFRAMES.flatMap((scanTimeframe) => {
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
  }, [currentPrice, symbol, timeframeFrames])
  const activeBotScan = fastScanCandidates[0] ?? null

  const learning = useMemo(() => learnFromTrades(tradeHistory.filter((trade) => trade.status === 'closed').map((trade) => ({ symbol: trade.symbol, direction: trade.type, profit: trade.profit, riskRewardRatio: trade.riskRewardRatio }))), [tradeHistory])
  const research = useMemo(() => buildAgentResearch({ context: tradingContext, learning, multiTimeframe }), [learning, multiTimeframe, tradingContext])
  const setup = tradingContext.setup.preferredSetup
  const riskAmount = accountBalance * (riskModes[BOT_RISK_MODE].percent / 100)
  const parsedLotSize = Number(lotSize)
  const lotSizeValid = symbolSpec ? Number.isFinite(parsedLotSize) && parsedLotSize >= symbolSpec.minLotSize && parsedLotSize <= symbolSpec.maxLotSize && Math.abs((parsedLotSize / symbolSpec.lotStep) - Math.round(parsedLotSize / symbolSpec.lotStep)) < 1e-8 : false

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
    setLastResult(null)
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
    const profit = closed.profit ?? 0
    if (profit >= 0) {
      setWins((v) => v + 1)
      setLastResult('WIN')
      setStatus('Simulated profit — bot will analyze again on the next cycle')
    } else {
      setLosses((v) => {
        const next = v + 1
        setLastResult('LOSS')
        if (next >= 2) {
          setAutoTradingEnabled(false)
          setPhase('READY')
          setStatus('Stopped after 2 simulated losses — review the strategy')
        } else {
          setStatus('Simulated loss — bot will re-check the market before the next trade')
        }
        return next
      })
    }
  }, [botPositionId, tradeHistory])

  useEffect(() => {
    runBotCycleRef.current = async (): Promise<void> => {
    if (losses >= 2) return
    const units = cycleUnitsForSeconds(BOT_CYCLE_SECONDS)
    try {
      const response = await fetch('/api/bot/usage', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: runId ?? crypto.randomUUID(), units }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.ok) {
        setAutoTradingEnabled(false)
        setPhase('READY')
        setCycleUnits((previous) => Number(data.usedCycleUnits) || previous)
        setStatus(data.error || 'Bot daily allowance reached.')
        return
      }
      if (!runId && data.runId) setRunId(data.runId)
      setCycleUnits(Number(data.usedCycleUnits) || 0)
      setCycles((value) => value + 1)
      if (losses >= 2) return
      if (activePosition || botPositionId) {
        setStatus('Monitoring ' + (activePosition?.type ?? 'simulated') + ' position — waiting for its stop or target')
        return
      }
      if (!symbolSpec || !onBotOrder) {
        setStatus('Simulation engine is not ready for this market')
        return
      }
      if (!lotSizeValid) {
        setStatus('Choose a valid bot lot size before starting a cycle')
        return
      }
      const scan = activeBotScan
      setStatus(scan ? ('Scanning ' + scan.timeframe + ' • ' + symbol + '…') : ('Scanning M1/M5/M15/M30 • ' + symbol + '…'))
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
      if (!result.order) {
        setLastResult('WAIT')
        setStatus(bias + ': ' + result.decision.rationale)
        return
      }
      setBotPositionId(result.order.id)
      setLastResult(null)
      setStatus(result.order.type + ' ' + symbol + ' simulated at ' + result.order.entryPrice + ' — cycle will resolve within 5 seconds')
      onBotOrder(result.order)
      if (botCloseTimer.current) window.clearTimeout(botCloseTimer.current)
      botCloseTimer.current = window.setTimeout(() => {
        void onBotClose?.(result.order.id)
      }, BOT_RESULT_DELAY_MS)
    } catch {
      setAutoTradingEnabled(false)
      setPhase('READY')
      setStatus('Unable to verify bot cycle allowance. Try again.')
    }
    }

    return () => { runBotCycleRef.current = null }
  }, [accountBalance, accountCurrency, activeBotScan, activePosition, bias, botPositionId, conversionRate, learning, losses, lotSizeValid, multiTimeframe, onBotClose, onBotOrder, parsedLotSize, research, runId, setup, symbol, symbolSpec, tradingContext])

  useEffect(() => {
    if (phase !== 'RUNNING') return
    const kickoff = window.setTimeout(() => { void runBotCycleRef.current?.() }, 250)
    const timer = window.setInterval(() => { void runBotCycleRef.current?.() }, BOT_CYCLE_SECONDS * 1000)
    return () => {
      window.clearTimeout(kickoff)
      window.clearInterval(timer)
    }
  }, [phase])

  useEffect(() => () => {
    if (analysisTimer.current) window.clearTimeout(analysisTimer.current)
    if (botCloseTimer.current) window.clearTimeout(botCloseTimer.current)
    onBotRunningChange?.(false)
  }, [onBotRunningChange])

  const startAutomaticTrading = (): void => {
    if (!symbolSpec || autoTradingEnabled) return
    if (analysisTimer.current) window.clearTimeout(analysisTimer.current)
    setLastResult(null)
    setScanNonce((value) => value + 1)
    setAutoTradingEnabled(true)
    setPhase('ANALYZING')
    setStatus('Starting automatic trading for ' + symbol + '…')
    analysisTimer.current = window.setTimeout(() => {
      setPhase('RUNNING')
      setStatus('Automatic trading is ON. The bot will scan M1, M5, M15 and M30 on ' + symbol + ' and place simulated trades when a valid setup qualifies.')
    }, 650)
  }

  const stopAutomaticTrading = (): void => {
    if (analysisTimer.current) window.clearTimeout(analysisTimer.current)
    setAutoTradingEnabled(false)
    setPhase('READY')
    setStatus('Automatic trading is OFF. No new bot trades will be opened.')
  }

  const rescanBot = (): void => {
    if (analysisTimer.current) window.clearTimeout(analysisTimer.current)
    setLastResult(null)
    setScanNonce((value) => value + 1)
    setPhase('ANALYZING')
    setStatus(activePosition ? 'Refreshing market structure, liquidity and setup while monitoring the existing simulated position.' : 'Refreshing M1/M5/M15/M30 market structure, liquidity and setup…')
    analysisTimer.current = window.setTimeout(() => {
      setPhase('READY')
      setStatus('Analysis refreshed. Start automatic trading when you want the bot to place simulated trades.')
    }, 650)
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
          onClick={autoTradingEnabled ? stopAutomaticTrading : startAutomaticTrading}
          className={autoTradingEnabled ? 'mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-shafx-danger/30 bg-shafx-danger/10 px-3 text-[10px] font-semibold text-shafx-danger active:bg-shafx-danger/20 disabled:opacity-40' : 'mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-shafx-accent px-3 text-[10px] font-semibold text-white active:opacity-90 disabled:opacity-40'}
        >
          {autoTradingEnabled ? <Square className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
          {autoTradingEnabled ? 'Stop automatic trading' : 'Start automatic trading'}
        </button>
        <div className="mt-2 grid grid-cols-3 gap-2 text-[9px] text-shafx-textMuted">
          <div className="rounded-lg border border-shafx-border bg-shafx-bg px-2 py-2"><span className="block">Market</span><strong className="mt-0.5 block font-mono text-shafx-text">{symbol}</strong></div>
          <div className="rounded-lg border border-shafx-border bg-shafx-bg px-2 py-2"><span className="block">Cycle</span><strong className="mt-0.5 block font-mono text-shafx-text">5s</strong></div>
          <div className="rounded-lg border border-shafx-border bg-shafx-bg px-2 py-2"><span className="block">Mode</span><strong className="mt-0.5 block text-shafx-text">Simulator</strong></div>
        </div>
      </section>

      <div className="mt-3 rounded-xl border border-shafx-border bg-shafx-bg p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-shafx-textMuted">Market read</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <div className="text-xl font-semibold">{phase === 'ANALYZING' ? 'Analyzing…' : bias}</div>
              <span className="rounded-lg border border-shafx-accent/20 bg-shafx-accent/5 px-2.5 py-1 text-[9px] font-semibold text-shafx-accent">{timeframe}</span>
              <span className="rounded-lg border border-shafx-border px-2.5 py-1 text-[9px] text-shafx-textMuted">{research.agreement.toFixed(0)}% evidence agreement</span>
            </div>
          </div>
          <Sparkles className="h-5 w-5 shrink-0 text-shafx-accent" />
        </div>
        <p className="mt-2 text-[11px] leading-5 text-shafx-textMuted">{setup ? 'Candidate ' + setup.direction + ' around ' + setup.entryPrice + '. ' + setup.rationale.join(' ') : 'No clean setup is available. The bot will wait rather than force a trade.'}</p>
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
        {onReviewSetup && <button type="button" onClick={onReviewSetup} className="mt-2 min-h-10 w-full rounded-xl border border-shafx-border bg-shafx-surface px-3 text-[10px] font-semibold text-shafx-textMuted active:bg-shafx-accent/10">Review setup in Market</button>}
      </div>

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
          <p className="mt-3 text-[9px] leading-4 text-shafx-textMuted">Risk mode and bot lot size are automatic here. Use the Open Trade Workshop when you need manual trade sizing.</p>
        </section>

        <section className="rounded-xl border border-shafx-border bg-shafx-bg p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div><div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-shafx-textMuted">Bot cycle</div><div className="mt-1 text-sm font-semibold">5s automatic scan</div></div>
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
        <div className="flex items-center justify-between gap-3"><span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-shafx-textMuted">Current status</span><span className="text-[9px] text-shafx-textMuted">Scans {cycles}</span></div>
        <p className="mt-1.5 text-[11px] leading-5 text-shafx-text">{status}</p><p className="mt-1 text-[9px] text-shafx-textMuted">Refresh analysis only rebuilds the market read. Start automatic trading to begin the 5-second bot cycles.</p>
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
