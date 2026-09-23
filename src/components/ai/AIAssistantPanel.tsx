import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Brain, Eye, Info, Shield, Target, Zap } from 'lucide-react'
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

  const response = useMemo(() => buildTradingResponse(context, events, 'WHAT_IS_HAPPENING'), [context, events])
  const activeSetup = setup ?? context.setup.preferredSetup
  const bias = context.marketStructure.bias
  const biasText = bias === 'Bullish' ? 'Buyers are currently stronger.' : bias === 'Bearish' ? 'Sellers are currently stronger.' : 'The market is not showing a clear directional edge.'

  return (
    <div className="space-y-3 rounded-lg border border-shafx-border bg-shafx-surface p-4 text-sm">
      <div className="flex items-start justify-between gap-2"><div><h3 className="flex items-center gap-2 font-semibold text-shafx-text"><Brain className="h-4 w-4 text-shafx-primary" /> AI Trading Agent</h3><p className="mt-1 text-[11px] text-shafx-textMuted">Monitoring the chart and preparing an action when conditions line up.</p></div><span className="flex shrink-0 items-center gap-1 rounded border border-yellow-500/30 bg-yellow-500/10 px-2 py-1 text-[10px] font-semibold text-yellow-500"><Info className="h-3 w-3" />SIMULATOR</span></div>
      <div className="rounded border border-shafx-border bg-shafx-bg p-3"><div className="flex items-center justify-between"><span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-shafx-textMuted"><Zap className="h-3 w-3" />Current read</span><span className="text-xs font-semibold text-shafx-primary">{bias}</span></div><p className="mt-1 text-xs text-shafx-text">{biasText}</p></div>
      <Section icon={<Eye className="h-3 w-3" />} label="What the agent sees" text={response.reasoning} />
      <Section icon={<Target className="h-3 w-3" />} label="What it is watching" text={response.watching} />
      <Section icon={<Shield className="h-3 w-3" />} label="Safety / invalidation" text={response.invalidation} />
      {activeSetup ? <div className="rounded border border-shafx-primary/30 bg-shafx-primary/10 p-3"><div className="flex items-center justify-between"><span className="text-[10px] uppercase tracking-wider text-shafx-textMuted">Trade opportunity</span><span className="text-xs font-bold text-shafx-primary">{activeSetup.direction}</span></div><div className="mt-2 grid grid-cols-3 gap-2 text-xs"><div><span className="block text-[10px] text-shafx-textMuted">Entry</span><span className="font-mono">{activeSetup.entryPrice}</span></div><div><span className="block text-[10px] text-shafx-textMuted">Stop</span><span className="font-mono text-shafx-danger">{activeSetup.stopLoss}</span></div><div><span className="block text-[10px] text-shafx-textMuted">Target</span><span className="font-mono text-shafx-success">{activeSetup.takeProfit}</span></div></div><div className="mt-2 flex items-center justify-between text-[11px] text-shafx-textMuted"><span>Confluence {activeSetup.confidence}/100</span><span>R:R 1 : {activeSetup.riskRewardRatio}</span></div>{onReviewSetup && <button type="button" onClick={onReviewSetup} className="mt-3 min-h-11 w-full rounded bg-shafx-primary px-3 py-2 text-xs font-semibold text-white">Review this trade in the simulator</button>}</div> : <div className="rounded border border-shafx-border bg-shafx-bg p-3 text-xs text-shafx-textMuted">No trade opportunity meets the agent's current rules. It will keep monitoring.</div>}
      {events[0] && <div className="flex items-start gap-2 rounded border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" /><div><span className="font-semibold text-yellow-500">Recent market event</span><p className="text-shafx-text">{events[0].description}</p></div></div>}
      <p className="text-[10px] text-shafx-textMuted">SIMULATED — NOT FINANCIAL ADVICE. The agent cannot place real orders or connect to a broker.</p>
    </div>
  )
}

function Section({ icon, label, text }: { icon: ReactNode; label: string; text: string }) { return <div className="space-y-1"><div className="flex items-center gap-1 text-xs uppercase tracking-wider text-shafx-textMuted">{icon}{label}</div><p className="text-shafx-text">{text}</p></div> }
