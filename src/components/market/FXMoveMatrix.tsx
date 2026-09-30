import React, { useMemo } from 'react'
import { ArrowDown, ArrowUp, Grid2x2, Info, Minus } from 'lucide-react'
import type { MarketPair } from '../../types'

interface Props { pairs: MarketPair[] }

const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD']

const splitPair = (symbol: string): [string, string] | null => {
  const compact = symbol.replace('/', '').toUpperCase()
  if (compact.length !== 6) return null
  return [compact.slice(0, 3), compact.slice(3)]
}

const cellTone = (value: number): string => {
  const magnitude = Math.abs(value)
  if (value > 0) {
    if (magnitude >= 0.15) return 'border-shafx-success/50 bg-shafx-success/35 text-shafx-success'
    if (magnitude >= 0.03) return 'border-shafx-success/35 bg-shafx-success/20 text-shafx-success'
    return 'border-shafx-success/20 bg-shafx-success/10 text-shafx-success'
  }
  if (value < 0) {
    if (magnitude >= 0.15) return 'border-shafx-danger/50 bg-shafx-danger/35 text-shafx-danger'
    if (magnitude >= 0.03) return 'border-shafx-danger/35 bg-shafx-danger/20 text-shafx-danger'
    return 'border-shafx-danger/20 bg-shafx-danger/10 text-shafx-danger'
  }
  return 'border-shafx-border bg-shafx-bg/70 text-shafx-textMuted'
}

const cellIcon = (value: number): React.ReactNode => {
  if (value > 0) return <ArrowUp className="h-2.5 w-2.5" aria-hidden="true" />
  if (value < 0) return <ArrowDown className="h-2.5 w-2.5" aria-hidden="true" />
  return <Minus className="h-2.5 w-2.5" aria-hidden="true" />
}

export const FXMoveMatrix: React.FC<Props> = ({ pairs }) => {
  const matrix = useMemo(() => {
    const strength: Record<string, number> = {}
    currencies.forEach((currency) => { strength[currency] = 0 })

    pairs.forEach((pair) => {
      const split = splitPair(pair.symbol)
      if (!split) return
      const move = Number(pair.changePercent)
      if (!Number.isFinite(move)) return
      strength[split[0]] += move / 2
      strength[split[1]] -= move / 2
    })

    return currencies.map((row) => currencies.map((column) => {
      if (row === column) return null
      return Number((strength[row] - strength[column]).toFixed(2))
    }))
  }, [pairs])

  const covered = matrix.flat().filter((value): value is number => value !== null).length

  return <section className="rounded-2xl border border-shafx-border bg-shafx-surface">
    <header className="flex items-start justify-between gap-3 border-b border-shafx-border px-4 py-3">
      <div className="flex items-center gap-2"><Grid2x2 className="h-4 w-4 text-shafx-accent" /><div><div className="flex items-center gap-2 text-xs font-semibold">FX move matrix <span className="inline-flex items-center gap-1 rounded-full border border-shafx-success/20 bg-shafx-success/5 px-1.5 py-0.5 text-[8px] font-semibold text-shafx-success"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-shafx-success" />LIVE</span></div><div className="text-[9px] text-shafx-textMuted">Live relative currency strength • green = stronger • red = weaker • {covered} active cells</div></div></div>
      <Info className="h-3.5 w-3.5 text-shafx-textMuted" />
    </header>
    <div className="overflow-auto p-3">
      <div className="grid min-w-[520px] grid-cols-9 gap-1 text-[8px]">
        <div />
        {currencies.map((currency) => <div key={currency} className="flex h-7 items-center justify-center font-semibold text-shafx-textMuted">{currency}</div>)}
        {currencies.map((row, rowIndex) => <React.Fragment key={row}>
          <div className="flex h-10 items-center font-semibold text-shafx-textMuted">{row}</div>
          {currencies.map((column, columnIndex) => {
            const value = matrix[rowIndex][columnIndex]
            return <div key={column} className={`flex h-10 items-center justify-center gap-1 rounded-lg border font-mono tabular ${value === null ? 'border-shafx-border bg-shafx-bg/50 text-shafx-textMuted' : cellTone(value)}`}>
              {row === column ? '—' : value === null ? '·' : <><span aria-hidden="true">{cellIcon(value)}</span><span>{value > 0 ? '+' : ''}{value.toFixed(2)}%</span></>}
            </div>
          })}
        </React.Fragment>)}
      </div>
    </div>
    <div className="flex items-start gap-2 border-t border-shafx-border px-4 py-2.5 text-[9px] leading-4 text-shafx-textMuted"><Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-shafx-accent" />All non-diagonal cells are derived from the loaded FX pair returns; cross-pair cells use a relative currency-move model and remain simulated.</div>
  </section>
}
