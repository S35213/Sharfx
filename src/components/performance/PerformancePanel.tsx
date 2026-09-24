import { useMemo, useState } from 'react'
import { Activity, ArrowDownRight, ArrowUpRight, Award, BarChart3, Filter, History, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import type { TradeOrder } from '../../types'
import { formatCurrency, formatPercent, formatPrice, formatTimestamp } from '../../lib/format'

interface Props { tradeHistory: TradeOrder[]; currency: string; showTrades?: boolean }

export function PerformancePanel({ tradeHistory, currency, showTrades = false }: Props) {
  const stats = useMemo(() => {
    const closed = tradeHistory.filter((trade) => trade.status === 'closed' && Number.isFinite(trade.profit ?? NaN))
    const profits = closed.map((trade) => trade.profit ?? 0)
    const wins = profits.filter((profit) => profit > 0)
    const losses = profits.filter((profit) => profit < 0)
    const net = profits.reduce((sum, profit) => sum + profit, 0)
    const grossProfit = wins.reduce((sum, profit) => sum + profit, 0)
    const grossLoss = Math.abs(losses.reduce((sum, profit) => sum + profit, 0))
    const avgWin = wins.length ? grossProfit / wins.length : 0
    const avgLoss = losses.length ? grossLoss / losses.length : 0
    const expectancy = closed.length ? net / closed.length : 0
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null
    const best = profits.length ? Math.max(...profits) : 0
    const worst = profits.length ? Math.min(...profits) : 0
    const averageRR = closed.length ? closed.reduce((sum, trade) => sum + trade.riskRewardRatio, 0) / closed.length : 0
    return {
      closed,
      wins: wins.length,
      losses: losses.length,
      net,
      grossProfit,
      grossLoss,
      avgWin,
      avgLoss,
      expectancy,
      profitFactor,
      best,
      worst,
      averageRR,
      winRate: closed.length ? wins.length / closed.length * 100 : 0,
    }
  }, [tradeHistory])

  const [filter, setFilter] = useState<'all' | 'wins' | 'losses'>('all')
  const visibleTrades = useMemo(() => {
    if (filter === 'wins') return stats.closed.filter((trade) => (trade.profit ?? 0) > 0)
    if (filter === 'losses') return stats.closed.filter((trade) => (trade.profit ?? 0) < 0)
    return stats.closed
  }, [filter, stats.closed])

  return <section className="rounded-2xl border border-shafx-border bg-shafx-surface p-3.5 text-sm shadow-[0_14px_36px_rgba(0,0,0,.18)] sm:p-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-2 font-semibold text-shafx-text"><BarChart3 className="h-4 w-4 text-shafx-primary" /> {showTrades ? 'Trade history' : 'Trading performance'}</h3>
        <p className="mt-1 text-[10px] leading-4 text-shafx-textMuted">{showTrades ? 'Every completed simulator trade, with wins, losses and the result of each position.' : 'A simple scorecard for your completed simulated trades.'}</p>
      </div>
      <span className="rounded-lg border border-shafx-border bg-shafx-bg px-2 py-1 font-mono text-[8px] font-semibold uppercase tracking-[0.12em] text-shafx-textMuted">SIMULATOR</span>
    </div>

    {stats.closed.length === 0 ? (
      <div className="mt-3 rounded-xl border border-dashed border-shafx-border bg-shafx-bg/70 p-5 text-center">
        <History className="mx-auto h-7 w-7 text-shafx-textMuted" />
        <p className="mt-2 text-xs font-semibold text-shafx-text">No completed trades yet</p>
        <p className="mt-1 text-[10px] leading-4 text-shafx-textMuted">Open and close a simulated position to build your history.</p>
      </div>
    ) : (
      <div className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Net P/L" value={formatCurrency(stats.net, currency)} positive={stats.net >= 0} />
          <Metric label="Win rate" value={formatPercent(stats.winRate)} />
          <Metric label="Wins / losses" value={`${stats.wins} / ${stats.losses}`} />
          <Metric label="Trades" value={String(stats.closed.length)} />
        </div>

        {showTrades && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-shafx-success/20 bg-shafx-success/[0.045] p-3">
                <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.14em] text-shafx-success"><TrendingUp className="h-3.5 w-3.5" /> Profit</div>
                <strong className="mt-1 block font-mono text-lg tabular text-shafx-success">+{formatCurrency(stats.grossProfit, currency)}</strong>
                <span className="mt-1 block text-[9px] text-shafx-textMuted">{stats.wins} winning trade{stats.wins === 1 ? '' : 's'} • avg {formatCurrency(stats.avgWin, currency)}</span>
              </div>
              <div className="rounded-xl border border-shafx-danger/20 bg-shafx-danger/[0.045] p-3">
                <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.14em] text-shafx-danger"><TrendingDown className="h-3.5 w-3.5" /> Loss</div>
                <strong className="mt-1 block font-mono text-lg tabular text-shafx-danger">-{formatCurrency(stats.grossLoss, currency)}</strong>
                <span className="mt-1 block text-[9px] text-shafx-textMuted">{stats.losses} losing trade{stats.losses === 1 ? '' : 's'} • avg -{formatCurrency(stats.avgLoss, currency)}</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 rounded-xl border border-shafx-border bg-shafx-bg/60 p-2">
              <div className="flex items-center gap-1.5 text-[9px] font-semibold text-shafx-text"><Filter className="h-3.5 w-3.5 text-shafx-accent" />Filter results</div>
              <div className="flex gap-1">
                {([
                  ['all', 'All'],
                  ['wins', 'Wins'],
                  ['losses', 'Losses'],
                ] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={filter === key} className={filter === key ? 'min-h-8 rounded-lg bg-shafx-accent px-2.5 text-[9px] font-semibold text-white' : 'min-h-8 rounded-lg border border-shafx-border bg-shafx-surface px-2.5 text-[9px] font-semibold text-shafx-textMuted'}>{label}</button>)}
              </div>
            </div>

            <div className="space-y-2">
              {visibleTrades.map((trade) => {
                const profit = trade.profit ?? 0
                const positive = profit > 0
                const flat = profit === 0
                const precision = trade.symbol.includes('JPY') ? 3 : 5
                return <article key={trade.id} className="rounded-xl border border-shafx-border bg-shafx-bg/65 p-3 transition-colors hover:border-shafx-accent/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={trade.type === 'BUY' ? 'rounded-md bg-shafx-success/10 px-1.5 py-1 font-mono text-[8px] font-bold text-shafx-success' : 'rounded-md bg-shafx-danger/10 px-1.5 py-1 font-mono text-[8px] font-bold text-shafx-danger'}>{trade.type}</span>
                        <strong className="font-mono text-xs text-shafx-text">{trade.symbol}</strong>
                        <span className="font-mono text-[8px] text-shafx-textMuted">{trade.lotSize.toFixed(2)} lot</span>
                      </div>
                      <div className="mt-1 text-[8px] text-shafx-textMuted">{formatTimestamp(trade.openTime)}{trade.closeTime ? ` → ${formatTimestamp(trade.closeTime)}` : ''}</div>
                    </div>
                    <div className="text-right">
                      <div className={positive ? 'font-mono text-sm font-black tabular text-shafx-success' : flat ? 'font-mono text-sm font-black tabular text-shafx-textMuted' : 'font-mono text-sm font-black tabular text-shafx-danger'}>{positive ? '+' : ''}{formatCurrency(profit, currency)}</div>
                      <div className={positive ? 'mt-0.5 flex items-center justify-end gap-1 text-[8px] text-shafx-success' : flat ? 'mt-0.5 flex items-center justify-end gap-1 text-[8px] text-shafx-textMuted' : 'mt-0.5 flex items-center justify-end gap-1 text-[8px] text-shafx-danger'}>{positive ? <ArrowUpRight className="h-3 w-3" /> : profit < 0 ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}{positive ? 'WIN' : profit < 0 ? 'LOSS' : 'BREAK-EVEN'}</div>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5 text-[8px] sm:grid-cols-4">
                    <div className="rounded-lg border border-shafx-border bg-shafx-surface px-2 py-1.5"><span className="block text-shafx-textMuted">Entry</span><strong className="font-mono">{formatPrice(trade.entryPrice, precision)}</strong></div>
                    <div className="rounded-lg border border-shafx-border bg-shafx-surface px-2 py-1.5"><span className="block text-shafx-textMuted">Exit</span><strong className="font-mono">{trade.exitPrice == null ? '—' : formatPrice(trade.exitPrice, precision)}</strong></div>
                    <div className="rounded-lg border border-shafx-border bg-shafx-surface px-2 py-1.5"><span className="block text-shafx-textMuted">Risk</span><strong className="font-mono">{formatCurrency(trade.riskAmount, currency)}</strong></div>
                    <div className="rounded-lg border border-shafx-border bg-shafx-surface px-2 py-1.5"><span className="block text-shafx-textMuted">R:R</span><strong className="font-mono">{trade.riskRewardRatio.toFixed(2)}:1</strong></div>
                  </div>
                </article>
              })}
              {visibleTrades.length === 0 && <div className="rounded-xl border border-dashed border-shafx-border p-4 text-center text-[10px] text-shafx-textMuted">No {filter === 'wins' ? 'winning' : 'losing'} trades in the current history.</div>}
            </div>
          </>
        )}

        {!showTrades && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Avg win" value={formatCurrency(stats.avgWin, currency)} positive />
          <Metric label="Avg loss" value={formatCurrency(-stats.avgLoss, currency)} positive={false} />
          <Metric label="Best trade" value={formatCurrency(stats.best, currency)} positive={stats.best >= 0} />
          <Metric label="Worst trade" value={formatCurrency(stats.worst, currency)} positive={stats.worst >= 0} />
        </div>}

        {!showTrades && <div className="grid grid-cols-2 gap-2 text-[9px] text-shafx-textMuted"><span>Expectancy <strong className="text-shafx-text">{formatCurrency(stats.expectancy, currency)}</strong></span><span>Profit factor <strong className="text-shafx-text">{stats.profitFactor === null ? '—' : stats.profitFactor.toFixed(2)}</strong></span><span>Gross profit <strong className="text-shafx-success">{formatCurrency(stats.grossProfit, currency)}</strong></span><span>Gross loss <strong className="text-shafx-danger">{formatCurrency(-stats.grossLoss, currency)}</strong></span></div>}

        {showTrades && <div className="flex items-center gap-2 border-t border-shafx-border pt-2 text-[9px] text-shafx-textMuted"><Award className="h-3.5 w-3.5 text-shafx-accent" /><span>Best trade {formatCurrency(stats.best, currency)}</span><span>Worst {formatCurrency(stats.worst, currency)}</span><span className="ml-auto">{stats.averageRR.toFixed(2)}:1 avg R:R</span></div>}
      </div>
    )}
    <p className="mt-3 text-[9px] leading-4 text-shafx-textMuted">SIMULATED — NOT FINANCIAL ADVICE. Closed-trade results are historical simulator data and do not predict future performance.</p>
  </section>
}

function Metric({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return <div className="rounded-xl border border-shafx-border bg-shafx-bg p-2.5">
    <span className="block text-[9px] uppercase tracking-[0.12em] text-shafx-textMuted">{label}</span>
    <strong className={`mt-1 block font-mono text-xs tabular ${positive === undefined ? 'text-shafx-text' : positive ? 'text-shafx-success' : 'text-shafx-danger'}`}>{value}</strong>
  </div>
}
