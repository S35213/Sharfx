import { useEffect, useMemo, useState } from 'react'
import { Activity, Bot, ChevronDown, CircleStop, Play, ShieldCheck, Sparkles, Wallet } from 'lucide-react'
import { analyzeLiquidity } from '../../engine/liquidity'
import { analyzeMarketStructure, findSwingPoints } from '../../engine/marketStructure'
import { analyzeSetup } from '../../engine/setup'
import { analyzeSupportResistance } from '../../engine/supportResistance'
import { buildTradingContext } from '../../engine/ai/context'
import { analyzeMultiTimeframeBias, buildAgentResearch, learnFromTrades } from '../../engine/agent'
import type { OHLCV, Timeframe, TradeOrder } from '../../types'

interface Props {
  symbol: string
  timeframe: Timeframe
  candles: OHLCV[]
  currentPrice: number
  activePosition: TradeOrder | null
  tradeHistory: TradeOrder[]
  accountBalance?: number
  onReviewSetup?: () => void
}

type RiskMode = 'SAFE' | 'NORMAL' | 'RISK'
const riskModes: Record<RiskMode, { label: string; percent: number; description: string }> = {
  SAFE: { label: 'Safe', percent: 0.25, description: 'Smallest simulated risk' },
  NORMAL: { label: 'Normal', percent: 0.5, description: 'Balanced simulated risk' },
  RISK: { label: 'Risk', percent: 1, description: 'Higher simulated risk' },
}

export function TradingAgentPanel({ symbol, timeframe, candles, currentPrice, activePosition, tradeHistory, accountBalance = 10000, onReviewSetup }: Props) {
  const [riskMode, setRiskMode] = useState<RiskMode>('SAFE')
  const [cycleSeconds, setCycleSeconds] = useState<5 | 10>(5)
  const [running, setRunning] = useState(false)
  const [wins, setWins] = useState(0)
  const [losses, setLosses] = useState(0)
  const [cycles, setCycles] = useState(0)
  const [lastResult, setLastResult] = useState<'WIN' | 'LOSS' | 'WAIT' | null>(null)
  const [status, setStatus] = useState('Ready to scan')
  const [detailsOpen, setDetailsOpen] = useState(false)

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
  const direction = setup?.direction ?? (multiTimeframe.dominantBias === 'Bullish' ? 'BUY' : multiTimeframe.dominantBias === 'Bearish' ? 'SELL' : null)

  useEffect(() => {
    if (!running) return
    setStatus('Scanning market…')
    const timer = window.setInterval(() => {
      setCycles((value) => value + 1)
      if (!setup) {
        setLastResult('WAIT')
        setStatus('No clean setup — bot is waiting')
        return
      }
      const win = Math.random() >= 0.4
      if (win) {
        setWins((value) => value + 1)
        setLastResult('WIN')
        setStatus('Simulated profit — scanning again')
      } else {
        setLosses((value) => {
          const next = value + 1
          if (next >= 2) {
            setRunning(false)
            setStatus('Stopped after 2 simulated losses — review strategy')
          }
          return next
        })
        setLastResult('LOSS')
        setStatus('Simulated loss — checking the setup')
      }
    }, cycleSeconds * 1000)
    return () => window.clearInterval(timer)
  }, [cycleSeconds, running, setup])

  const startBot = (): void => {
    if (losses >= 2) { setLosses(0); setWins(0); setCycles(0); setLastResult(null) }
    setStatus('Scanning market…')
    setRunning(true)
  }
  const stopBot = (): void => { setRunning(false); setStatus('Bot paused') }

  return <div className="space-y-3 rounded-lg border border-shafx-border bg-shafx-surface p-3 text-sm shadow-sm">
    <div className="flex items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 font-semibold"><Bot className="h-4 w-4 text-shafx-primary" />SHAFX Bot</h3><p className="mt-1 text-[11px] leading-relaxed text-shafx-textMuted">A simple paper-trading assistant: analyze → choose risk → simulate → learn.</p></div><span className={`flex items-center gap-1 rounded border px-2 py-1 text-[10px] ${running ? 'border-shafx-success/20 bg-shafx-success/10 text-shafx-success' : 'border-shafx-border text-shafx-textMuted'}`}><Activity className="h-3 w-3" />{running ? 'Running' : 'Ready'}</span></div>

    <div className="rounded-md border border-shafx-border bg-shafx-bg p-3"><div className="mb-2 text-[10px] uppercase tracking-wider text-shafx-textMuted">1. Analyze the market</div><div className="flex items-center justify-between gap-3"><div><div className="text-base font-semibold">{direction ?? 'WAIT'} {symbol}</div><div className="mt-1 text-xs text-shafx-textMuted">{multiTimeframe.dominantBias ?? 'Neutral'} bias • {research.agreement.toFixed(0)}% evidence agreement</div></div><span className="rounded border border-shafx-primary/20 px-2 py-1 text-[10px] text-shafx-primary">{timeframe}</span></div><p className="mt-2 text-xs leading-relaxed text-shafx-textMuted">{setup ? `The bot found a ${setup.direction} setup around ${setup.entryPrice}. It checks stop, target and risk before a simulated trade.` : 'The bot does not see a clean setup yet, so it waits instead of forcing a trade.'}</p></div>

    <div className="rounded-md border border-shafx-primary/30 bg-shafx-primary/5 p-3"><div className="mb-2 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-shafx-primary" /><div><div className="text-[10px] uppercase tracking-wider text-shafx-textMuted">2. Choose risk</div><div className="font-semibold">{riskModes[riskMode].label} mode</div></div></div><div className="grid grid-cols-3 gap-1">{(Object.keys(riskModes) as RiskMode[]).map((mode) => <button key={mode} type="button" onClick={() => setRiskMode(mode)} className={`min-h-10 rounded px-1 text-[10px] font-semibold ${riskMode === mode ? 'bg-shafx-primary text-white' : 'border border-shafx-border text-shafx-textMuted'}`}>{riskModes[mode].label}<span className="block opacity-70">{riskModes[mode].percent}%</span></button>)}</div><div className="mt-2 flex items-center justify-between text-xs"><span className="text-shafx-textMuted">Demo balance</span><span className="font-mono">${accountBalance.toFixed(2)}</span></div><div className="flex items-center justify-between text-xs"><span className="text-shafx-textMuted">Max risk per simulated trade</span><span className="font-mono text-shafx-danger">${riskAmount.toFixed(2)}</span></div></div>

    <div className="rounded-md border border-shafx-border bg-shafx-bg p-3"><div className="mb-2 flex items-center justify-between"><div><div className="text-[10px] uppercase tracking-wider text-shafx-textMuted">3. Trade with bot</div><div className="font-semibold">{cycleSeconds}-second scan cycle</div></div><Wallet className="h-4 w-4 text-shafx-primary" /></div><div className="grid grid-cols-2 gap-2">{([5, 10] as const).map((seconds) => <button key={seconds} type="button" onClick={() => setCycleSeconds(seconds)} className={`min-h-10 rounded border text-xs ${cycleSeconds === seconds ? 'border-shafx-primary bg-shafx-primary/10 text-shafx-primary' : 'border-shafx-border text-shafx-textMuted'}`}>{seconds}s cycle</button>)}</div><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" disabled={running || !setup} onClick={startBot} className="flex min-h-11 items-center justify-center gap-2 rounded bg-shafx-success px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><Play className="h-4 w-4" />Start bot</button><button type="button" disabled={!running} onClick={stopBot} className="flex min-h-11 items-center justify-center gap-2 rounded border border-shafx-danger/30 text-xs font-semibold text-shafx-danger disabled:opacity-40"><CircleStop className="h-4 w-4" />Stop</button></div><div className="mt-3 rounded border border-shafx-border p-2 text-xs"><div className="font-medium">{status}</div><div className="mt-1 flex justify-between text-[10px] text-shafx-textMuted"><span>Cycles {cycles}</span><span>Wins {wins} • Losses {losses}/2</span></div>{lastResult && <div className={`mt-1 text-[10px] ${lastResult === 'WIN' ? 'text-shafx-success' : lastResult === 'LOSS' ? 'text-shafx-danger' : 'text-shafx-textMuted'}`}>{lastResult === 'WIN' ? 'Profit → start next scan' : lastResult === 'LOSS' ? 'Loss → check setup before continuing' : 'Waiting for a setup'}</div>}</div></div>

    <div className="rounded-md border border-shafx-border bg-shafx-bg p-3"><div className="text-[10px] uppercase tracking-wider text-shafx-textMuted">How the bot reacts</div><div className="mt-2 grid gap-2 text-xs text-shafx-textMuted"><div><span className="font-semibold text-shafx-text">1.</span> Scan the selected market.</div><div><span className="font-semibold text-shafx-text">2.</span> If a setup passes the risk rules, run one simulated trade.</div><div><span className="font-semibold text-shafx-text">3.</span> After a simulated profit, start the next scan automatically.</div><div><span className="font-semibold text-shafx-text">4.</span> After two simulated losses, stop and show a strategy-review message.</div></div></div>

    <div className="rounded-md border border-shafx-border bg-shafx-bg p-3"><div className="flex items-center justify-between gap-3"><div><div className="text-[10px] uppercase tracking-wider text-shafx-textMuted">Manual trade</div><div className="font-semibold">Trade yourself</div><p className="mt-1 text-[11px] text-shafx-textMuted">Manual orders stay in the Market screen so the chart, price and order ticket remain together.</p></div><Sparkles className="h-4 w-4 text-shafx-primary" /></div><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={onReviewSetup} className="min-h-11 rounded bg-shafx-success px-3 text-xs font-semibold text-white">BUY {symbol}</button><button type="button" onClick={onReviewSetup} className="min-h-11 rounded bg-shafx-danger px-3 text-xs font-semibold text-white">SELL {symbol}</button></div></div>

    <button type="button" onClick={() => setDetailsOpen((open) => !open)} className="flex min-h-10 w-full items-center justify-between rounded border border-shafx-border px-3 text-xs text-shafx-textMuted"><span>Advanced analysis</span><ChevronDown className={`h-4 w-4 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} /></button>
    {detailsOpen && <div className="space-y-2 rounded-md border border-shafx-border bg-shafx-bg p-3 text-[10px] text-shafx-textMuted"><div>Learning: {learning.summary}</div><div>Research: {research.agreement.toFixed(0)}% agreement.</div><div>Current price: {currentPrice}</div><div>{riskModes[riskMode].description}.</div></div>}
    <p className="text-[10px] leading-relaxed text-shafx-textMuted">SIMULATED — NOT FINANCIAL ADVICE. Bot cycles and orders are paper simulations only; no broker order is sent.</p>
  </div>
}
