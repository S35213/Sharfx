import React, { useEffect, useMemo, useRef } from 'react'
import { ArrowDownRight, ArrowUpRight, Radio, TrendingUp } from 'lucide-react'
import type { TradeOrder } from '../../types'
import { buildSimulationFlow } from './simulationFlow'

interface Props { selectedSymbol: string; openPositions: TradeOrder[]; tradeHistory: TradeOrder[] }

const formatExactTime = (date: Date): string => {
  const pad = (value: number, width = 2): string => String(value).padStart(width, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

export const SimulationFlowChart: React.FC<Props> = ({ selectedSymbol, openPositions, tradeHistory }) => {
  const marketOpenPositions = useMemo(() => openPositions.filter((trade) => trade.symbol === selectedSymbol), [openPositions, selectedSymbol])
  const marketTradeHistory = useMemo(() => tradeHistory.filter((trade) => trade.symbol === selectedSymbol), [tradeHistory, selectedSymbol])
  const points = useMemo(() => buildSimulationFlow(marketOpenPositions, marketTradeHistory), [marketOpenPositions, marketTradeHistory])
  const eventScrollRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const element = eventScrollRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [points.length])
  const closes = points.filter((point) => point.kind === 'CLOSE')
  const cumulative: number[] = []
  closes.forEach((point, index) => { cumulative[index] = point.profit + (cumulative[index - 1] ?? 0) })
  const maxAbs = Math.max(1, ...cumulative.map((value) => Math.abs(value)))
  const width = 360
  const height = 100
  const line = cumulative.length > 0
    ? cumulative.map((value, index) => {
        const x = cumulative.length === 1 ? width / 2 : 10 + (index / (cumulative.length - 1)) * (width - 20)
        const y = height / 2 - (value / maxAbs) * (height / 2 - 10)
        return (index === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1)
      }).join(' ')
    : ''

  return (
    <section className="rounded-2xl border border-shafx-border bg-shafx-surface p-3.5 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-shafx-info/10 text-shafx-info"><TrendingUp className="h-4 w-4" /></div>
          <div><h3 className="text-sm font-semibold">Simulation flow • {selectedSymbol}</h3><p className="text-[10px] text-shafx-textMuted">Real simulator orders placed and closed in this {selectedSymbol} session.</p></div>
        </div>
        <span className="flex items-center gap-1 rounded-full border border-shafx-success/20 bg-shafx-success/5 px-2 py-1 text-[9px] font-semibold text-shafx-success"><Radio className="h-3 w-3" />LIVE SIM</span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Mini label="Placed" value={String(points.filter((point) => point.kind === 'OPEN').length)} />
        <Mini label="Closed" value={String(closes.length)} />
        <Mini label="Realized P/L" value={cumulative.length ? (cumulative[cumulative.length - 1] >= 0 ? '+' : '') + cumulative[cumulative.length - 1].toFixed(2) : '0.00'} />
      </div>

      <div className="mt-3 rounded-xl border border-shafx-border bg-shafx-bg p-2.5">
        <div className="mb-2 flex items-center justify-between text-[9px] text-shafx-textMuted"><span>Cumulative simulated P/L</span><span>{closes.length} closed events</span></div>
        <svg viewBox="0 0 360 100" className="h-24 w-full" role="img" aria-label="Cumulative simulated profit and loss chart">
          <line x1="10" y1="50" x2="350" y2="50" stroke="#273244" strokeDasharray="4 4" />
          {line && <path d={line} fill="none" stroke="#7C5CFC" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
          {cumulative.length > 0 && <circle cx={cumulative.length === 1 ? width / 2 : width - 10} cy={height / 2 - (cumulative[cumulative.length - 1] / maxAbs) * (height / 2 - 10)} r="4" fill="#22D3A5" />}
          {cumulative.length === 0 && <text x="180" y="55" textAnchor="middle" fill="#8A96A8" fontSize="9">Complete a simulated trade to build the curve.</text>}
        </svg>
      </div>

      <div ref={eventScrollRef} className="mt-3 max-h-[260px] space-y-1.5 overflow-y-auto">
        {points.slice(-12).map((point) => {
          const trade = [...marketOpenPositions, ...marketTradeHistory].find((item) => point.id.startsWith(item.id + '-'))
          const lotText = trade ? `${trade.lotSize.toFixed(2)} lots` : ''
          return (
            <div key={point.id} className="flex items-center gap-2 rounded-xl border border-shafx-border/80 bg-shafx-bg px-2.5 py-2">
              <span className={point.kind === 'OPEN' ? 'rounded-md bg-shafx-success/10 px-1.5 py-1 text-[8px] font-bold text-shafx-success' : 'rounded-md bg-shafx-accent/10 px-1.5 py-1 text-[8px] font-bold text-shafx-accent'}>{point.kind}</span>
              <span className={point.side === 'BUY' ? 'text-[9px] font-semibold text-shafx-success' : 'text-[9px] font-semibold text-shafx-danger'}>{point.side}</span>
              <span className="min-w-0 flex-1 truncate text-[10px]">
                {point.kind === 'OPEN'
                  ? `Entry ${point.price?.toFixed(5) ?? '—'} • ${lotText}`
                  : `Exit ${point.price?.toFixed(5) ?? '—'} • ${lotText} • P/L ${point.profit >= 0 ? '+' : ''}${point.profit.toFixed(2)}`}
              </span>
              <span className="text-right text-[9px] tabular text-shafx-textMuted">
                {point.kind === 'CLOSE' ? ((point.profit ?? 0) >= 0 ? <ArrowUpRight className="inline h-3 w-3 text-shafx-success" /> : <ArrowDownRight className="inline h-3 w-3 text-shafx-danger" />) : ''}
                {formatExactTime(new Date(point.time))}
              </span>
            </div>
          )
        })}
        {points.length === 0 && <div className="rounded-xl border border-dashed border-shafx-border px-3 py-3 text-[10px] text-shafx-textMuted">No simulated execution events yet.</div>}
      </div>

      <p className="mt-3 text-[9px] leading-4 text-shafx-textMuted">Open and close events use the simulator's recorded entry/exit timestamps and prices. Event volume is the actual lot size of the simulated trade.</p>
    </section>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-shafx-border bg-shafx-bg p-2.5"><div className="text-[9px] text-shafx-textMuted">{label}</div><div className="mt-1 font-mono text-sm font-semibold tabular">{value}</div></div>
}
