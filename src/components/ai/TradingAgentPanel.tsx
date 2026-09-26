import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Bot, Play, RefreshCw, ShieldCheck, Sparkles, Square } from 'lucide-react'
import { analyzeLiquidity } from '../../engine/liquidity'
import { analyzeMarketStructure, findSwingPoints } from '../../engine/marketStructure'
import { analyzeSetup } from '../../engine/setup'
import { calculateRisk } from '../../engine/risk/riskCalculator'
import { analyzeSupportResistance } from '../../engine/supportResistance'
import { buildTradingContext } from '../../engine/ai/context'
import { analyzeMultiTimeframeBias, buildAgentResearch, executeDerivTrade, learnFromTrades, useMultiTimeframeCandles } from '../../engine/agent'
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
  derivConnectionId?: string
  derivAccountId?: string
  derivEnvironment?: 'demo' | 'live'
  symbolSpec?: SymbolSpec | null
  conversionRate?: number
  botPlan?: BotPlan
  botOrderIds?: string[]
  onBotOrder?: (order: TradeOrder) => void
  onBotClose?: (id: string, exitPrice?: number) => void | Promise<TradeOrder | null>
  onBotRunningChange?: (running: boolean) => void
  onReviewSetup?: (setup?: import('../../engine/setup/types').SetupCandidate | null) => void
  onReviewOpportunity?: (timeframe: Timeframe, setup: import('../../engine/setup/types').SetupCandidate | null) => void
  scanM1Candles?: OHLCV[]
  botAutostartKey?: string
}

type RiskMode = 'SAFE' | 'NORMAL' | 'EXTREME'
const riskModes: Record<RiskMode, { label: string; percent: number; description: string }> = {
  SAFE: { label: 'Safe', percent: 0.25, description: 'Conservative broker risk' },
  NORMAL: { label: 'Normal', percent: 0.5, description: 'Balanced broker risk' },
  EXTREME: { label: 'Extreme', percent: 1, description: 'Highest broker risk profile' },
}
type Phase = 'READY' | 'ANALYZING' | 'RUNNING'
const SCAN_TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1']
const SCAN_SEQUENCE: Timeframe[] = ['M1', 'M5', 'M15', 'M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1']
const TIMEFRAME_SCAN_BONUS: Record<Timeframe, number> = { M1: 18, M5: 14, M15: 10, M30: 5, H1: 2, H4: 0, D1: -1, W1: -2 }
const BOT_CYCLE_SECONDS = 10 as const
const BOT_RESULT_DELAY_MS = BOT_CYCLE_SECONDS * 1000
const BOT_START_DELAY_MS = 1000 as const
const BOT_RESULT_DISPLAY_MS = 1000 as const

const buildFallbackSetup = (frameCandles: OHLCV[], structureBias: 'Bullish' | 'Bearish' | 'Sideways' | 'Unclear', symbol: string, currentPrice: number, precision: number): import('../../engine/setup/types').SetupCandidate | null => {
  if ((structureBias !== 'Bullish' && structureBias !== 'Bearish') || frameCandles.length < 8) return null
  const recent = frameCandles.slice(-8)
  const latest = recent[recent.length - 1]
  if (!latest) return null
  const buy = structureBias === 'Bullish'
  const directionSign = buy ? 1 : -1
  const alignedBars = recent.filter((candle) => {
    const bodyDirection = Math.sign(candle.close - candle.open)
    return bodyDirection === directionSign || bodyDirection === 0
  }).length
  const consistency = alignedBars / recent.length
  const prior = recent[0]?.close ?? latest.close
  const move = latest.close - prior
  const pipSize = symbol.includes('JPY') ? 0.01 : 0.0001
  const stopDistance = pipSize * 30
  const rewardDistance = pipSize * 50
  const entryPrice = Number((latest.close || currentPrice).toFixed(precision))
  const confidence = Math.min(89, Math.max(55, Math.round(54 + consistency * 22 + (Math.sign(move) === directionSign ? 7 : 0))))
  return {
    direction: buy ? 'BUY' : 'SELL',
    status: 'candidate',
    quality: consistency >= 0.75 ? 'moderate' : 'weak',
    entryPrice,
    stopLoss: Number((entryPrice + (buy ? -stopDistance : stopDistance)).toFixed(precision)),
    takeProfit: Number((entryPrice + (buy ? rewardDistance : -rewardDistance)).toFixed(precision)),
    riskRewardRatio: 50 / 30,
    riskDistance: stopDistance,
    rewardDistance,
    confidence,
    rationale: ['Market structure is directional on this timeframe.', `Recent candle direction aligned ${Math.round(consistency * 100)}% with the structural flow.`],
    invalidation: 'The stop loss invalidates this setup.',
    liquidityTarget: null,
  }
}

const buildScanCandidates = (
  frames: Partial<Record<Timeframe, OHLCV[]>>,
  symbol: string,
  currentPrice: number,
) => {
  const qualityWeight: Record<'weak' | 'moderate' | 'strong', number> = { weak: 1, moderate: 2, strong: 3 }
  return SCAN_TIMEFRAMES.flatMap((scanTimeframe) => {
    const frameCandles = frames[scanTimeframe] ?? []
    if (frameCandles.length < 5) return []
    const swings = findSwingPoints(frameCandles, 2)
    const structure = analyzeMarketStructure(frameCandles, 2)
    const tolerance = symbol.includes('JPY') ? 0.1 : 0.001
    const supportResistance = analyzeSupportResistance(frameCandles, tolerance, swings)
    const liquidity = analyzeLiquidity(frameCandles, swings, tolerance)
    const framePrice = frameCandles[frameCandles.length - 1]?.close ?? currentPrice
    const setupResult = analyzeSetup({ currentPrice: framePrice, structure, supportResistance, liquidity })
    const preferredSetup = setupResult.preferredSetup ?? buildFallbackSetup(frameCandles, structure.bias, symbol, framePrice, symbol.includes('JPY') ? 3 : 5)
    if (!preferredSetup || preferredSetup.status !== 'candidate') return []
    const context = buildTradingContext(symbol, scanTimeframe, frameCandles, structure, supportResistance, liquidity, {
      ...setupResult,
      preferredSetup,
    })
    return [{
      timeframe: scanTimeframe,
      setup: preferredSetup,
      context,
      score: preferredSetup.confidence + qualityWeight[preferredSetup.quality] * 5 + TIMEFRAME_SCAN_BONUS[scanTimeframe],
    }]
  }).sort((a, b) => b.score - a.score)
}
const buildFastBotCandidate = (
  frames: Partial<Record<Timeframe, OHLCV[]>>,
  symbol: string,
  currentPrice: number,
) => {
  const all = buildScanCandidates(frames, symbol, currentPrice)
  const fast = all.filter((candidate) => candidate.timeframe === 'M1' || candidate.timeframe === 'M5' || candidate.timeframe === 'M15')
  if (fast.length === 0) return all[0] ?? null
  const m1 = frames.M1 ?? []
  const latest = m1[m1.length - 1]?.close
  const previous = m1[m1.length - 2]?.close
  const microDirection = typeof latest === 'number' && typeof previous === 'number' ? Math.sign(latest - previous) : 0
  return [...fast]
    .map((candidate) => ({
      candidate,
      score: candidate.score + (
        microDirection > 0 && candidate.setup.direction === 'BUY'
          ? 28
          : microDirection < 0 && candidate.setup.direction === 'SELL'
            ? 28
            : microDirection === 0
              ? 0
              : -18
      ),
    }))
    .sort((a, b) => b.score - a.score)[0]?.candidate ?? fast[0]
}

interface CircularProgressProps {
  progress: number
  label: string
  value: string
}

function CircularProgress({ progress, label, value }: CircularProgressProps) {
  const bounded = Math.max(0, Math.min(100, progress))
  const radius = 27
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - bounded / 100)

  return (
    <div className="relative h-20 w-20 shrink-0" aria-label={label}>
      <svg viewBox="0 0 64 64" className="-rotate-90 h-20 w-20">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="currentColor" strokeWidth="4" className="text-shafx-border" />
        <circle cx="32" cy="32" r={radius} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="text-shafx-accent transition-[stroke-dashoffset] duration-100" strokeDasharray={circumference} strokeDashoffset={offset} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-sm font-bold text-shafx-text">{value}</span>
        <span className="font-mono text-[7px] uppercase tracking-[0.14em] text-shafx-textMuted">{label}</span>
      </div>
    </div>
  )
}

export function TradingAgentPanel({
  symbol,
  timeframe,
  candles,
  currentPrice,
  activePosition,
  tradeHistory,
  accountBalance = 10000,
  accountCurrency = 'USD',
  derivConnectionId = '',
  derivAccountId = '',
  derivEnvironment = 'demo',
  symbolSpec = null,
  conversionRate,
  botPlan = 'FREE',
  botOrderIds = [],
  onBotOrder,
  onBotClose,
  onBotRunningChange,
  onReviewSetup,
  onReviewOpportunity,
  scanM1Candles = [],
  botAutostartKey = 'shafx-bot-autostart',
}: Props) {
  const plan = BOT_PLANS[botPlan]
  const readStoredLotSize = (): string => typeof window !== 'undefined' ? window.sessionStorage.getItem('shafx-broker-lot-size') || '0.10' : '0.10'
  const [lotSize, setLotSize] = useState(readStoredLotSize)
  const [phase, setPhase] = useState<Phase>('READY')
  const [scanPhase, setScanPhase] = useState<Phase>('READY')
  const [botScanProgress, setBotScanProgress] = useState(0)
  const [autoTradingEnabled, setAutoTradingEnabled] = useState(false)
  const [riskMode, setRiskMode] = useState<RiskMode>('SAFE')
  const [totalWon, setTotalWon] = useState(0)
  const [totalLost, setTotalLost] = useState(0)
  const [wins, setWins] = useState(0)
  const [losses, setLosses] = useState(0)
  const [cycleUnits, setCycleUnits] = useState(0)
  const dailyLimitReached = plan.maxDailyCycleUnits !== null && cycleUnits >= plan.maxDailyCycleUnits
  const [unitRound, setUnitRound] = useState(0)
  const [pendingUnitCompletion, setPendingUnitCompletion] = useState(false)
  const [tradeCloseAt, setTradeCloseAt] = useState<number | null>(null)
  const [tradeSecondsLeft, setTradeSecondsLeft] = useState(0)
  const [scanFrame, setScanFrame] = useState<Timeframe>('M1')
  const [scanSeconds, setScanSeconds] = useState(0)
  const [scanComplete, setScanComplete] = useState(false)
  const [scanNonce, setScanNonce] = useState(0)
  const [scanSnapshot, setScanSnapshot] = useState(0)
  const [selectedOpportunityTimeframe, setSelectedOpportunityTimeframe] = useState<Timeframe | null>(null)
  const [lastResult, setLastResult] = useState<'WIN' | 'LOSS' | 'WAIT' | null>(null)
  const [lastProfit, setLastProfit] = useState<number | null>(null)
  const [status, setStatus] = useState('Ready to scan')
  const [botPositionId, setBotPositionId] = useState<string | null>(null)
  const [botDisplayedOrder, setBotDisplayedOrder] = useState<TradeOrder | null>(null)
  const [botRunLotSize, setBotRunLotSize] = useState<number | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const botRunLotSizeRef = useRef<number | null>(null)
  const currentPriceRef = useRef(currentPrice)
  const processedHistory = useRef(new Set<string>())
  const analysisTimer = useRef<number | null>(null)
  const scanInterval = useRef<number | null>(null)
  const marketScanTimer = useRef<number | null>(null)
  const tradeCloseTimer = useRef<number | null>(null)
  const nextRoundTimer = useRef<number | null>(null)
  const runInFlightRef = useRef(false)
  const runBotCycleRef = useRef<(() => Promise<void>) | null>(null)
  const resumeStartedRef = useRef(false)
  const [resumePending, setResumePending] = useState(false)

  const tradingContext = useMemo(() => {
    const swings = findSwingPoints(candles, 2)
    const structure = analyzeMarketStructure(candles, 2)
    const tolerance = symbol.includes('JPY') ? 0.1 : 0.001
    const supportResistance = analyzeSupportResistance(candles, tolerance, swings)
    const liquidity = analyzeLiquidity(candles, swings, tolerance)
    const setup = analyzeSetup({ currentPrice: candles[candles.length - 1]?.close ?? currentPrice, structure, supportResistance, liquidity })
    return buildTradingContext(symbol, timeframe, candles, structure, supportResistance, liquidity, setup)
  }, [candles, currentPrice, symbol, timeframe])

  const timeframeFrames = useMultiTimeframeCandles(symbol, timeframe, candles, scanM1Candles)
  const multiTimeframe = useMemo(() => analyzeMultiTimeframeBias(timeframeFrames), [timeframeFrames])
  const fastScanCandidates = useMemo(
    () => buildScanCandidates(timeframeFrames, symbol, currentPrice),
    [currentPrice, scanNonce, symbol, timeframeFrames],
  )
  const activeBotScan = fastScanCandidates[0] ?? null
  const marketReadRows = useMemo(() => SCAN_TIMEFRAMES.map((scanTimeframe) => {
    const frameCandles = timeframeFrames[scanTimeframe] ?? []
    if (frameCandles.length < 5) return { timeframe: scanTimeframe, bias: 'Unclear' as const, structure: 'Insufficient data', flow: 'UNCLEAR', directionalOpportunity: false, executableSetup: null }
    const swings = findSwingPoints(frameCandles, 2)
    const structure = analyzeMarketStructure(frameCandles, 2)
    const tolerance = symbol.includes('JPY') ? 0.1 : 0.001
    const supportResistance = analyzeSupportResistance(frameCandles, tolerance, swings)
    const liquidity = analyzeLiquidity(frameCandles, swings, tolerance)
    const framePrice = frameCandles[frameCandles.length - 1]?.close ?? currentPrice
    const setupResult = analyzeSetup({ currentPrice: framePrice, structure, supportResistance, liquidity })
    const executableSetup = (structure.bias === 'Bullish' || structure.bias === 'Bearish')
      ? (setupResult.preferredSetup ?? buildFallbackSetup(frameCandles, structure.bias, symbol, framePrice, symbolSpec?.pricePrecision ?? (symbol.includes('JPY') ? 3 : 5)))
      : null
    const flow = structure.bias === 'Bullish' ? 'UPFLOW' : structure.bias === 'Bearish' ? 'DOWNFLOW' : structure.bias === 'Sideways' ? 'RANGE' : 'UNCLEAR'
    return {
      timeframe: scanTimeframe,
      bias: structure.bias,
      structure: structure.structureType,
      flow,
      directionalOpportunity: Boolean(executableSetup),
      executableSetup,
    }
  }), [currentPrice, symbol, timeframeFrames, scanSnapshot])
  const executableOpportunities = marketReadRows.filter((row) => row.executableSetup)
  const topOpportunities = executableOpportunities
    .slice()
    .sort((a, b) => (b.executableSetup?.confidence ?? 0) - (a.executableSetup?.confidence ?? 0))
    .slice(0, 2)
  const activeBotOrder = activePosition && botOrderIds.includes(activePosition.id) ? activePosition : null

  const learning = useMemo(() => learnFromTrades(tradeHistory.filter((trade) => trade.status === 'closed').map((trade) => ({ symbol: trade.symbol, direction: trade.type, profit: trade.profit, riskRewardRatio: trade.riskRewardRatio }))), [tradeHistory])
  const research = useMemo(() => buildAgentResearch({ context: tradingContext, learning, multiTimeframe }), [learning, multiTimeframe, tradingContext])
  const setup = tradingContext.setup.preferredSetup
  const displayedUnitNumber = pendingUnitCompletion ? Math.max(1, cycleUnits) : Math.max(1, cycleUnits + 1)
  const selectedOpportunity = topOpportunities.find((row) => row.timeframe === selectedOpportunityTimeframe) ?? topOpportunities[0] ?? null
  const parsedLotSize = Number(lotSize)
  const botRiskSetup = activeBotScan?.setup ?? setup
  const botRiskCalc = useMemo(() => {
    if (!symbolSpec || !botRiskSetup) return null
    return calculateRisk({ accountBalance, accountCurrency, riskPercent: riskModes[riskMode].percent, side: botRiskSetup.direction, entryPrice: botRiskSetup.entryPrice, stopLoss: botRiskSetup.stopLoss, takeProfit: botRiskSetup.takeProfit, symbolSpec, conversionRate })
  }, [accountBalance, accountCurrency, botRiskSetup, conversionRate, riskMode, symbolSpec])
  const accountStakeCeiling = Number.isFinite(accountBalance) && accountBalance > 0 ? Math.max(symbolSpec?.minLotSize ?? 0.01, accountBalance) : 0
  const lotFitsAccount = Boolean(accountStakeCeiling > 0 && parsedLotSize > 0 && parsedLotSize <= accountStakeCeiling + 1e-8)
  const lotSizeValid = symbolSpec ? Number.isFinite(parsedLotSize) && parsedLotSize >= symbolSpec.minLotSize && parsedLotSize <= symbolSpec.maxLotSize && Math.abs((parsedLotSize / symbolSpec.lotStep) - Math.round(parsedLotSize / symbolSpec.lotStep)) < 1e-8 : false

  useEffect(() => {
    currentPriceRef.current = currentPrice
  }, [currentPrice])

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
    window.sessionStorage.setItem('shafx-lot-size', lotSize)
    window.dispatchEvent(new CustomEvent<string>('shafx-lot-size', { detail: lotSize }))
  }, [lotSize])


  useEffect(() => {
    onBotRunningChange?.(autoTradingEnabled && (phase === 'RUNNING' || phase === 'ANALYZING'))
  }, [autoTradingEnabled, onBotRunningChange, phase])

  useEffect(() => {
    setAutoTradingEnabled(false)
    setPhase('READY')
    setScanPhase('READY')
    setBotPositionId(null)
    setBotDisplayedOrder(null)
    botRunLotSizeRef.current = null
    setBotRunLotSize(null)
    setUnitRound(0)
    setPendingUnitCompletion(false)
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
    if (phase !== 'ANALYZING') {
      if (phase === 'RUNNING') setBotScanProgress(100)
      else setBotScanProgress(0)
      return
    }
    const startedAt = Date.now()
    const updateProgress = (): void => {
      setBotScanProgress(Math.min(100, ((Date.now() - startedAt) / BOT_START_DELAY_MS) * 100))
    }
    updateProgress()
    const timer = window.setInterval(updateProgress, 50)
    return () => window.clearInterval(timer)
  }, [phase])


  useEffect(() => {
    runBotCycleRef.current = async (): Promise<void> => {
      if (runInFlightRef.current) return
      runInFlightRef.current = true

      try {
        if (!autoTradingEnabled || phase !== 'RUNNING') return
        if (resumePending && !activeBotOrder && !botPositionId && !botDisplayedOrder) setResumePending(false)
        if (activeBotOrder || botPositionId || botDisplayedOrder) {
          setStatus('MONITORING • waiting for the current broker trade round to close')
          return
        }
        if (!symbolSpec || !onBotOrder || !derivConnectionId || !derivAccountId) {
          setStatus('BOT ERROR • connect a Deriv account before trading')
          return
        }
        if (!lotSizeValid) {
          setStatus('BOT BLOCKED • choose a valid lot size for ' + symbol)
          setAutoTradingEnabled(false)
          setPhase('READY')
          return
        }
        if (!lotFitsAccount) {
          setStatus('BOT BLOCKED • ' + parsedLotSize.toFixed(2) + ' lot is above the account-affordable ceiling of ' + accountStakeCeiling.toFixed(2) + ' lot')
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

        const nextRound = unitRound + 1
        const botLotSize = botRunLotSizeRef.current ?? parsedLotSize
        setLastProfit(null)
        const unitNumber = unitRound === 0 ? Math.min(cycleUnits + 1, plan.maxDailyCycleUnits ?? cycleUnits + 1) : displayedUnitNumber

        const scan = buildFastBotCandidate(timeframeFrames, symbol, currentPrice)
        setLastResult(null)
        setStatus(scan
          ? 'BOT ANALYSIS • ' + scan.setup.direction + ' on ' + scan.timeframe + ' • confidence ' + scan.setup.confidence + '%'
          : 'BOT ANALYSIS • using the current independent broker context…')

        const result = await executeDerivTrade({
          context: scan
            ? { tradingContext: scan.context, preferredSetup: scan.setup, hasOpenPosition: false, permission: 'AUTONOMOUS_TRADING', multiTimeframe, learning, research }
            : { tradingContext, preferredSetup: setup, hasOpenPosition: false, permission: 'AUTONOMOUS_TRADING', multiTimeframe, learning, research },
          accountBalance,
          accountCurrency,
          riskPercent: riskModes[riskMode].percent,
          symbolSpec,
          conversionRate,
          lotSize: botLotSize,
          connectionId: derivConnectionId,
          accountId: derivAccountId,
          environment: derivEnvironment,
        })

        const order = result.order
        if (!order) {
          setLastResult('WAIT')
          setStatus('WAIT • the risk/setup gate did not produce a valid simulated order')
          return
        }

        setUnitRound(nextRound)
        setBotPositionId(order.id)
        setBotDisplayedOrder(order)
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
          const exitPrice = currentPriceRef.current

          const closed = await onBotClose?.(order.id, exitPrice)
          if (!closed) {
            setStatus('BOT ERROR • round result was calculated but the broker position did not close.')
            setLastResult('WAIT')
            setBotDisplayedOrder(order)
            setBotPositionId(order.id)
            setTradeCloseAt(null)
            setTradeSecondsLeft(0)
            return
          }

          const closedProfit = closed.profit ?? profit
          const result = closedProfit >= 0 ? 'WIN' : 'LOSS'
          processedHistory.current.add(order.id)
          setBotDisplayedOrder(null)
          setBotPositionId(null)
          setTradeCloseAt(null)
          setTradeSecondsLeft(0)
          setLastProfit(closedProfit)
          setLastResult(result)
          if (closedProfit >= 0) {
            setWins((value) => value + 1)
            setTotalWon((value) => Number((value + closedProfit).toFixed(2)))
            setStatus('BOT WIN • ' + order.type + ' ' + order.symbol + ' • +' + closedProfit.toFixed(2) + ' ' + accountCurrency + ' • next cycle')
          } else {
            setLosses((value) => value + 1)
            setTotalLost((value) => Number((value + Math.abs(closedProfit)).toFixed(2)))
            setStatus('BOT LOSS • ' + order.type + ' ' + order.symbol + ' • ' + closedProfit.toFixed(2) + ' ' + accountCurrency + ' • next cycle')
          }

          const sessionRunId = runId ?? 'v3-' + crypto.randomUUID()
          void fetch('/api/bot/usage', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ runId: sessionRunId }),
          }).then(async (response) => {
            const data = await response.json().catch(() => ({}))
            if (response.ok && data.ok) {
              const serverUsedUnits = Number.isFinite(Number(data.usedCycleUnits)) ? Number(data.usedCycleUnits) : cycleUnits
              const serverRound = Number.isFinite(Number(data.currentUnitRound)) ? Number(data.currentUnitRound) : nextRound
              setRunId(sessionRunId)
              setCycleUnits(serverUsedUnits)
              setUnitRound(serverRound)
              if (data.completedUnit) {
                setPendingUnitCompletion(true)
                setAutoTradingEnabled(false)
                setPhase('READY')
                setStatus('UNIT ' + unitNumber + ' COMPLETE 5/5 • TAP RUN UNIT ' + (serverUsedUnits + 1))
              }
            }
          }).catch(() => undefined)

          if (nextRound >= BOT_CYCLES_PER_UNIT) {
            setPendingUnitCompletion(true)
            setAutoTradingEnabled(false)
            setPhase('READY')
            try { window.localStorage.removeItem(botAutostartKey) } catch { /* storage may be unavailable */ }
            setStatus((closedProfit >= 0 ? 'BOT WIN • ' : 'BOT LOSS • ') + closedProfit.toFixed(2) + ' ' + accountCurrency + ' • UNIT ' + unitNumber + ' COMPLETE 5/5 • TAP RUN UNIT ' + (cycleUnits + 1))
          }
        }, BOT_RESULT_DELAY_MS)
      } catch (error) {
        setAutoTradingEnabled(false)
        setPhase('READY')
        setStatus('BOT ERROR • ' + (error instanceof Error ? error.message : 'Unable to open broker trade'))
      } finally {
        runInFlightRef.current = false
      }
    }

    return () => { runBotCycleRef.current = null }
  }, [accountBalance, accountCurrency, activeBotOrder, activePosition, autoTradingEnabled, botPositionId, conversionRate, cycleUnits, displayedUnitNumber, learning, lotSizeValid, multiTimeframe, onBotClose, onBotOrder, parsedLotSize, pendingUnitCompletion, phase, plan.maxDailyCycleUnits, research, resumePending, runId, setup, symbol, symbolSpec, timeframeFrames, tradingContext, unitRound])
  useEffect(() => {
    if (phase !== 'RUNNING' || !autoTradingEnabled || pendingUnitCompletion) return
    if (botDisplayedOrder || botPositionId) return

    let cancelled = false
    const scheduleNextRound = (delay: number): void => {
      if (nextRoundTimer.current) window.clearTimeout(nextRoundTimer.current)
      const timer = window.setTimeout(async () => {
        if (cancelled) return
        await runBotCycleRef.current?.()
      }, delay)
      nextRoundTimer.current = timer
    }

    scheduleNextRound(lastResult ? BOT_RESULT_DISPLAY_MS : BOT_START_DELAY_MS)
    return () => {
      cancelled = true
      if (nextRoundTimer.current) {
        window.clearTimeout(nextRoundTimer.current)
        nextRoundTimer.current = null
      }
    }
  }, [autoTradingEnabled, botDisplayedOrder, botPositionId, lastResult, pendingUnitCompletion, phase])

  useEffect(() => {
    if (resumeStartedRef.current) return
    resumeStartedRef.current = true
    let cancelled = false
    const resume = async (): Promise<void> => {
      if (typeof window === 'undefined' || window.localStorage.getItem(botAutostartKey) !== '1') return
      try {
        const response = await fetch('/api/bot/usage', { method: 'GET', credentials: 'same-origin', cache: 'no-store' })
        const data = await response.json().catch(() => ({}))
        if (cancelled || !response.ok || !data.ok) return
        const serverUsedUnits = Number.isFinite(Number(data.usedCycleUnits)) ? Number(data.usedCycleUnits) : 0
        const serverRound = Number.isFinite(Number(data.currentUnitRound)) ? Number(data.currentUnitRound) : 0
        if (serverRound >= BOT_CYCLES_PER_UNIT) return
        setCycleUnits(serverUsedUnits)
        setUnitRound(serverRound)
        setPendingUnitCompletion(false)
            botRunLotSizeRef.current = parsedLotSize
        setBotRunLotSize(parsedLotSize)
        setLastResult(null)
        setAutoTradingEnabled(true)
        setPhase('ANALYZING')
        setResumePending(true)
        setStatus('BOT RESUMING • restoring Unit ' + (serverUsedUnits + 1) + ' Round ' + (serverRound + 1) + '…')
        if (analysisTimer.current) window.clearTimeout(analysisTimer.current)
        analysisTimer.current = window.setTimeout(() => {
          if (cancelled) return
          setPhase('RUNNING')
          setStatus('BOT RUNNING • resumed 10-second cycle')
        }, BOT_START_DELAY_MS)
      } catch {
        // Keep the saved run intent so a later reload can retry cleanly.
      }
    }
    void resume()
    return () => { cancelled = true }
  }, [botAutostartKey, parsedLotSize])

  useEffect(() => {
    if (!resumePending || !autoTradingEnabled || phase !== 'RUNNING' || !activeBotOrder) return
    setResumePending(false)
    setBotPositionId(activeBotOrder.id)
    setBotDisplayedOrder(activeBotOrder)
    setTradeCloseAt(Date.now() + BOT_RESULT_DELAY_MS)
    setTradeSecondsLeft(BOT_CYCLE_SECONDS)
    setStatus('BOT RESUMING • settling restored trade, then continuing…')
    if (tradeCloseTimer.current) window.clearTimeout(tradeCloseTimer.current)
    tradeCloseTimer.current = window.setTimeout(async () => {
      const closed = await onBotClose?.(activeBotOrder.id)
      if (!closed) return
      const profit = closed.profit ?? 0
      setLastProfit(profit)
      setLastResult(profit >= 0 ? 'WIN' : 'LOSS')
      if (profit >= 0) {
        setWins((value) => value + 1)
        setTotalWon((value) => Number((value + profit).toFixed(2)))
      } else {
        setLosses((value) => value + 1)
        setTotalLost((value) => Number((value + Math.abs(profit)).toFixed(2)))
      }
      setBotPositionId(null)
      setBotDisplayedOrder(null)
      setTradeCloseAt(null)
      setTradeSecondsLeft(0)
      setPhase('RUNNING')
      setAutoTradingEnabled(true)
      setStatus('BOT ' + (profit >= 0 ? 'WIN' : 'LOSS') + ' • restored round settled • next cycle starting…')
      void fetch('/api/bot/usage', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: runId ?? 'v3-' + crypto.randomUUID() }),
      }).then(async (response) => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok || !data.ok) return
        const used = Number.isFinite(Number(data.usedCycleUnits)) ? Number(data.usedCycleUnits) : cycleUnits
        const round = Number.isFinite(Number(data.currentUnitRound)) ? Number(data.currentUnitRound) : unitRound + 1
        setCycleUnits(used)
        setUnitRound(round)
        if (data.completedUnit) {
          setPendingUnitCompletion(true)
          setAutoTradingEnabled(false)
          setPhase('READY')
          try { window.localStorage.removeItem(botAutostartKey) } catch { /* storage may be unavailable */ }
          setStatus('UNIT COMPLETE 5/5 • TAP RUN UNIT ' + (used + 1))
        }
      }).catch(() => undefined)
    }, BOT_RESULT_DELAY_MS)
  }, [activeBotOrder, autoTradingEnabled, onBotClose, phase, resumePending, runId])
  useEffect(() => () => {
    if (analysisTimer.current) window.clearTimeout(analysisTimer.current)
    if (marketScanTimer.current) window.clearTimeout(marketScanTimer.current)
    if (scanInterval.current) window.clearInterval(scanInterval.current)
    if (nextRoundTimer.current) window.clearTimeout(nextRoundTimer.current)
    if (tradeCloseTimer.current) window.clearTimeout(tradeCloseTimer.current)
    onBotRunningChange?.(false)
  }, [onBotRunningChange])

  const startAutomaticTrading = (): void => {
    if (!symbolSpec || autoTradingEnabled) return
    try { window.localStorage.setItem(botAutostartKey, '1') } catch { /* storage may be unavailable */ }
    if (cycleUnits >= (plan.maxDailyCycleUnits ?? Number.MAX_SAFE_INTEGER)) {
      setStatus('Daily bot units are exhausted.')
      return
    }
    if (analysisTimer.current) window.clearTimeout(analysisTimer.current)
    setPendingUnitCompletion(false)
    botRunLotSizeRef.current = parsedLotSize
    setBotRunLotSize(parsedLotSize)
    setTotalWon(0)
    setTotalLost(0)
    setLastResult(null)
    setBotScanProgress(0)
    setAutoTradingEnabled(true)
    setPhase('ANALYZING')
    setStatus('BOT SCAN • checking balance, risk limit and all timeframes independently…')
    analysisTimer.current = window.setTimeout(() => {
      setPhase('RUNNING')
      setStatus('BOT RUNNING • 10-second simulated round. Circle fills → WIN/LOSS → next cycle.')
      if (nextRoundTimer.current) window.clearTimeout(nextRoundTimer.current)
      nextRoundTimer.current = window.setTimeout(() => {
        void runBotCycleRef.current?.()
      }, 75)
    }, BOT_START_DELAY_MS)
  }

  const continueNextUnit = (): void => {
    if (cycleUnits >= (plan.maxDailyCycleUnits ?? Number.MAX_SAFE_INTEGER)) {
      setStatus('Daily bot units are exhausted.')
      return
    }
    setUnitRound(0)
    setPendingUnitCompletion(false)
    setLastResult(null)
    startAutomaticTrading()
  }

  const stopAutomaticTrading = (): void => {
    try { window.localStorage.removeItem(botAutostartKey) } catch { /* storage may be unavailable */ }
    if (analysisTimer.current) window.clearTimeout(analysisTimer.current)
    if (nextRoundTimer.current) window.clearTimeout(nextRoundTimer.current)
    setAutoTradingEnabled(false)
    setPhase('READY')
    setStatus('Automatic trading is OFF. No new bot trades will be opened.')
  }

  const rescanBot = (): void => {
    if (marketScanTimer.current) window.clearTimeout(marketScanTimer.current)
    if (scanInterval.current) window.clearInterval(scanInterval.current)
    setLastResult(null)
    setScanComplete(false)
    setScanSeconds(0)
    setScanPhase('ANALYZING')
    setScanFrame('M1')
    setScanNonce((value) => value + 1)
    setScanSnapshot((value) => value + 1)
    let index = 0
    scanInterval.current = window.setInterval(() => {
      index = Math.min(index + 1, SCAN_SEQUENCE.length - 1)
      setScanFrame(SCAN_SEQUENCE[index])
      setScanSeconds(Math.min(10, index + 1))
      if (index >= SCAN_SEQUENCE.length - 1 && scanInterval.current) {
        window.clearInterval(scanInterval.current)
        scanInterval.current = null
      }
    }, 1000)
    setStatus(activePosition ? 'Refreshing structure, liquidity, account fit and setup independently…' : 'Scanning M1 → M5 → M15 → M30 → H1 → H4 → D1 → W1 + account fit…')
    marketScanTimer.current = window.setTimeout(() => {
      if (scanInterval.current) window.clearInterval(scanInterval.current)
      scanInterval.current = null
      setScanSeconds(10)
      setScanComplete(true)
      setScanPhase('READY')
      setSelectedOpportunityTimeframe(topOpportunities[0]?.timeframe ?? null)
      setStatus(topOpportunities.length > 0
        ? topOpportunities.length + ' strongest timeframe' + (topOpportunities.length === 1 ? '' : 's') + ' ready: ' + topOpportunities.map((row) => row.timeframe).join(' + ') + '.'
        : 'No opportunity found for trade.')
    }, 10000)
  }

  return (
    <section className="space-y-3">
      <section className="overflow-hidden rounded-2xl border border-shafx-border bg-shafx-surface p-3.5 text-sm shadow-[0_14px_36px_rgba(0,0,0,.22)] sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-shafx-accent/10 text-shafx-accent">
              <Bot className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-base font-semibold tracking-tight">SHAFX Bot</h2>
                <span className="rounded-md border border-shafx-border bg-shafx-bg px-1.5 py-0.5 font-mono text-[7px] font-semibold uppercase tracking-[0.12em] text-shafx-textMuted">AUTO SIM</span>
              </div>
              <p className="mt-0.5 text-[10px] text-shafx-textMuted">Independent execution engine • {symbol}</p>
            </div>
          </div>
          <span className={phase === 'RUNNING'
            ? 'flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-shafx-success/20 bg-shafx-success/5 px-2.5 text-[9px] font-semibold text-shafx-success'
            : phase === 'ANALYZING'
              ? 'flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-shafx-accent/20 bg-shafx-accent/5 px-2.5 text-[9px] font-semibold text-shafx-accent'
              : 'flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-shafx-border bg-shafx-bg px-2.5 text-[9px] font-semibold text-shafx-textMuted'}>
            <Activity className="h-3 w-3" />
            {phase === 'ANALYZING' ? 'Starting' : phase === 'RUNNING' ? 'Running' : pendingUnitCompletion ? 'Unit complete' : 'Ready'}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-shafx-border bg-shafx-bg px-2.5 py-2.5">
            <span className="block text-[8px] uppercase tracking-[0.12em] text-shafx-textMuted">Market</span>
            <strong className="mt-1 block font-mono text-xs text-shafx-text">{symbol}</strong>
          </div>
          <div className="rounded-xl border border-shafx-border bg-shafx-bg px-2.5 py-2.5">
            <span className="block text-[8px] uppercase tracking-[0.12em] text-shafx-textMuted">Unit</span>
            <strong className="mt-1 block font-mono text-xs text-shafx-text">{displayedUnitNumber} / {plan.maxDailyCycleUnits === null ? '∞' : plan.maxDailyCycleUnits}</strong>
          </div>
          <div className="rounded-xl border border-shafx-border bg-shafx-bg px-2.5 py-2.5">
            <span className="block text-[8px] uppercase tracking-[0.12em] text-shafx-textMuted">Round</span>
            <strong className="mt-1 block font-mono text-xs text-shafx-text">{Math.min(unitRound, BOT_CYCLES_PER_UNIT)} / {BOT_CYCLES_PER_UNIT}</strong>
          </div>
          <button type="button" onClick={() => setRiskMode((mode) => mode === 'SAFE' ? 'NORMAL' : mode === 'NORMAL' ? 'EXTREME' : 'SAFE')} className="rounded-xl border border-shafx-border bg-shafx-bg px-2.5 py-2.5 text-left active:scale-[.99]" title="Tap to change risk mode">
            <span className="block text-[8px] uppercase tracking-[0.12em] text-shafx-textMuted">Risk mode</span>
            <strong className={riskMode === 'SAFE' ? 'mt-1 block font-mono text-xs text-shafx-success' : riskMode === 'NORMAL' ? 'mt-1 block font-mono text-xs text-shafx-accent' : 'mt-1 block font-mono text-xs text-shafx-warning'}>{riskModes[riskMode].label}</strong>
          </button>
        </div>

        <div className="mt-3 rounded-xl border border-shafx-border bg-shafx-bg p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-shafx-textMuted">Trade size</div>
              <div className="mt-1 text-sm font-semibold">Lot size</div>
            </div>
            <span className="font-mono text-[8px] text-shafx-textMuted">5 trades = 1 unit</span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button type="button" onClick={() => {
              const next = Math.max(symbolSpec?.minLotSize ?? 0.01, Number((parsedLotSize - (symbolSpec?.lotStep ?? 0.01)).toFixed(4)))
              setLotSize(String(next))
            }} className="min-h-11 min-w-11 rounded-xl border border-shafx-border bg-shafx-surface text-base font-semibold active:scale-[.98]">−</button>
            <label className="flex-1">
              <span className="sr-only">Bot lot size</span>
              <input type="number" inputMode="decimal" step={symbolSpec?.lotStep ?? 0.01} min={symbolSpec?.minLotSize ?? 0.01} max={symbolSpec?.maxLotSize ?? 100} value={lotSize} onChange={(event) => setLotSize(event.target.value)} className="min-h-11 w-full rounded-xl border border-shafx-border bg-shafx-surface px-3 text-center font-mono text-sm focus:border-shafx-accent focus:outline-none" aria-label="Bot lot size" />
            </label>
            <button type="button" onClick={() => {
              const next = Math.min(symbolSpec?.maxLotSize ?? 100, Number((parsedLotSize + (symbolSpec?.lotStep ?? 0.01)).toFixed(4)))
              setLotSize(String(next))
            }} className="min-h-11 min-w-11 rounded-xl border border-shafx-border bg-shafx-surface text-base font-semibold active:scale-[.98]">+</button>
          </div>
          <div className="mt-2 space-y-1 text-[8px] text-shafx-textMuted">
            <div className="flex items-center justify-between gap-2">
              <span>{lotSizeValid ? 'Lot size matches symbol rules.' : 'Enter a valid lot size for this symbol.'}</span>
              <span className="font-mono">{botRunLotSize?.toFixed(2) ?? lotSize} lot/run</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Account affordability ceiling</span>
              <span className={lotFitsAccount ? 'font-mono text-shafx-success' : 'font-mono text-shafx-danger'}>{accountMarginLotCeiling > 0 ? accountMarginLotCeiling.toFixed(2) + ' lot max' : '—'}</span>
            </div>
          </div>
        </div>

        {!lotFitsAccount && lotSizeValid && botRiskCalc?.isValid && (
          <div className="mt-3 rounded-xl border border-shafx-danger/25 bg-shafx-danger/[0.055] px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] font-semibold text-shafx-danger">BOT BLOCKED BY ACCOUNT RISK</span>
              <span className="font-mono text-[9px] text-shafx-danger">{parsedLotSize.toFixed(2)} &gt; {accountMarginLotCeiling.toFixed(2)} lot</span>
            </div>
            <p className="mt-1 text-[8px] text-shafx-textMuted">The bot will not execute until the lot fits the account's available account margin.</p>
          </div>
        )}

        {phase === 'ANALYZING' && (
          <div className="mt-3 rounded-xl border border-shafx-accent/20 bg-shafx-accent/[0.045] p-3.5">
            <div className="flex items-center gap-3">
              <CircularProgress progress={botScanProgress} label="scan" value={Math.round(botScanProgress) + '%'} />
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[8px] font-semibold uppercase tracking-[0.17em] text-shafx-accent">PREPARING NEXT ROUND</div>
                <div className="mt-1 text-sm font-semibold">Checking lower timeframes first</div>
                <p className="mt-1 text-[9px] leading-4 text-shafx-textMuted">The execution bot scans independently before it opens a broker position.</p>
              </div>
            </div>
          </div>
        )}

        {botDisplayedOrder && (
          <div className="mt-3 rounded-xl border border-shafx-accent/25 bg-[linear-gradient(145deg,rgba(124,92,252,.09),rgba(9,13,20,.95))] p-3.5">
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                <CircularProgress
                  progress={Math.max(0, Math.min(100, ((BOT_RESULT_DELAY_MS - tradeSecondsLeft * 1000) / BOT_RESULT_DELAY_MS) * 100))}
                  label="trade"
                  value={Math.max(0, tradeSecondsLeft).toFixed(1) + 's'}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className={botDisplayedOrder.type === 'BUY' ? 'text-lg font-black text-shafx-success' : 'text-lg font-black text-shafx-danger'}>{botDisplayedOrder.type} {botDisplayedOrder.lotSize.toFixed(2)} LOT</div>
                  <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-shafx-textMuted">10s active round</span>
                </div>
                <div className="mt-1 text-[9px] text-shafx-textMuted">{botDisplayedOrder.symbol} • circle fills to 100% before settlement</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[9px]">
              <div className="rounded-lg border border-shafx-border bg-shafx-bg p-2"><span className="block text-shafx-textMuted">Entry</span><b className="font-mono">{botDisplayedOrder.entryPrice.toFixed(symbolSpec?.pricePrecision ?? 5)}</b></div>
              <div className="rounded-lg border border-shafx-danger/20 bg-shafx-danger/[0.04] p-2"><span className="block text-shafx-textMuted">Stop Loss</span><b className="font-mono text-shafx-danger">{botDisplayedOrder.stopLoss?.toFixed(symbolSpec?.pricePrecision ?? 5) ?? '—'}</b></div>
              <div className="rounded-lg border border-shafx-success/20 bg-shafx-success/[0.04] p-2"><span className="block text-shafx-textMuted">Take Profit</span><b className="font-mono text-shafx-success">{botDisplayedOrder.takeProfit?.toFixed(symbolSpec?.pricePrecision ?? 5) ?? '—'}</b></div>
            </div>
            <div className="mt-3 flex items-center justify-between text-[8px] text-shafx-textMuted">
              <span>Current price <strong className="font-mono text-shafx-text">{currentPrice.toFixed(symbolSpec?.pricePrecision ?? 5)}</strong></span>
              <span>Round {unitRound}/{BOT_CYCLES_PER_UNIT}</span>
            </div>
          </div>
        )}

        {lastResult && !botDisplayedOrder && (
          <div className={lastResult === 'WIN' ? 'mt-3 rounded-xl border border-shafx-success/25 bg-shafx-success/[0.05] px-3 py-2.5' : 'mt-3 rounded-xl border border-shafx-danger/25 bg-shafx-danger/[0.05] px-3 py-2.5'}>
            <div className="flex items-center justify-between gap-2">
              <span className={lastResult === 'WIN' ? 'font-semibold text-shafx-success' : 'font-semibold text-shafx-danger'}>{lastResult === 'WIN' ? 'Trade settled • WIN' : 'Trade settled • LOSS'}</span>
              <span className={lastResult === 'WIN' ? 'font-mono text-sm font-black text-shafx-success' : 'font-mono text-sm font-black text-shafx-danger'}>{(lastProfit ?? 0) >= 0 ? '+' : ''}{(lastProfit ?? 0).toFixed(2)} {accountCurrency}</span>
            </div>
          </div>
        )}

        <div className="mt-3 grid grid-cols-3 gap-2 text-[9px]">
          <div className="rounded-xl border border-shafx-border bg-shafx-bg px-2.5 py-2.5"><span className="block text-shafx-textMuted">WIN</span><strong className="mt-0.5 block font-mono text-shafx-success">{wins}</strong></div>
          <div className="rounded-xl border border-shafx-border bg-shafx-bg px-2.5 py-2.5"><span className="block text-shafx-textMuted">LOSS</span><strong className="mt-0.5 block font-mono text-shafx-danger">{losses}</strong></div>
          <div className="rounded-xl border border-shafx-border bg-shafx-bg px-2.5 py-2.5"><span className="block text-shafx-textMuted">NET</span><strong className={totalWon - totalLost >= 0 ? 'mt-0.5 block font-mono text-shafx-success' : 'mt-0.5 block font-mono text-shafx-danger'}>{(totalWon - totalLost >= 0 ? '+' : '') + (totalWon - totalLost).toFixed(2)} {accountCurrency}</strong></div>
        </div>

        <div className="mt-3 flex gap-2">
          <button type="button" disabled={!symbolSpec || phase === 'ANALYZING' || (!autoTradingEnabled && dailyLimitReached)} onClick={autoTradingEnabled ? stopAutomaticTrading : pendingUnitCompletion && !dailyLimitReached ? continueNextUnit : startAutomaticTrading} className={autoTradingEnabled
            ? 'flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-shafx-danger/30 bg-shafx-danger/10 px-3 text-[10px] font-semibold text-shafx-danger shadow-[0_0_22px_rgba(255,92,117,.06)] active:scale-[.99]'
            : 'flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-shafx-accent to-shafx-primaryHover px-3 text-[10px] font-semibold text-white shadow-[0_8px_28px_rgba(124,92,252,.24)] active:scale-[.99]'}>
            {autoTradingEnabled ? <Square className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
            {autoTradingEnabled ? 'Stop bot' : dailyLimitReached ? 'Daily limit reached' : pendingUnitCompletion ? 'Run next unit' : 'Start bot'}
          </button>
          {pendingUnitCompletion && !dailyLimitReached && <button type="button" onClick={continueNextUnit} className="min-h-12 rounded-xl border border-shafx-success/25 bg-shafx-success/5 px-3 text-[9px] font-semibold text-shafx-success">Next unit</button>}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-shafx-border bg-shafx-bg/60 px-2.5 py-2 text-[8px] text-shafx-textMuted">
          <span className="flex min-w-0 items-center gap-1.5"><ShieldCheck className="h-3 w-3 text-shafx-success" />Broker only • no broker orders</span>
          <span className="font-mono">{status}</span>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-shafx-border bg-shafx-surface p-3.5 shadow-[0_14px_36px_rgba(0,0,0,.18)] sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-shafx-accent/10 text-shafx-accent"><Sparkles className="h-4 w-4" /></div>
            <div className="min-w-0">
              <div className="flex items-center gap-2"><h3 className="text-sm font-semibold">Market Analysis</h3><span className="rounded-md border border-shafx-accent/20 bg-shafx-accent/[0.05] px-1.5 py-0.5 font-mono text-[7px] font-semibold uppercase tracking-[0.12em] text-shafx-accent">INDEPENDENT</span></div>
              <p className="mt-0.5 text-[9px] leading-4 text-shafx-textMuted">Scans M1 through W1 for manual decision support. It does not start, stop or control the SHAFX Bot.</p>
            </div>
          </div>
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-shafx-border bg-shafx-bg px-2 py-1 font-mono text-[8px] text-shafx-textMuted">{SCAN_TIMEFRAMES.length} TFs</span>
        </div>

        {scanPhase === 'ANALYZING' ? (
          <div className="mt-3 rounded-xl border border-shafx-accent/20 bg-shafx-accent/[0.045] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-shafx-accent">SCANNING {scanFrame}</span>
              <span className="font-mono text-[9px] text-shafx-textMuted">{scanSeconds}/10s</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-shafx-border"><div className="h-full rounded-full bg-shafx-accent transition-[width] duration-500" style={{ width: Math.max(4, Math.min(100, (scanSeconds / 10) * 100)) + '%' }} /></div>
            <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-8">
              {SCAN_TIMEFRAMES.map((frame) => <span key={frame} className={frame === scanFrame ? 'rounded-lg border border-shafx-accent/40 bg-shafx-accent/10 px-1 py-1.5 text-center font-mono text-[8px] font-bold text-shafx-accent' : 'rounded-lg border border-shafx-border bg-shafx-bg px-1 py-1.5 text-center font-mono text-[8px] text-shafx-textMuted'}>{frame}</span>)}
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {scanComplete && topOpportunities.length > 0 && (
              <div className="rounded-xl border border-shafx-success/20 bg-shafx-success/[0.04] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-mono text-[8px] font-semibold uppercase tracking-[0.15em] text-shafx-success">SIGNALS DETECTED</div>
                    <div className="mt-1 text-sm font-semibold">Choose a timeframe to review</div>
                  </div>
                  <span className="font-mono text-[9px] text-shafx-success">{topOpportunities.length} strongest</span>
                </div>
                <div className="mt-3 space-y-1.5">
                  {topOpportunities.map((row) => {
                    const setup = row.executableSetup
                    if (!setup) return null
                    const selected = selectedOpportunityTimeframe === row.timeframe
                    return (
                      <button key={row.timeframe} type="button" onClick={() => setSelectedOpportunityTimeframe(row.timeframe)} aria-pressed={selected} className={selected
                        ? 'flex w-full items-center gap-2 rounded-lg border border-shafx-accent/50 bg-shafx-accent/[0.09] px-2.5 py-3 text-left shadow-[0_0_24px_rgba(124,92,252,.08)]'
                        : 'flex w-full items-center gap-2 rounded-lg border border-shafx-border bg-shafx-bg px-2.5 py-3 text-left'}>
                        <span className={setup.direction === 'BUY' ? 'rounded-md bg-shafx-success/10 px-1.5 py-1 font-mono text-[8px] font-bold text-shafx-success' : 'rounded-md bg-shafx-danger/10 px-1.5 py-1 font-mono text-[8px] font-bold text-shafx-danger'}>{setup.direction}</span>
                        <div className="min-w-0 flex-1"><div className="font-mono text-[10px] font-bold text-shafx-text">{row.timeframe} setup</div><div className="mt-0.5 text-[8px] text-shafx-textMuted">{row.flow} • Entry {setup.entryPrice}</div></div>
                        <span className="font-mono text-lg font-black text-shafx-accent">{setup.confidence}%</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            {scanComplete && topOpportunities.length === 0 && (
              <div className="rounded-xl border border-shafx-warning/25 bg-shafx-warning/[0.045] p-3">
                <div className="font-mono text-[9px] font-black uppercase tracking-[0.16em] text-shafx-warning">NO OPPORTUNITY FOUND FOR TRADE</div>
                <p className="mt-1 text-[8px] leading-4 text-shafx-textMuted">The scanner checked M1, M5, M15, M30, H1, H4, D1 and W1 and did not find a setup that passed the current market and account-risk filters.</p>
              </div>
            )}
            <div className="rounded-xl border border-shafx-border bg-shafx-bg/60 p-2.5">
              <div className="mb-2 flex items-center justify-between gap-2"><span className="font-mono text-[8px] font-semibold uppercase tracking-[0.14em] text-shafx-textMuted">TIMEFRAME MAP</span><span className="text-[8px] text-shafx-textMuted">{scanComplete ? 'Fresh results' : 'Ready to scan'}</span></div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {marketReadRows.map((row) => (
                  <div key={row.timeframe} className={row.executableSetup ? 'rounded-lg border border-shafx-accent/25 bg-shafx-accent/[0.045] px-2 py-2.5' : 'rounded-lg border border-shafx-border bg-shafx-surface px-2 py-2.5'}>
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-[9px] font-bold text-shafx-text">{row.timeframe}</span>
                      <span className={row.bias === 'Bullish' ? 'font-mono text-[7px] font-bold text-shafx-success' : row.bias === 'Bearish' ? 'font-mono text-[7px] font-bold text-shafx-danger' : 'font-mono text-[7px] text-shafx-textMuted'}>{row.flow}</span>
                    </div>
                    <div className="mt-1 font-mono text-[8px] text-shafx-text">{row.structure}</div>
                    <div className="mt-1 font-mono text-[8px] text-shafx-textMuted">{row.executableSetup ? row.executableSetup.direction + ' setup' : row.bias === 'Sideways' ? 'No directional setup' : row.bias === 'Unclear' ? 'Unclear' : 'No setup'}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="mt-3 space-y-2">
          <button type="button" disabled={!symbolSpec || scanPhase === 'ANALYZING'} onClick={rescanBot} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-shafx-accent/35 bg-shafx-accent/10 px-3 text-[10px] font-semibold text-shafx-accent active:scale-[.99] disabled:opacity-40">
            <RefreshCw className={scanPhase === 'ANALYZING' ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
            {scanPhase === 'ANALYZING' ? 'Scanning market…' : scanComplete ? 'Rescan market' : 'Scan market'}
          </button>
          {onReviewSetup && (
            <button type="button" disabled={!scanComplete || !selectedOpportunity?.executableSetup || (!onReviewOpportunity && !onReviewSetup)} onClick={() => {
              if (!selectedOpportunity?.executableSetup) return
              if (onReviewOpportunity) onReviewOpportunity(selectedOpportunity.timeframe, selectedOpportunity.executableSetup)
              else onReviewSetup?.(selectedOpportunity.executableSetup)
            }} className="flex min-h-14 w-full items-center justify-center rounded-xl border border-shafx-success/25 bg-shafx-success/5 px-3 text-[10px] font-semibold text-shafx-success shadow-[0_8px_24px_rgba(34,211,165,.08)] disabled:cursor-not-allowed disabled:opacity-40">
              Review {selectedOpportunity?.timeframe ?? "selected"} {selectedOpportunity?.executableSetup?.direction ?? ""} strategy
            </button>
          )}
        </div>
      </section>
    </section>
  )
}
