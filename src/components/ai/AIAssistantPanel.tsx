import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Brain, Eye, Shield, Target, Zap } from 'lucide-react'
import { analyzeLiquidity } from '../../engine/liquidity'
import { analyzeMarketStructure, findSwingPoints } from '../../engine/marketStructure'
import { analyzeSetup } from '../../engine/setup'
import { analyzeSupportResistance } from '../../engine/supportResistance'
import { buildTradingContext } from '../../engine/ai/context'
import { detectMarketEvents } from '../../engine/ai/events'
import { buildTradingResponse } from '../../engine/ai/response'
import type { AITradingContext, MarketEvent } from '../../engine/ai/types'
import type { SetupCandidate } from '../../engine/setup/types'
import type { OHLCV, Timeframe } from '../../types'

interface Props { symbol: string; timeframe: Timeframe; candles: OHLCV[]; setup?: SetupCandidate | null; onReviewSetup?: () => void }

export function AIAssistantPanel({ symbol, timeframe, candles, setup = null, onReviewSetup }: Props) {
  const [events, setEvents] = useState<MarketEvent[]>([])
  const [activityIndex, setActivityIndex] = useState(0)
  const previousContext = useRef<AITradingContext | null>(null)

  const context = useMemo(() => {
    const structure = analyzeMarketStructure(candles, 2)
    const swings = findSwingPoints(candles, 2)
    const tolerance = symbol.includes('JPY') ? 0.1 : 0.001
    const supportResistance = analyzeSupportResistance(candles, tolerance, swings)
    const liquidity = analyzeLiquidity(candles, swings, tolerance)
    const calculatedSetup = analyzeSetup({ currentPrice: candles[candles.length - 1]?.close ?? Number.NaN, structure, supportResistance, liquidity })
    return buildTradingContext(symbol, timeframe, candles, structure, supportResistance, liquidity, calculatedSetup)
  }, [candles, symbol, timeframe])

  useEffect(() => {
    setEvents(detectMarketEvents(context, previousContext.current))
    previousContext.current = context
  }, [context])

  useEffect(() => {
    setActivityIndex(0)
    const timer = window.setInterval(() => setActivityIndex((value) => value + 1), 2400)
    return () => window.clearInterval(timer)
  }, [])


  const response = useMemo(() => buildTradingResponse(context, events, 'WHAT_IS_HAPPENING'), [context, events])
  const activeSetup = setup ?? context.setup.preferredSetup
  const bias = context.marketStructure.bias
  const biasText = bias === 'Bullish' ? 'Buyers are currently stronger.' : bias === 'Bearish' ? 'Sellers are currently stronger.' : 'The market is not showing a clear directional edge.'
  const activityMessages = [
    activeSetup
      ? `Setup ${activeSetup.direction} is being monitored at ${activeSetup.confidence}% confluence.`
      : `No execution setup yet — waiting for structure confirmation.`,
    context.supportResistance.nearestSupport !== null
      ? `Checking support at ${context.supportResistance.nearestSupport} against the latest price.`
      : 'Scanning recent candles for a usable support level.',
    context.supportResistance.nearestResistance !== null
      ? `Watching resistance at ${context.supportResistance.nearestResistance} for a break or rejection.`
      : 'Scanning recent candles for a usable resistance level.',
    events[0]
      ? events[0].description
      : `Latest ${timeframe} candle updated at ${new Date(context.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.`,
  ]
  const liveActivity = activityMessages[activityIndex % activityMessages.length]

  return (
    <div className="space-y-3 rounded-lg border border-shafx-border bg-shafx-surface p-4 text-sm">
      <div className="flex items-start justify-between gap-2"><div><h3 className="flex items-center gap-2 font-semibold text-shafx-text"><Brain className="h-4 w-4 text-shafx-primary" /> AI Trading Agent</h3><p className="mt-1 text-[11px] text-shafx-textMuted">Reactive analysis from the live candles currently on screen.</p></div><span className="flex shrink-0 items-center gap-1 rounded border border-shafx-success/20 bg-shafx-success/10 px-2 py-1 text-[10px] font-semibold text-shafx-success"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-shafx-success" />ACTIVE</span></div>
      <div className="rounded-xl border border-shafx-accent/20 bg-shafx-bg p-3">
        <div className="flex items-center justify-between"><span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-shafx-textMuted"><Zap className="h-3 w-3 text-shafx-accent" />Current read</span><span className="text-xs font-semibold text-shafx-primary">{bias}</span></div>
        <p className="mt-1 text-xs text-shafx-text">{biasText}</p>
        <div className="mt-3 rounded-lg border border-shafx-border bg-shafx-surface px-2.5 py-2 text-[9px] leading-4 text-shafx-text">
          <div className="flex items-center justify-between gap-2"><span className="font-mono text-shafx-accent">LIVE ANALYSIS</span><span className="font-mono text-shafx-textMuted">{context.dataStatus.toUpperCase()} • {timeframe}</span></div>
          <div className="mt-1.5 min-h-8"><span className="font-mono text-shafx-accent">agent&gt;</span> {liveActivity}<span className="ml-1 animate-pulse text-shafx-accent">▍</span></div>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-[8px]"><span className="rounded border border-shafx-border bg-shafx-bg px-2 py-1.5">PRICE <b className="font-mono text-shafx-text">{context.currentPrice}</b></span><span className="rounded border border-shafx-border bg-shafx-bg px-2 py-1.5">SUPPORT <b className="font-mono text-shafx-text">{context.supportResistance.nearestSupport ?? '—'}</b></span><span className="rounded border border-shafx-border bg-shafx-bg px-2 py-1.5">RESIST <b className="font-mono text-shafx-text">{context.supportResistance.nearestResistance ?? '—'}</b></span></div>
        </div>
      </div>
      <Section icon={<Eye className="h-3 w-3" />} label="What the agent sees" text={response.reasoning} />
      <Section icon={<Target className="h-3 w-3" />} label="What it is watching" text={response.watching} />
      <Section icon={<Shield className="h-3 w-3" />} label="Safety / invalidation" text={response.invalidation} />
      {activeSetup ? <div className="rounded border border-shafx-primary/30 bg-shafx-primary/10 p-3"><div className="flex items-center justify-between"><span className="text-[10px] uppercase tracking-wider text-shafx-textMuted">Trade opportunity</span><span className="text-xs font-bold text-shafx-primary">{activeSetup.direction}</span></div><div className="mt-2 grid grid-cols-3 gap-2 text-xs"><div><span className="block text-[10px] text-shafx-textMuted">Entry</span><span className="font-mono">{activeSetup.entryPrice}</span></div><div><span className="block text-[10px] text-shafx-textMuted">Stop</span><span className="font-mono text-shafx-danger">{activeSetup.stopLoss}</span></div><div><span className="block text-[10px] text-shafx-textMuted">Target</span><span className="font-mono text-shafx-success">{activeSetup.takeProfit}</span></div></div><div className="mt-2 flex items-center justify-between text-[11px] text-shafx-textMuted"><span>Confluence {activeSetup.confidence}/100</span><span>R:R 1 : {activeSetup.riskRewardRatio}</span></div>{onReviewSetup && <button type="button" onClick={onReviewSetup} className="mt-3 min-h-11 w-full rounded bg-shafx-primary px-3 py-2 text-xs font-semibold text-white">Review this setup in SHAFX</button>}</div> : <div className="rounded border border-shafx-border bg-shafx-bg p-3 text-xs text-shafx-textMuted">No trade opportunity meets the agent's current rules. It will keep monitoring.</div>}
      {events[0] && <div className="flex items-start gap-2 rounded border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" /><div><span className="font-semibold text-yellow-500">Recent market event</span><p className="text-shafx-text">{events[0].description}</p></div></div>}
      <p className="text-[10px] text-shafx-textMuted">LIVE MARKET ANALYSIS — NOT AN EXECUTION SIGNAL. SHAFX AI reads the connected Deriv market feed; broker order execution is separately gated.</p>
    </div>
  )
}

function Section({ icon, label, text }: { icon: ReactNode; label: string; text: string }) { return <div className="space-y-1"><div className="flex items-center gap-1 text-xs uppercase tracking-wider text-shafx-textMuted">{icon}{label}</div><p className="text-shafx-text">{text}</p></div> }
