import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Activity, AlertTriangle, Brain, Eye, Info, Shield, Target } from 'lucide-react'
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

const activitySteps = [
  'Reading the latest candle and structure…',
  'Comparing momentum across nearby timeframes…',
  'Checking support, resistance and liquidity…',
  'Testing the setup against invalidation…',
]

export function AIAssistantPanel({ symbol, timeframe, candles, setup = null, onReviewSetup }: Props) {
  const [events, setEvents] = useState<MarketEvent[]>([])
  const [activityIndex, setActivityIndex] = useState(0)
  const [typedActivity, setTypedActivity] = useState('')
  const [pulse, setPulse] = useState(0)
  const previousContextRef = useRef<AITradingContext | null>(null)

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
    setEvents(detectMarketEvents(context, previousContextRef.current))
    previousContextRef.current = context
  }, [context, previousContextRef])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActivityIndex((value) => (value + 1) % activitySteps.length)
      setPulse((value) => (value + 1) % 3)
    }, 1800)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const phrase = activitySteps[activityIndex]
    let index = 0
    setTypedActivity('')
    const timer = window.setInterval(() => {
      index += 1
      setTypedActivity(phrase.slice(0, index))
      if (index >= phrase.length) window.clearInterval(timer)
    }, 22)
    return () => window.clearInterval(timer)
  }, [activityIndex])

  const response = useMemo(() => buildTradingResponse(context, events, 'WHAT_IS_HAPPENING'), [context, events])
  const activeSetup = setup ?? context.setup.preferredSetup
  const bias = context.marketStructure.bias
  const biasText = bias === 'Bullish' ? 'Buyers are currently stronger.' : bias === 'Bearish' ? 'Sellers are currently stronger.' : 'The market is not showing a clear directional edge.'
  const currentPrice = candles[candles.length - 1]?.close ?? Number.NaN
  const biasClass = bias === 'Bullish' ? 'text-shafx-success' : bias === 'Bearish' ? 'text-shafx-danger' : 'text-shafx-textMuted'

  return (
    <section className="space-y-3 rounded-2xl border border-shafx-border bg-shafx-surface p-3.5 sm:p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-shafx-accent/10 text-shafx-accent"><Brain className="h-4 w-4" /></div>
          <div className="min-w-0"><h3 className="text-sm font-semibold">AI Trading Agent</h3><p className="mt-0.5 text-[9px] text-shafx-textMuted">Local simulator analysis that updates with the selected market and timeframe.</p></div>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-shafx-accent/20 bg-shafx-accent/[0.05] px-2 py-1 text-[8px] font-semibold text-shafx-accent"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-shafx-accent" />ACTIVE</span>
      </header>

      <div className="rounded-xl border border-shafx-accent/20 bg-shafx-bg p-3">
        <div className="flex items-center justify-between gap-2 text-[8px] uppercase tracking-[0.16em] text-shafx-textMuted"><span className="flex items-center gap-1"><Activity className="h-3 w-3 text-shafx-accent" />Monitoring {timeframe}</span><span className="font-mono">{Number.isFinite(currentPrice) ? currentPrice.toFixed(symbol.includes('JPY') ? 3 : 5) : '—'}</span></div>
        <div className="mt-2 min-h-7 rounded-lg border border-shafx-border bg-shafx-surface px-2.5 py-2 font-mono text-[9px] text-shafx-text"><span className="text-shafx-accent">agent&gt;</span> {typedActivity}<span className={pulse === 2 ? 'opacity-0' : 'animate-pulse'}>▍</span></div>
        <div className="mt-2 flex items-center gap-1">{[0,1,2,3,4,5,6,7].map((item) => <span key={item} className={item <= pulse + 3 ? 'h-1.5 flex-1 rounded-full bg-shafx-accent/80 transition-all duration-300' : 'h-1.5 flex-1 rounded-full bg-shafx-border'} />)}</div>
      </div>

      <div className="rounded-xl border border-shafx-border bg-shafx-bg p-3">
        <div className="flex items-center justify-between"><span className={`text-[8px] uppercase tracking-[0.16em] ${biasClass}`}>{biasText}</span><span className="font-mono text-[8px] text-shafx-textMuted">{context.marketStructure.status}</span></div>
        <div className="mt-2 text-[10px] leading-4 text-shafx-text">{response.reasoning}</div>
      </div>

      <Section icon={<Eye className="h-3 w-3" />} label="Watching now" text={response.watching} />
      <Section icon={<Shield className="h-3 w-3" />} label="Invalidation" text={response.invalidation} />

      {activeSetup ? (
        <div className="rounded-xl border border-shafx-success/25 bg-shafx-success/[0.04] p-3">
          <div className="flex items-center justify-between gap-2"><span className="text-[8px] uppercase tracking-[0.16em] text-shafx-textMuted">Live setup</span><span className={`text-xs font-bold ${activeSetup.direction === 'BUY' ? 'text-shafx-success' : 'text-shafx-danger'}`}>{activeSetup.direction}</span></div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[9px]">
            <div><span className="block text-shafx-textMuted">Entry</span><span className="font-mono">{activeSetup.entryPrice}</span></div>
            <div><span className="block text-shafx-textMuted">Stop</span><span className="font-mono text-shafx-danger">{activeSetup.stopLoss}</span></div>
            <div><span className="block text-shafx-textMuted">Target</span><span className="font-mono text-shafx-success">{activeSetup.takeProfit}</span></div>
          </div>
          <div className="mt-2 flex items-center justify-between text-[9px] text-shafx-textMuted"><span>Confidence <strong className="font-mono text-shafx-accent">{activeSetup.confidence}/100</strong></span><span>R:R <strong className="font-mono">1:{activeSetup.riskRewardRatio}</strong></span></div>
          {onReviewSetup && <button type="button" onClick={onReviewSetup} className="mt-3 min-h-11 w-full rounded-xl bg-shafx-primary px-3 py-2 text-xs font-semibold text-white transition-transform active:scale-[.99]">Review this simulated setup</button>}
        </div>
      ) : (
        <div className="rounded-xl border border-shafx-border bg-shafx-bg p-3 text-[10px] text-shafx-textMuted">No executable setup right now. The monitor will keep watching the live simulator stream.</div>
      )}

      {events[0] && <div className="flex items-start gap-2 rounded-xl border border-shafx-warning/20 bg-shafx-warning/[0.04] p-2.5 text-[9px]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-shafx-warning" /><div><span className="font-semibold text-shafx-warning">Market event</span><p className="mt-0.5 text-shafx-text">{events[0].description}</p></div></div>}

      <p className="text-[9px] text-shafx-textMuted">SIMULATED — analysis is generated locally from the candles shown on this screen.</p>
    </section>
  )
}

function Section({ icon, label, text }: { icon: ReactNode; label: string; text: string }) {
  return <div className="rounded-xl border border-shafx-border bg-shafx-bg p-3"><div className="flex items-center gap-1 text-[8px] uppercase tracking-[0.14em] text-shafx-textMuted">{icon}{label}</div><p className="mt-1.5 text-[10px] leading-4 text-shafx-text">{text}</p></div>
}
