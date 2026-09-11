import { useMemo } from 'react'
import { Activity, Award, BarChart3, TrendingDown, TrendingUp } from 'lucide-react'
import type { TradeOrder } from '../../types'
import { formatCurrency, formatPercent } from '../../lib/format'

interface Props { tradeHistory: TradeOrder[]; currency: string }

export function PerformancePanel({ tradeHistory, currency }: Props) {
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
    return { closed: closed.length, wins: wins.length, losses: losses.length, net, grossProfit, grossLoss, avgWin, avgLoss, expectancy, profitFactor, best, worst, averageRR, winRate: closed.length ? wins.length / closed.length * 100 : 0 }
  }, [tradeHistory])

  return <section className="rounded-lg border border-shafx-border bg-shafx-surface p-4 text-sm">
    <div className="flex items-start justify-between gap-3">
      <div><h3 className="flex items-center gap-2 font-semibold text-shafx-text"><BarChart3 className="h-4 w-4 text-shafx-primary" /> Trading performance</h3><p className="mt-1 text-[11px] text-shafx-textMuted">A simple scorecard for your completed simulated trades.</p></div>
      <span className="rounded border border-shafx-border px-2 py-1 text-[10px] text-shafx-textMuted">DEMO</span>
    </div>
    {stats.closed === 0 ? <div className="mt-3 rounded border border-shafx-border bg-shafx-bg p-4 text-center"><Activity className="mx-auto h-7 w-7 text-shafx-textMuted" /><p className="mt-2 text-xs text-shafx-text">No completed trades yet.</p><p className="mt-1 text-[11px] text-shafx-textMuted">Place and close simulated trades to build your performance history.</p></div> : <div className="mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric label="Net P/L" value={formatCurrency(stats.net, currency)} positive={stats.net >= 0} /><Metric label="Win rate" value={formatPercent(stats.winRate)} /><Metric label="Expectancy" value={formatCurrency(stats.expectancy, currency)} positive={stats.expectancy >= 0} /><Metric label="Avg R:R" value={`${stats.averageRR.toFixed(2)}:1`} /></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric label="Avg win" value={formatCurrency(stats.avgWin, currency)} positive /><Metric label="Avg loss" value={formatCurrency(-stats.avgLoss, currency)} /><Metric label="Best trade" value={formatCurrency(stats.best, currency)} positive={stats.best >= 0} /><Metric label="Worst trade" value={formatCurrency(stats.worst, currency)} positive={stats.worst >= 0} /></div>
      <div className="grid grid-cols-2 gap-2 text-xs text-shafx-textMuted"><span>Completed <strong className="text-shafx-text">{stats.closed}</strong></span><span>Wins <strong className="text-shafx-text">{stats.wins}</strong></span><span>Losses <strong className="text-shafx-text">{stats.losses}</strong></span><span>Profit factor <strong className="text-shafx-text">{stats.profitFactor === null ? '—' : stats.profitFactor.toFixed(2)}</strong></span></div>
      <div className="flex items-center gap-4 border-t border-shafx-border pt-2 text-[10px] text-shafx-textMuted"><span className="flex items-center gap-1"><Award className="h-3 w-3" />Gross profit {formatCurrency(stats.grossProfit, currency)}</span><span className="flex items-center gap-1"><TrendingDown className="h-3 w-3" />Gross loss {formatCurrency(-stats.grossLoss, currency)}</span><span className="ml-auto hidden items-center gap-1 sm:flex"><TrendingUp className="h-3 w-3" />Closed trades only</span></div>
    </div>}
    <p className="mt-3 text-[10px] text-shafx-textMuted">SIMULATED — NOT FINANCIAL ADVICE. Performance history is for simulator practice and does not predict future results.</p>
  </section>
}

function Metric({ label, value, positive }: { label: string; value: string; positive?: boolean }) { return <div className="rounded border border-shafx-border bg-shafx-bg p-2"><span className="block text-[10px] text-shafx-textMuted">{label}</span><strong className={`mt-1 block font-mono text-xs tabular ${positive === undefined ? 'text-shafx-text' : positive ? 'text-shafx-success' : 'text-shafx-danger'}`}>{value}</strong></div> }
