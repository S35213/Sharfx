import React, { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, Droplets, Layers, Minus, Target, TrendingDown, TrendingUp } from 'lucide-react'
import type { MarketAnalysis } from '../../types'

interface Props {
  analysis: MarketAnalysis
  pricePrecision: number
  pipSize?: number
  currentPrice?: number
  timeframe?: string
}

export const MarketAnalysisPanel: React.FC<Props> = ({ analysis, pricePrecision, pipSize = 0.0001, currentPrice, timeframe = 'H1' }) => {
  const [pulse, setPulse] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setPulse((value) => (value + 1) % 4), 900)
    return () => window.clearInterval(timer)
  }, [])

  const icon = analysis.bias === 'Bullish'
    ? <TrendingUp className="h-4 w-4" />
    : analysis.bias === 'Bearish'
      ? <TrendingDown className="h-4 w-4" />
      : <Minus className="h-4 w-4" />
  const biasClass = analysis.bias === 'Bullish'
    ? 'text-shafx-success'
    : analysis.bias === 'Bearish'
      ? 'text-shafx-danger'
      : 'text-shafx-textMuted'
  const fmt = (value: number | null): string => value === null ? '—' : value.toFixed(pricePrecision)

  const distanceToSupport = useMemo(() => {
    if (typeof currentPrice !== 'number' || analysis.supportResistance.nearestSupport === null) return null
    return Math.abs(currentPrice - analysis.supportResistance.nearestSupport) / Math.max(pipSize, Number.EPSILON)
  }, [analysis.supportResistance.nearestSupport, currentPrice, pipSize])
  const distanceToResistance = useMemo(() => {
    if (typeof currentPrice !== 'number' || analysis.supportResistance.nearestResistance === null) return null
    return Math.abs(analysis.supportResistance.nearestResistance - currentPrice) / Math.max(pipSize, Number.EPSILON)
  }, [analysis.supportResistance.nearestResistance, currentPrice, pipSize])

  const liveSentence =
    analysis.bias === 'Bullish'
      ? `Buyers are driving the current structure; the monitor is checking whether price can hold above support.`
      : analysis.bias === 'Bearish'
        ? `Sellers are pressing the current structure; the monitor is watching resistance and downside liquidity.`
        : `Price is balanced right now; the monitor is waiting for a clean structure break before calling direction.`

  return (
    <section className="space-y-3 rounded-2xl border border-shafx-border bg-shafx-surface p-3.5 sm:p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-shafx-accent/10 text-shafx-accent"><Activity className="h-4 w-4" /></div>
          <div>
            <h3 className="text-sm font-semibold">Market Analysis</h3>
            <p className="mt-0.5 text-[9px] text-shafx-textMuted">Reactive structure • liquidity • price monitor</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-shafx-success/20 bg-shafx-success/[0.05] px-2 py-1 text-[8px] font-semibold text-shafx-success">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-shafx-success" />LIVE READ
        </span>
      </header>

      <div className="rounded-xl border border-shafx-accent/20 bg-shafx-bg p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[8px] uppercase tracking-[0.16em] text-shafx-textMuted">Current read <span className="font-mono text-shafx-accent">{timeframe}</span></div>
            <div className={`mt-1 flex items-center gap-2 text-xl font-semibold ${biasClass}`}>{icon}{analysis.bias}</div>
          </div>
          {typeof currentPrice === 'number' && Number.isFinite(currentPrice) && <div className="text-right"><div className="text-[8px] uppercase tracking-[0.14em] text-shafx-textMuted">Last</div><div className="mt-1 font-mono text-sm font-semibold tabular">{currentPrice.toFixed(pricePrecision)}</div></div>}
        </div>
        <p className="mt-3 text-[10px] leading-4 text-shafx-text">{liveSentence}</p>
        <div className="mt-3 flex items-end gap-1.5">
          {[0,1,2,3,4,5,6].map((bar) => <span key={bar} className="flex-1 rounded-full bg-shafx-border" style={{ height: `${6 + ((bar + pulse) % 4) * 3}px` }} />)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-shafx-border bg-shafx-bg p-2.5">
          <span className="flex items-center gap-1 text-[8px] uppercase tracking-[0.14em] text-shafx-textMuted"><Layers className="h-3 w-3" /> Structure</span>
          <div className="mt-1 text-xs font-semibold">{analysis.structure.type}</div>
          <div className="mt-0.5 text-[9px] text-shafx-textMuted">{analysis.structure.status}</div>
        </div>
        <div className="rounded-xl border border-shafx-border bg-shafx-bg p-2.5">
          <span className="flex items-center gap-1 text-[8px] uppercase tracking-[0.14em] text-shafx-textMuted"><Target className="h-3 w-3" /> Distances</span>
          <div className="mt-1 font-mono text-[9px] tabular">{distanceToSupport === null ? 'Support —' : `S ${distanceToSupport.toFixed(1)}p`}</div>
          <div className="mt-0.5 font-mono text-[9px] tabular">{distanceToResistance === null ? 'Resistance —' : `R ${distanceToResistance.toFixed(1)}p`}</div>
        </div>
      </div>

      <div className="rounded-xl border border-shafx-border bg-shafx-bg p-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-[8px] uppercase tracking-[0.15em] text-shafx-textMuted"><Droplets className="h-3 w-3" /> Liquidity watch</span>
          <span className="font-mono text-[8px] text-shafx-textMuted">AUTO</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[9px]">
          <div><span className="block text-shafx-textMuted">Prev High</span><span className="font-mono tabular">{fmt(analysis.liquidity.previousHigh)}</span></div>
          <div><span className="block text-shafx-textMuted">Prev Low</span><span className="font-mono tabular">{fmt(analysis.liquidity.previousLow)}</span></div>
        </div>
        {(analysis.liquidity.equalLows || analysis.liquidity.equalHighs) && (
          <div className="mt-2 flex flex-wrap gap-1.5 text-[8px] text-shafx-warning">
            {analysis.liquidity.equalHighs && <span className="rounded-full border border-shafx-warning/20 bg-shafx-warning/[0.04] px-2 py-1"><AlertTriangle className="mr-1 inline h-3 w-3" />Equal highs</span>}
            {analysis.liquidity.equalLows && <span className="rounded-full border border-shafx-warning/20 bg-shafx-warning/[0.04] px-2 py-1"><AlertTriangle className="mr-1 inline h-3 w-3" />Equal lows</span>}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-shafx-border bg-shafx-surfaceHover/40 px-3 py-2.5 text-[9px]">
        <div className="flex items-center justify-between"><span className="text-shafx-textMuted">Nearest Support</span><span className="font-mono text-shafx-success tabular">{fmt(analysis.supportResistance.nearestSupport)}</span></div>
        <div className="mt-1.5 flex items-center justify-between"><span className="text-shafx-textMuted">Nearest Resistance</span><span className="font-mono text-shafx-danger tabular">{fmt(analysis.supportResistance.nearestResistance)}</span></div>
      </div>
    </section>
  )
}
