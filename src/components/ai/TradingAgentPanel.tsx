import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Bot, ChevronDown, CircleStop, Play, ShieldCheck, Sparkles, Wallet } from 'lucide-react'
import { analyzeLiquidity } from '../../engine/liquidity'
import { analyzeMarketStructure, findSwingPoints } from '../../engine/marketStructure'
import { analyzeSetup } from '../../engine/setup'
import { analyzeSupportResistance } from '../../engine/supportResistance'
import { buildTradingContext } from '../../engine/ai/context'
import { analyzeMultiTimeframeBias, buildAgentResearch, executeSimulationTrade, learnFromTrades } from '../../engine/agent'
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
  onBotOrder?: (order: TradeOrder) => void
  onReviewSetup?: () => void
}

type RiskMode = 'SAFE' | 'NORMAL' | 'RISK'
const riskModes: Record<RiskMode, { label: string; percent: number; description: string }> = {
  SAFE: { label: 'Safe', percent: 0.25, description: 'Smallest simulated risk' },
  NORMAL: { label: 'Normal', percent: 0.5, description: 'Balanced simulated risk' },
  RISK: { label: 'Risk', percent: 1, description: 'Higher simulated risk' },
}

type Phase = 'READY' | 'ANALYZING' | 'RUNNING'

export function TradingAgentPanel({ symbol, timeframe, candles, currentPrice, activePosition, tradeHistory, accountBalance = 10000, accountCurrency = 'USD', symbolSpec = null, conversionRate, onBotOrder, onReviewSetup }: Props) {
  const [riskMode, setRiskMode] = useState<RiskMode>('SAFE')
  const [cycleSeconds, setCycleSeconds] = useState<5 | 10>(5)
  const [phase, setPhase] = useState<Phase>('READY')
  const [wins, setWins] = useState(0)
  const [losses, setLosses] = useState(0)
  const [cycles, setCycles] = useState(0)
  const [lastResult, setLastResult] = useState<'WIN' | 'LOSS' | 'WAIT' | null>(null)
  const [status, setStatus] = useState('Ready to scan')
  const [bias, setBias] = useState<'Bullish' | 'Bearish' | 'Neutral'>('Neutral')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [botPositionId, setBotPositionId] = useState<string | null>(null)
  const processedHistory = useRef(new Set<string>())
  const analysisTimer = useRef<number | null>(null)

  const tradingContext = useMemo(() => {
    const swings = findSwingPoints(candles, 2)
    const structure = analyzeMarketStructure(candles, 2)
    const tolerance = symbol.includes('JPY') ? 0.1 : 0.001
    const supportResistance = analyzeSupportResistance(candles, tolerance, swings)
    const liquidity = analyzeLiquidity(candles, swings, tolerance)
    const setup = analyzeSetup({ currentPrice: candles[candles.length - 1]?.close ?? currentPrice, structure, supportResistance, liquidity })
    return buildTradingContext(symbol, timeframe, candles, structure, supportResistance, liquidity, setup)
  }, [candles, currentPrice, symbol, timeframe])

  const multiTimeframe = useMemo(() => analyzeMultiTimeframeBias({ [timeframe]: candles }), [candles, timeframe])
  const learning = useMemo(() => learnFromTrades(tradeHistory.filter((trade) => trade.status === 'closed').map((trade) => ({ symbol: trade.symbol, direction: trade.type, profit: trade.profit, riskRewardRatio: trade.riskRewardRatio }))), [tradeHistory])
  const research = useMemo(() => buildAgentResearch({ context: tradingContext, learning, multiTimeframe }), [learning, multiTimeframe, tradingContext])
  const setup = tradingContext.setup.preferredSetup
  const riskAmount = accountBalance * (riskModes[riskMode].percent / 100)

  useEffect(() => {
    const nextBias = multiTimeframe.dominantBias ?? (setup?.direction === 'BUY' ? 'Bullish' : setup?.direction === 'SELL' ? 'Bearish' : 'Neutral')
    setBias(nextBias)
  }, [multiTimeframe.dominantBias, setup?.direction])

  useEffect(() => {
    if (!botPositionId) return
    const closed = tradeHistory.find((trade) => trade.id === botPositionId && trade.status === 'closed')
    if (!closed || processedHistory.current.has(closed.id)) return
    processedHistory.current.add(closed.id)
    setBotPositionId(null)
    const profit = closed.profit ?? 0
    if (profit >= 0) {
      setWins((value) => value + 1)
      setLastResult('WIN')
      setStatus('Simulated profit — bot will analyze again on the next cycle')
    } else {
      setLosses((value) => {
        const next = value + 1
        setLastResult('LOSS')
        if (next >= 2) {
          setPhase('READY')
          setStatus('Stopped after 2 real simulated losses — review the strategy')
        } else {
          setStatus('Simulated loss — bot will re-check the market before the next trade')
        }
        return next
      })
    }
  }, [botPositionId, tradeHistory])

  useEffect(() => {
    if (phase !== 'RUNNING') return
    const timer = window.setInterval(() => {
      setCycles((value) => value + 1)
      if (losses >= 2) return
      if (activePosition || botPositionId) {
        setStatus(`Monitoring ${activePosition?.type ?? 'simulated'} position — waiting for its stop or target`)
        return
      }
      if (!symbolSpec || !onBotOrder) {
        setStatus('Simulation engine is not ready for this market')
        return
      }
      setStatus(`Analyzing ${symbol}…`)
      const result = executeSimulationTrade({
        context: { tradingContext, preferredSetup: setup, hasOpenPosition: false, permission: 'AUTONOMOUS_SIMULATION', multiTimeframe, learning, research },
        accountBalance,
        accountCurrency,
        riskPercent: riskModes[riskMode].percent,
        symbolSpec,
        conversionRate,
      })
      if (!result.order) {
        setLastResult('WAIT')
        setStatus(`${bias}: ${result.decision.rationale}`)
        return
      }
      setBotPositionId(result.order.id)
      setLastResult(null)
      setStatus(`${result.order.type} ${symbol} simulated at ${result.order.entryPrice} — monitoring SL/TP`)
      onBotOrder(result.order)
    }, cycleSeconds * 1000)
    return () => window.clearInterval(timer)
  }, [accountBalance, accountCurrency, activePosition, bias, botPositionId, candles, conversionRate, cycleSeconds, losses, learning, multiTimeframe, onBotOrder, phase, research, riskMode, setup, symbol, symbolSpec, tradingContext])

  useEffect(() => () => { if (analysisTimer.current) window.clearTimeout(analysisTimer.current) }, [])

  const startBot = (): void => {
    if (losses >= 2) { setLosses(0); setWins(0); setCycles(0); setLastResult(null); setBotPositionId(null) }
    setPhase('ANALYZING')
    setStatus('Analyzing market structure, liquidity, setup and risk…')
    analysisTimer.current = window.setTimeout(() => {
      setPhase('RUNNING')
      setStatus(`${bias} market detected. Bot is now watching for a valid setup.`)
    }, 800)
  }
  const stopBot = (): void => { setPhase('READY'); setStatus(activePosition ? 'Bot paused — existing simulated position is still managed by SHAFX' : 'Bot paused') }

  return <div className="space-y-3 rounded-lg border border-shafx-border bg-shafx-surface p-3 text-sm shadow-sm">
    <div className="flex items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 font-semibold"><Bot className="h-4 w-4 text-shafx-primary" />SHAFX Bot</h3><p className="mt-1 text-[11px] leading-relaxed text-shafx-textMuted">The bot uses the existing SHAFX analysis → decision → risk → simulator engine. It never sends a broker order.</p></div><span className={`flex items-center gap-1 rounded border px-2 py-1 text-[10px] ${phase !== 'READY' ? 'border-shafx-success/20 bg-shafx-success/10 text-shafx-success' : 'border-shafx-border text-shafx-textMuted'}`}><Activity className="h-3 w-3" />{phase === 'ANALYZING' ? 'Analyzing' : phase === 'RUNNING' ? 'Running' : 'Ready'}</span></div>

    <div className="rounded-md border border-shafx-border bg-shafx-bg p-3"><div className="mb-2 text-[10px] uppercase tracking-wider text-shafx-textMuted">1. Start → analyze first</div><div className="flex items-center justify-between gap-3"><div><div className="text-base font-semibold">{phase === 'ANALYZING' ? 'Analyzing…' : bias}</div><div className="mt-1 text-xs text-shafx-textMuted">{multiTimeframe.dominantBias ? `${multiTimeframe.dominantBias} bias` : 'Neutral bias'} • {research.agreement.toFixed(0)}% evidence agreement</div></div><span className="rounded border border-shafx-primary/20 px-2 py-1 text-[10px] text-shafx-primary">{timeframe}</span></div><p className="mt-2 text-xs leading-relaxed text-shafx-textMuted">{phase === 'ANALYZING' ? 'The bot is checking market structure, support/resistance, liquidity, setup quality, research and historical simulator learning.' : setup ? `The engine sees a ${setup.direction} candidate around ${setup.entryPrice}. ${setup.rationale.join(' ')}` : 'No clean setup is available right now. The bot will wait instead of forcing a trade.'}</p></div>

    <div className="rounded-md border border-shafx-primary/30 bg-shafx-primary/5 p-3"><div className="mb-2 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-shafx-primary" /><div><div className="text-[10px] uppercase tracking-wider text-shafx-textMuted">2. Risk gate</div><div className="font-semibold">{riskModes[riskMode].label} mode</div></div></div><div className="grid grid-cols-3 gap-1">{(Object.keys(riskModes) as RiskMode[]).map((mode) => <button key={mode} type="button" onClick={() => setRiskMode(mode)} className={`min-h-10 rounded px-1 text-[10px] font-semibold ${riskMode === mode ? 'bg-shafx-primary text-white' : 'border border-shafx-border text-shafx-textMuted'}`}>{riskModes[mode].label}<span className="block opacity-70">{riskModes[mode].percent}%</span></button>)}</div><div className="mt-2 flex items-center justify-between text-xs"><span className="text-shafx-textMuted">Demo balance</span><span className="font-mono">${accountBalance.toFixed(2)}</span></div><div className="flex items-center justify-between text-xs"><span className="text-shafx-textMuted">Max risk per simulated trade</span><span className="font-mono text-shafx-danger">${riskAmount.toFixed(2)}</span></div></div>

    <div className="rounded-md border border-shafx-border bg-shafx-bg p-3"><div className="mb-2 flex items-center justify-between"><div><div className="text-[10px] uppercase tracking-wider text-shafx-textMuted">3. Automatic paper trading</div><div className="font-semibold">{cycleSeconds}-second scan cycle</div></div><Wallet className="h-4 w-4 text-shafx-primary" /></div><div className="grid grid-cols-2 gap-2">{([5, 10] as const).map((seconds) => <button key={seconds} type="button" onClick={() => setCycleSeconds(seconds)} className={`min-h-10 rounded border text-xs ${cycleSeconds === seconds ? 'border-shafx-primary bg-shafx-primary/10 text-shafx-primary' : 'border-shafx-border text-shafx-textMuted'}`}>{seconds}s cycle</button>)}</div><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" disabled={phase !== 'READY' || !symbolSpec} onClick={startBot} className="flex min-h-11 items-center justify-center gap-2 rounded bg-shafx-success px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><Play className="h-4 w-4" />Start bot</button><button type="button" disabled={phase === 'READY'} onClick={stopBot} className="flex min-h-11 items-center justify-center gap-2 rounded border border-shafx-danger/30 text-xs font-semibold text-shafx-danger disabled:opacity-40"><CircleStop className="h-4 w-4" />Stop</button></div><div className="mt-3 rounded border border-shafx-border p-2 text-xs"><div className="font-medium">{status}</div><div className="mt-1 flex justify-between text-[10px] text-shafx-textMuted"><span>Scans {cycles}</span><span>Wins {wins} • Losses {losses}/2</span></div>{lastResult && <div className={`mt-1 text-[10px] ${lastResult === 'WIN' ? 'text-shafx-success' : lastResult === 'LOSS' ? 'text-shafx-danger' : 'text-shafx-textMuted'}`}>{lastResult === 'WIN' ? 'Profit → analyze again' : lastResult === 'LOSS' ? 'Loss → re-check strategy' : 'Waiting for a valid setup'}</div>}</div></div>

    <div className="rounded-md border border-shafx-border bg-shafx-bg p-3"><div className="text-[10px] uppercase tracking-wider text-shafx-textMuted">How the bot reacts to the engine</div><div className="mt-2 grid gap-2 text-xs text-shafx-textMuted"><div><span className="font-semibold text-shafx-text">1.</span> Analyze the existing SHAFX market-structure, liquidity and setup engines.</div><div><span className="font-semibold text-shafx-text">2.</span> Pass the result through the existing agent decision and risk engine.</div><div><span className="font-semibold text-shafx-text">3.</span> If approved for autonomous simulation, create a real SHAFX simulated position with SL/TP.</div><div><span className="font-semibold text-shafx-text">4.</span> SHAFX position management closes it at SL/TP; the bot reads the real simulated result.</div><div><span className="font-semibold text-shafx-text">5.</span> Profit → analyze again. Two actual simulated losses → stop and request strategy review.</div></div></div>

    <div className="rounded-md border border-shafx-border bg-shafx-bg p-3"><div className="flex items-center justify-between gap-3"><div><div className="text-[10px] uppercase tracking-wider text-shafx-textMuted">Manual trade</div><div className="font-semibold">Trade yourself</div><p className="mt-1 text-[11px] text-shafx-textMuted">Manual orders stay in Market so chart, price and order ticket remain together.</p></div><Sparkles className="h-4 w-4 text-shafx-primary" /></div><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={onReviewSetup} className="min-h-11 rounded bg-shafx-success px-3 text-xs font-semibold text-white">BUY {symbol}</button><button type="button" onClick={onReviewSetup} className="min-h-11 rounded bg-shafx-danger px-3 text-xs font-semibold text-white">SELL {symbol}</button></div></div>

    <button type="button" onClick={() => setDetailsOpen((open) => !open)} className="flex min-h-10 w-full items-center justify-between rounded border border-shafx-border px-3 text-xs text-shafx-textMuted"><span>Advanced analysis</span><ChevronDown className={`h-4 w-4 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} /></button>
    {detailsOpen && <div className="space-y-2 rounded-md border border-shafx-border bg-shafx-bg p-3 text-[10px] text-shafx-textMuted"><div>Learning: {learning.summary}</div><div>Research: {research.agreement.toFixed(0)}% agreement.</div><div>Current price: {currentPrice}</div><div>{riskModes[riskMode].description}.</div></div>}
    <p className="text-[10px] leading-relaxed text-shafx-textMuted">SIMULATED — NOT FINANCIAL ADVICE. The bot uses the SHAFX simulator only; no broker order is sent.</p>
  </div>
}
