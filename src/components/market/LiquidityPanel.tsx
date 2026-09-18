import React, { useMemo } from 'react'
import { Layers3, Radio, Waves } from 'lucide-react'

interface Props {
  symbol: string
  price: number
  precision: number
  pipSize?: number
  live?: boolean
}

export const LiquidityPanel: React.FC<Props> = ({ symbol, price, precision, pipSize = 0.0001, live = false }) => {
  const rows = useMemo(() => {
    const step = pipSize
    const levels = Array.from({ length: 6 }, (_, index) => index + 1)
    const asks = levels.map((level) => ({ price: Number((price + step * level).toFixed(precision)), size: 18 + ((level * 17) % 61), side: 'ask' as const }))
    const bids = levels.map((level) => ({ price: Number((price - step * level).toFixed(precision)), size: 22 + ((level * 23) % 72), side: 'bid' as const }))
    return { asks: asks.reverse(), bids }
  }, [pipSize, precision, price])

  const max = Math.max(...rows.asks.map((row) => row.size), ...rows.bids.map((row) => row.size))
  const askTotal = rows.asks.reduce((sum, row) => sum + row.size, 0)
  const bidTotal = rows.bids.reduce((sum, row) => sum + row.size, 0)
  const imbalance = ((bidTotal - askTotal) / Math.max(1, bidTotal + askTotal)) * 100

  return <section className="flex h-full flex-col rounded-2xl border border-shafx-border bg-shafx-surface">
    <header className="flex items-center justify-between border-b border-shafx-border px-4 py-3">
      <div className="flex items-center gap-2">
        <Layers3 className="h-4 w-4 text-shafx-accent" />
        <div><div className="text-xs font-semibold">Liquidity ladder</div><div className="text-[9px] text-shafx-textMuted">{symbol} • {live ? 'provider stream' : 'SHAFX depth preview'}</div></div>
      </div>
      <span className="inline-flex items-center gap-1 rounded-full border border-shafx-border bg-shafx-bg px-2 py-1 text-[9px] text-shafx-textMuted"><Radio className={`h-3 w-3 ${live ? 'text-shafx-success' : 'text-shafx-warning'}`} />{live ? 'LIVE' : 'PREVIEW'}</span>
    </header>
    <div className="grid grid-cols-[1fr_72px_1fr] border-b border-shafx-border px-3 py-2 text-[9px] uppercase tracking-[0.14em] text-shafx-textMuted"><span className="text-right">Sell</span><span className="text-center">Price</span><span>Buy</span></div>
    <div className="flex-1 overflow-auto px-2 py-2">
      {rows.asks.map((row) => <div key={row.price} className="relative grid grid-cols-[1fr_72px_1fr] items-center px-1 py-2.5 text-[10px]">
        <div className="flex justify-end pr-2"><div className="relative h-5 w-[88%] overflow-hidden rounded bg-shafx-danger/5"><div className="absolute inset-y-0 right-0 rounded bg-shafx-danger/20" style={{ width: `${Math.round(row.size / max * 100)}%` }} /></div></div>
        <span className="z-10 text-center font-mono text-shafx-text">{row.price.toFixed(precision)}</span>
        <span className="text-left font-mono text-shafx-danger">{row.size}</span>
      </div>)}
      <div className="my-1 rounded-xl border border-shafx-accent/30 bg-shafx-accent/5 px-3 py-3">
        <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.14em] text-shafx-textMuted"><span>Mid</span><span>Spread</span></div>
        <div className="mt-1 flex items-center justify-between"><strong className="font-mono text-sm">{price.toFixed(precision)}</strong><span className="font-mono text-shafx-textMuted">{(pipSize).toFixed(precision)} base</span></div>
      </div>
      {rows.bids.map((row) => <div key={row.price} className="relative grid grid-cols-[1fr_72px_1fr] items-center px-1 py-2.5 text-[10px]">
        <span className="text-right font-mono text-shafx-success">{row.size}</span>
        <span className="z-10 text-center font-mono text-shafx-text">{row.price.toFixed(precision)}</span>
        <div className="pl-2"><div className="relative h-5 w-[88%] overflow-hidden rounded bg-shafx-success/5"><div className="absolute inset-y-0 left-0 rounded bg-shafx-success/20" style={{ width: `${Math.round(row.size / max * 100)}%` }} /></div></div>
      </div>)}
    </div>
    <footer className="grid grid-cols-3 gap-2 border-t border-shafx-border p-3 text-[9px]">
      <div className="rounded-lg border border-shafx-border bg-shafx-bg p-2"><span className="block text-shafx-textMuted">Bid depth</span><strong className="mt-1 block font-mono text-shafx-success">{bidTotal}</strong></div>
      <div className="rounded-lg border border-shafx-border bg-shafx-bg p-2"><span className="block text-shafx-textMuted">Ask depth</span><strong className="mt-1 block font-mono text-shafx-danger">{askTotal}</strong></div>
      <div className="rounded-lg border border-shafx-border bg-shafx-bg p-2"><span className="block text-shafx-textMuted">Imbalance</span><strong className={`mt-1 block font-mono ${imbalance >= 0 ? 'text-shafx-success' : 'text-shafx-danger'}`}>{imbalance >= 0 ? '+' : ''}{imbalance.toFixed(1)}%</strong></div>
    </footer>
    <div className="border-t border-shafx-border px-4 py-2 text-[9px] leading-relaxed text-shafx-textMuted"><Waves className="mr-1 inline h-3 w-3 text-shafx-accent" />This is a depth preview until a connected provider supplies normalized depth-of-market data.</div>
  </section>
}
