import React, { useMemo } from 'react'
import { BarChart3, CalendarClock, CircleDollarSign, Globe2, TrendingDown, TrendingUp } from 'lucide-react'
import type { TradeOrder } from '../../types'
import { formatCurrency, formatTimestamp } from '../../lib/format'

interface Props {
  history: TradeOrder[]
  currency?: string
}

interface MarketSummary {
  symbol: string
  trades: number
  wins: number
  losses: number
  net: number
}

export const TradeHistoryPerformance: React.FC<Props> = ({ history, currency = 'USD' }) => {
  const stats = useMemo(() => {
    const closed = history.filter((trade) => trade.status === 'closed')
    const made = closed.reduce((sum, trade) => sum + Math.max(0, Number(trade.profit ?? 0)), 0)
    const lost = closed.reduce((sum, trade) => sum + Math.max(0, -Number(trade.profit ?? 0)), 0)
    const totalStake = closed.reduce((sum, trade) => sum + Math.max(0, Number(trade.stake ?? trade.lotSize ?? 0)), 0)
    const net = made - lost
    const markets = new Map<string, MarketSummary>()

    for (const trade of closed) {
      const symbol = trade.symbol || 'Unknown'
      const profit = Number(trade.profit ?? 0)
      const current = markets.get(symbol) ?? { symbol, trades: 0, wins: 0, losses: 0, net: 0 }
      current.trades += 1
      if (profit > 0) current.wins += 1
      if (profit < 0) current.losses += 1
      current.net += profit
      markets.set(symbol, current)
    }

    return {
      closed,
      made,
      lost,
      totalStake,
      net,
      markets: [...markets.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.symbol.localeCompare(b.symbol)),
    }
  }, [history])

  return (
    <section className="h-full overflow-auto bg-[#070B10] p-3 sm:p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]"><BarChart3 className="h-3.5 w-3.5 text-shafx-accent" /> Trade results</div>
          <p className="mt-1 text-[8px] text-shafx-textMuted">Closed positions only • account performance</p>
        </div>
        <div className="text-right font-mono text-[8px] text-shafx-textMuted">{stats.closed.length} trades</div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="border border-shafx-success/25 bg-shafx-success/[0.06] p-2.5">
          <span className="flex items-center gap-1 text-[7px] uppercase tracking-[0.14em] text-shafx-success"><TrendingUp className="h-3 w-3" />Made</span>
          <div className="mt-1 font-mono text-sm font-semibold tabular-nums">{formatCurrency(stats.made, currency)}</div>
        </div>
        <div className="border border-shafx-danger/25 bg-shafx-danger/[0.06] p-2.5">
          <span className="flex items-center gap-1 text-[7px] uppercase tracking-[0.14em] text-shafx-danger"><TrendingDown className="h-3 w-3" />Lost</span>
          <div className="mt-1 font-mono text-sm font-semibold tabular-nums">{formatCurrency(stats.lost, currency)}</div>
        </div>
        <div className={'border p-2.5 ' + (stats.net >= 0 ? 'border-shafx-success/20 bg-shafx-success/[0.04]' : 'border-shafx-danger/20 bg-shafx-danger/[0.04]')}>
          <span className="flex items-center gap-1 text-[7px] uppercase tracking-[0.14em] text-shafx-textMuted"><CircleDollarSign className="h-3 w-3" />Net</span>
          <div className={'mt-1 font-mono text-sm font-semibold tabular-nums ' + (stats.net >= 0 ? 'text-shafx-success' : 'text-shafx-danger')}>{stats.net >= 0 ? '+' : ''}{formatCurrency(stats.net, currency)}</div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="border border-shafx-border bg-shafx-surface px-3 py-2">
          <span className="text-[7px] uppercase tracking-[0.14em] text-shafx-textMuted">Stake traded</span>
          <div className="mt-1 font-mono text-[10px] font-semibold tabular-nums">{formatCurrency(stats.totalStake, currency)}</div>
        </div>
        <div className="border border-shafx-border bg-shafx-surface px-3 py-2">
          <span className="text-[7px] uppercase tracking-[0.14em] text-shafx-textMuted">Closed trades</span>
          <div className="mt-1 font-mono text-[10px] font-semibold tabular-nums">{stats.closed.length}</div>
        </div>
      </div>

      <div className="mt-3 border border-shafx-border bg-shafx-surface">
        <div className="flex items-center justify-between border-b border-shafx-border px-3 py-2.5">
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.13em]"><Globe2 className="h-3.5 w-3.5 text-shafx-accent" /> Markets traded</div>
          <span className="font-mono text-[8px] text-shafx-textMuted">{stats.markets.length} markets</span>
        </div>
        {stats.markets.length === 0 ? (
          <div className="px-3 py-8 text-center text-[9px] text-shafx-textMuted">No closed trades yet.</div>
        ) : (
          <div className="divide-y divide-shafx-border">
            {stats.markets.map((market) => (
              <div key={market.symbol} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2.5">
                <div>
                  <div className="text-[10px] font-semibold">{market.symbol}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[7px] text-shafx-textMuted">
                    <span>{market.trades} trade{market.trades === 1 ? '' : 's'}</span>
                    <span>{market.wins}W</span>
                    <span>{market.losses}L</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Net</div>
                  <div className={'font-mono text-[9px] font-semibold ' + (market.net >= 0 ? 'text-shafx-success' : 'text-shafx-danger')}>{market.net >= 0 ? '+' : ''}{formatCurrency(market.net, currency)}</div>
                </div>
                <div className="text-right">
                  <CalendarClock className="ml-auto h-3 w-3 text-shafx-textMuted" />
                  <div className="mt-0.5 max-w-[88px] truncate font-mono text-[7px] text-shafx-textMuted">{formatTimestamp(stats.closed.find((trade) => trade.symbol === market.symbol)?.closeTime ?? stats.closed.find((trade) => trade.symbol === market.symbol)?.openTime ?? '')}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {stats.closed.length > 0 && (
        <div className="mt-3 border border-shafx-border bg-shafx-surface">
          <div className="border-b border-shafx-border px-3 py-2.5 text-[9px] font-semibold uppercase tracking-[0.13em]">Recent closes</div>
          <div className="divide-y divide-shafx-border">
            {stats.closed.map((trade) => {
              const profit = Number(trade.profit ?? 0)
              return (
                <div key={trade.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div>
                    <div className="flex items-center gap-2 text-[9px] font-semibold">
                      <span>{trade.symbol}</span>
                      <span className={trade.type === 'BUY' ? 'text-shafx-success' : 'text-shafx-danger'}>{trade.type}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 font-mono text-[7px] text-shafx-textMuted">
                      <span>{formatTimestamp(trade.closeTime ?? trade.openTime)}</span>
                      <span>Stake {formatCurrency(Number(trade.stake ?? trade.lotSize ?? 0), currency)}</span>
                    </div>
                  </div>
                  <div className={'text-right font-mono text-[10px] font-semibold ' + (profit >= 0 ? 'text-shafx-success' : 'text-shafx-danger')}>
                    <div>{profit >= 0 ? '+' : ''}{formatCurrency(profit, currency)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
