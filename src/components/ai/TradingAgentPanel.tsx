import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Bot, ChevronDown, CircleStop, Play, ShieldCheck, Sparkles, Wallet } from 'lucide-react'
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
  onBotRunningChange?: (running: boolean) => void
  onReviewSetup?: () => void
}

type RiskMode = 'SAFE' | 'NORMAL' | 'RISK'
const riskModes: Record<RiskMode, { label: string; percent: number; description: string }> = {
  SAFE: { label: 'Safe', percent: 0.25, description: 'Smallest simulated risk' },
  NORMAL: { label: 'Normal', percent: 0.5, description: 'Balanced simulated risk' },
  RISK: { label: 'Risk', percent: 1, description: 'Higher simulated risk' },
}
type Phase = 'READY' | 'ANALYZING' | 'RUNNING'

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
  onBotRunningChange,
  onReviewSetup,
}: Props) {
  const plan = BOT_PLANS[botPlan]
  const [riskMode, setRiskMode] = useState<RiskMode>('SAFE')
  const readStoredLotSize = (): string => typeof window !== 'undefined' ? window.sessionStorage.getItem('shafx-simulator-lot-size') || '0.10' : '0.10'
  const [lotSize, setLotSize] = useState(readStoredLotSize)
  const [cycleSeconds, setCycleSeconds] = useState<5 | 10>(5)
  const [phase, setPhase] = useState<Phase>('READY')
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

  const timeframeFrames = useMultiTimeframeCandles(symbol, timeframe, candles)
  const multiTimeframe = useMemo(() => analyzeMultiTimeframeBias(timeframeFrames), [timeframeFrames])
  const learning = useMemo(() => learnFromTrades(tradeHistory.filter((trade) => trade.status === 'closed').map((trade) => ({ symbol: trade.symbol, direction: trade.type, profit: trade.profit, riskRewardRatio: trade.riskRewardRatio }))), [tradeHistory])
  const research = useMemo(() => buildAgentResearch({ context: tradingContext, learning, multiTimeframe }), [learning, multiTimeframe, tradingContext])
  const setup = tradingContext.setup.preferredSetup
  const riskAmount = accountBalance * (riskModes[riskMode].percent / 100)
  const parsedLotSize = Number(lotSize)
  const lotSizeValid = symbolSpec ? Number.isFinite(parsedLotSize) && parsedLotSize >= symbolSpec.minLotSize && parsedLotSize <= symbolSpec.maxLotSize && Math.abs((parsedLotSize / symbolSpec.lotStep) - Math.round(parsedLotSize / symbolSpec.lotStep)) < 1e-8 : false
  const allowanceLabel = plan.maxDailyCycleUnits === null ? 'Unlimited' : String(plan.maxDailyCycleUnits) + ' units/day'

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
    onBotRunningChange?.(phase === 'RUNNING' || phase === 'ANALYZING')
  }, [onBotRunningChange, phase])

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
    const units = cycleUnitsForSeconds(cycleSeconds)
    try {
      const response = await fetch('/api/bot/usage', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: runId ?? crypto.randomUUID(), units }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.ok) {
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
      setStatus('Scanning ' + symbol + '…')
      const result = executeSimulationTrade({
        context: { tradingContext, preferredSetup: setup, hasOpenPosition: false, permission: 'AUTONOMOUS_SIMULATION', multiTimeframe, learning, research },
        accountBalance,
        accountCurrency,
        riskPercent: riskModes[riskMode].percent,
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
      setStatus(result.order.type + ' ' + symbol + ' simulated at ' + result.order.entryPrice + ' — monitoring SL/TP')
      onBotOrder(result.order)
    } catch {
      setPhase('READY')
      setStatus('Unable to verify bot cycle allowance. Try again.')
    }
    }

    return () => { runBotCycleRef.current = null }
  }, [accountBalance, accountCurrency, activePosition, bias, botPositionId, conversionRate, cycleSeconds, learning, losses, lotSizeValid, multiTimeframe, onBotOrder, parsedLotSize, research, riskMode, runId, setup, symbol, symbolSpec, tradingContext])

  useEffect(() => {
    if (phase !== 'RUNNING') return
    const kickoff = window.setTimeout(() => { void runBotCycleRef.current?.() }, 250)
    const timer = window.setInterval(() => { void runBotCycleRef.current?.() }, cycleSeconds * 1000)
    return () => {
      window.clearTimeout(kickoff)
      window.clearInterval(timer)
    }
  }, [cycleSeconds, phase])

  useEffect(() => () => {
    if (analysisTimer.current) window.clearTimeout(analysisTimer.current)
    onBotRunningChange?.(false)
  }, [onBotRunningChange])

  const startBot = (): void => {
    const freshRun = crypto.randomUUID()
    setRunId(freshRun)
    setCycles(0)
    setLastResult(null)
    setScanNonce((value) => value + 1)
    if (cycleSeconds > plan.maxCycleSeconds) {
      setStatus(plan.label + ' allows up to ' + plan.maxCycleSeconds + 's scan cycles.')
      return
    }
    if (!activePosition) {
      setBotPositionId(null)
      processedHistory.current.clear()
    }
    if (losses >= 2) setLosses(0)
    setPhase('ANALYZING')
    setStatus('Refreshing market analysis… Daily allowance: ' + allowanceLabel + '.')
    if (analysisTimer.current) window.clearTimeout(analysisTimer.current)
    analysisTimer.current = window.setTimeout(() => {
      setPhase('RUNNING')
      setStatus(bias + ' market read complete. Executing the first simulator cycle.')
    }, 850)
  }

  const rescanBot = (): void => {
    if (analysisTimer.current) window.clearTimeout(analysisTimer.current)
    setPhase('READY')
    setLastResult(null)
    setScanNonce((value) => value + 1)
    setStatus(activePosition ? 'Refreshing analysis while the existing simulated position is monitored.' : 'Market analysis refreshed. Ready for a fresh scan.')
  }

  const stopBot = (): void => {
    setPhase('READY')
    setStatus(activePosition ? 'Bot paused — existing simulated position is still managed by SHAFX' : 'Bot paused')
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
        {onReviewSetup && <button type="button" onClick={onReviewSetup} className="mt-3 min-h-11 w-full rounded-xl border border-shafx-accent/25 bg-shafx-accent/5 px-3 text-[10px] font-semibold text-shafx-accent active:bg-shafx-accent/10">Review setup in Market</button>}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <section className="rounded-xl border border-shafx-accent/25 bg-shafx-accent/[0.045] p-3.5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-shafx-accent" />
            <div><div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-shafx-textMuted">Risk gate</div><div className="text-sm font-semibold">{riskModes[riskMode].label} mode</div></div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(Object.keys(riskModes) as RiskMode[]).map((mode) => (
              <button key={mode} type="button" onClick={() => setRiskMode(mode)} className={riskMode === mode ? 'min-h-12 rounded-xl bg-shafx-accent px-1 text-[10px] font-semibold text-white' : 'min-h-12 rounded-xl border border-shafx-border bg-shafx-bg px-1 text-[10px] font-semibold text-shafx-textMuted'}>
                {riskModes[mode].label}<span className="mt-0.5 block opacity-80">{riskModes[mode].percent}%</span>
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
            <div className="rounded-lg border border-shafx-border bg-shafx-bg px-2.5 py-2"><span className="text-shafx-textMuted">Balance</span><div className="mt-0.5 font-mono text-xs">${accountBalance.toFixed(2)}</div></div>
            <div className="rounded-lg border border-shafx-border bg-shafx-bg px-2.5 py-2"><span className="text-shafx-textMuted">Max risk</span><div className="mt-0.5 font-mono text-xs text-shafx-danger">${riskAmount.toFixed(2)}</div></div>
          </div>
          <label className="mt-3 block">
            <span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-shafx-textMuted">Bot lot size</span>
            <div className="mt-1 flex items-center gap-2">
              <input type="number" inputMode="decimal" step={symbolSpec?.lotStep ?? 0.01} min={symbolSpec?.minLotSize ?? 0.01} max={symbolSpec?.maxLotSize ?? 100} value={lotSize} onChange={(event) => setLotSize(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-xl border border-shafx-border bg-shafx-bg px-3 font-mono text-xs outline-none focus:border-shafx-accent" aria-label="Bot lot size" />
              <span className="text-[9px] text-shafx-textMuted">lots</span>
            </div>
            <span className={lotSizeValid ? 'mt-1 block text-[8px] text-shafx-textMuted' : 'mt-1 block text-[8px] text-shafx-danger'}>{symbolSpec ? `Allowed ${symbolSpec.minLotSize}–${symbolSpec.maxLotSize}, step ${symbolSpec.lotStep}` : 'Load a symbol specification first.'}</span>
          </label>
        </section>

        <section className="rounded-xl border border-shafx-border bg-shafx-bg p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div><div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-shafx-textMuted">Scan speed</div><div className="mt-1 text-sm font-semibold">{cycleSeconds}s cycle</div></div>
            <Wallet className="h-4 w-4 text-shafx-accent" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {([5, 10] as const).map((seconds) => (
              <button key={seconds} type="button" disabled={seconds > plan.maxCycleSeconds} onClick={() => setCycleSeconds(seconds)} className={cycleSeconds === seconds ? 'min-h-12 rounded-xl border border-shafx-accent/40 bg-shafx-accent/10 text-[10px] font-semibold text-shafx-accent' : 'min-h-12 rounded-xl border border-shafx-border bg-shafx-surface text-[10px] font-semibold text-shafx-textMuted disabled:cursor-not-allowed disabled:opacity-35'}>
                <span className="block">{seconds}s scan</span><span className="mt-0.5 block text-[9px] opacity-75">{cycleUnitsForSeconds(seconds)} unit{cycleUnitsForSeconds(seconds) > 1 ? 's' : ''}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 rounded-lg border border-shafx-border px-2.5 py-2 text-[10px] text-shafx-textMuted"><span>Allowance</span><span className="float-right font-mono text-shafx-text">{cycleUnits}{plan.maxDailyCycleUnits === null ? ' / ∞' : ' / ' + plan.maxDailyCycleUnits}</span></div>
        </section>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2.5">
        <button type="button" disabled={phase !== 'READY' || !symbolSpec} onClick={startBot} className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-shafx-success px-2 text-[10px] font-semibold text-white shadow-lg shadow-shafx-success/10 disabled:cursor-not-allowed disabled:opacity-35"><Play className="h-4 w-4" />Start bot</button>
        <button type="button" disabled={!symbolSpec} onClick={rescanBot} className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-shafx-accent/25 bg-shafx-accent/5 px-2 text-[10px] font-semibold text-shafx-accent disabled:cursor-not-allowed disabled:opacity-35">↻ Rescan</button>
        <button type="button" disabled={phase === 'READY'} onClick={stopBot} className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-shafx-danger/30 bg-shafx-danger/5 px-2 text-[10px] font-semibold text-shafx-danger disabled:cursor-not-allowed disabled:opacity-35"><CircleStop className="h-4 w-4" />Stop</button>
      </div>

      <div className="mt-3 rounded-xl border border-shafx-border bg-shafx-bg p-3">
        <div className="flex items-center justify-between gap-3"><span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-shafx-textMuted">Current status</span><span className="text-[9px] text-shafx-textMuted">Scans {cycles}</span></div>
        <p className="mt-1.5 text-[11px] leading-5 text-shafx-text">{status}</p><p className="mt-1 text-[9px] text-shafx-textMuted">Each Start or Rescan uses the latest simulator candles and creates a fresh analysis pass.</p>
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
        <div>{riskModes[riskMode].description}.</div>
        <div>Multi-timeframe context is used before a simulated order is considered.</div>
      </div>}

      <div className="mt-3 rounded-xl border border-shafx-warning/15 bg-shafx-warning/[0.035] p-3 text-[9px] leading-4 text-shafx-textMuted">
        <strong className="text-shafx-warning">Simulator only.</strong> This bot never sends broker orders. It creates SHAFX simulated positions and is not financial advice.
      </div>
    </section>
  )
}
