import React, { useEffect, useMemo, useState } from 'react'
import { Grid2x2, Info } from 'lucide-react'
import type { MarketPair } from '../../types'

interface Props { pairs: MarketPair[]; selectedSymbol?: string }

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
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 900)
    return () => window.clearInterval(timer)
  }, [])

  const matrix = useMemo(() => {
    const strength = new Map<string, number>(currencies.map((currency) => [currency, 0] as const))
    pairs.forEach((pair) => {
      const split = splitPair(pair.symbol)
      if (!split) return
      const move = Number(pair.changePercent)
      if (!Number.isFinite(move)) return
      strength.set(split[0], (strength.get(split[0]) ?? 0) + move / 2)
      strength.set(split[1], (strength.get(split[1]) ?? 0) - move / 2)
    })

    return currencies.map((row, rowIndex) => currencies.map((column, columnIndex) => {
      if (row === column) return null
      const rowDrift = Math.sin(tick * 0.72 + rowIndex * 0.63) * 0.018
      const columnDrift = Math.sin(tick * 0.72 + columnIndex * 0.63) * 0.018
      return Number(((strength.get(row) ?? 0) - (strength.get(column) ?? 0) + rowDrift - columnDrift).toFixed(2))
    }))
  }, [pairs, tick])

  const covered = matrix.flat().filter((value): value is number => value !== null).length
  const selected = splitPair(selectedSymbol ?? '')
  const isSelectedCell = (row: string, column: string): boolean => Boolean(selected && ((selected[0] === row && selected[1] === column) || (selected[0] === column && selected[1] === row)))

  return <section className="rounded-2xl border border-shafx-border bg-shafx-surface">
    <header className="flex items-start justify-between gap-3 border-b border-shafx-border px-4 py-3">
      <div className="flex items-center gap-2"><Grid2x2 className="h-4 w-4 text-shafx-accent" /><div><div className="flex items-center gap-2 text-xs font-semibold">FX move matrix <span className="inline-flex items-center gap-1 rounded-full border border-shafx-success/20 bg-shafx-success/5 px-1.5 py-0.5 text-[8px] font-semibold text-shafx-success"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-shafx-success" />LIVE SIM</span></div><div className="text-[9px] text-shafx-textMuted">Watchlist-derived relative moves • updating every ~1s • {covered} active cells</div></div></div>
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
            const selectedCell = isSelectedCell(row, column)
            return <div key={column} className={`flex h-10 items-center justify-center rounded-lg border font-mono tabular transition-colors ${selectedCell ? 'border-shafx-accent bg-shafx-accent/10 text-shafx-accent' : value === null ? 'border-shafx-border bg-shafx-bg/50 text-shafx-textMuted' : `border-shafx-border ${tone(value)}`}`}>
              {row === column ? '—' : value === null ? '·' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`}
            </div>
          })}
        </React.Fragment>)}
      </div>
    </div>
    <div className="flex items-start gap-2 border-t border-shafx-border px-4 py-2.5 text-[9px] leading-4 text-shafx-textMuted"><Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-shafx-accent" />Cells are fully populated from the loaded FX pair returns; cross-pair cells are inferred from the relative currency move model and remain simulated.</div>
  </section>
}
