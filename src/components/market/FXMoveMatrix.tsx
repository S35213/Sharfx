import React, { useMemo } from 'react'
import { Grid2x2, Info } from 'lucide-react'
import type { MarketPair } from '../../types'

interface Props { pairs: MarketPair[] }

const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD']

const splitPair = (symbol: string): [string, string] | null => {
  const compact = symbol.replace('/', '').toUpperCase()
  if (compact.length !== 6) return null
  return [compact.slice(0, 3), compact.slice(3)]
}

const tone = (value: number): string => {
  if (value > 0.15) return 'bg-shafx-success/20 text-shafx-success'
  if (value > 0.03) return 'bg-shafx-success/10 text-shafx-success'
  if (value < -0.15) return 'bg-shafx-danger/20 text-shafx-danger'
  if (value < -0.03) return 'bg-shafx-danger/10 text-shafx-danger'
  return 'bg-shafx-bg text-shafx-textMuted'
}

export const FXMoveMatrix: React.FC<Props> = ({ pairs }) => {
  const matrix = useMemo(() => {
    const source = new Map<string, number>()
    pairs.forEach((pair) => {
      const split = splitPair(pair.symbol)
      if (split) source.set(`${split[0]}/${split[1]}`, pair.changePercent)
    })
    return currencies.map((row) => currencies.map((column) => row === column ? null : source.get(`${row}/${column}`) ?? (source.has(`${column}/${row}`) ? -(source.get(`${column}/${row}`) ?? 0) : null)))
  }, [pairs])

  const covered = matrix.flat().filter((value): value is number => value !== null).length

  return <section className="rounded-2xl border border-shafx-border bg-shafx-surface">
    <header className="flex items-start justify-between gap-3 border-b border-shafx-border px-4 py-3">
      <div className="flex items-center gap-2"><Grid2x2 className="h-4 w-4 text-shafx-accent" /><div><div className="text-xs font-semibold">FX move matrix</div><div className="text-[9px] text-shafx-textMuted">Watchlist-derived pair moves • {covered} populated cells</div></div></div>
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
            return <div key={column} className={`flex h-10 items-center justify-center rounded-lg border border-shafx-border font-mono tabular ${value === null ? 'bg-shafx-bg/50 text-shafx-textMuted' : tone(value)}`}>
              {row === column ? '—' : value === null ? '·' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`}
            </div>
          })}
        </React.Fragment>)}
      </div>
    </div>
    <div className="flex items-start gap-2 border-t border-shafx-border px-4 py-2.5 text-[9px] leading-4 text-shafx-textMuted"><Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-shafx-accent" />This is a derived view of the currently loaded pair returns, not an independent economic “currency strength” feed.</div>
  </section>
}
