import React, { useEffect, useState } from 'react'
import { Bot, Clock3, History, ListChecks, XCircle } from 'lucide-react'
import type { BotPaperTrade, TradeOrder } from '../../types'
import { formatCurrency, formatPrice, formatTimestamp } from '../../lib/format'
import { TradeHistoryPerformance } from './TradeHistoryPerformance'

interface Props {
  openPositions: TradeOrder[]
  pendingOrders: TradeOrder[]
  tradeHistory: TradeOrder[]
  currentPrice: number
  selectedSymbol: string
  onClosePosition: (id: string) => void | Promise<void>
  onBulkClose?: (mode: 'winning' | 'losing' | 'all') => void | Promise<void>
  positionsOnly?: boolean
  defaultTab?: Tab
  currency?: string
  botPaperHistory?: BotPaperTrade[]
}

type Tab = 'positions' | 'pending' | 'history' | 'bot'

const formatLivePnl = (value: number, currency: string): string => {
  const absolute = Math.abs(value)
  const digits = absolute > 0 && absolute < 0.01 ? 4 : absolute > 0 && absolute < 0.1 ? 3 : 2
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

const getAge = (openTime?: string, now = Date.now()): string => {
  if (!openTime) return '—'
  const opened = new Date(openTime).getTime()
  if (!Number.isFinite(opened)) return '—'
  const total = Math.max(0, Math.floor((now - opened) / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

export const TradesPanel: React.FC<Props> = ({
  openPositions,
  pendingOrders,
  tradeHistory,
  currentPrice,
  selectedSymbol,
  onClosePosition,
  onBulkClose,
  positionsOnly = false,
  defaultTab = 'positions',
  currency = 'USD',
  botPaperHistory = [],
}) => {
  const [activeTab, setActiveTab] = useState<Tab>(positionsOnly ? 'positions' : defaultTab)
  const [now, setNow] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const precision = (symbol: string) => symbol.includes('JPY') ? 3 : 5
  const data = activeTab === 'positions' ? openPositions : activeTab === 'pending' ? pendingOrders : tradeHistory
  const empty = (
    <div className="flex flex-col items-center justify-center py-8 text-shafx-textMuted">
      <ListChecks className="mb-2 h-7 w-7 opacity-50" />
      <p className="text-xs">No records found</p>
    </div>
  )

  return (
    <div className="flex h-full flex-col border border-shafx-border bg-shafx-surface">
      {!positionsOnly && (
        <div className="flex overflow-x-auto border-b border-shafx-border">
          {([
            ['positions', 'Open', openPositions.length, ListChecks],
            ['pending', 'Pending', pendingOrders.length, Clock3],
            ['history', 'History', tradeHistory.length, History],
            ['bot', 'Bot', botPaperHistory.length, Bot],
          ] as const).map(([key, label, count, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              aria-pressed={activeTab === key}
              className={'flex min-h-10 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-[9px] font-semibold ' + (activeTab === key ? 'border-shafx-primary text-shafx-primary' : 'border-transparent text-shafx-textMuted hover:text-shafx-text')}
            >
              <Icon className="h-3.5 w-3.5" />{label} ({count})
            </button>
          ))}
        </div>
      )}

      {activeTab === 'bot' ? (
        <div className="min-h-0 flex-1 overflow-auto bg-[#070B10] p-3 sm:p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em]"><Bot className="h-3.5 w-3.5 text-shafx-accent" /> Paper bot journal</div>
              <p className="mt-1 text-[8px] text-shafx-textMuted">Separate from Deriv account history. These are SHAFX five-round test results.</p>
            </div>
            <span className="font-mono text-[8px] text-shafx-textMuted">{botPaperHistory.length} rounds</span>
          </div>
          {botPaperHistory.length === 0 ? (
            <div className="border border-shafx-border bg-shafx-surface px-3 py-10 text-center text-[9px] text-shafx-textMuted">No bot paper rounds yet.</div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="border border-shafx-success/25 bg-shafx-success/[0.06] p-2.5"><span className="block text-[7px] uppercase tracking-[0.14em] text-shafx-textMuted">Net</span><div className={'mt-1 font-mono text-sm font-semibold tabular-nums ' + (botPaperHistory.reduce((sum, trade) => sum + trade.pnl, 0) >= 0 ? 'text-shafx-success' : 'text-shafx-danger')}>{botPaperHistory.reduce((sum, trade) => sum + trade.pnl, 0) >= 0 ? '+' : ''}{botPaperHistory.reduce((sum, trade) => sum + trade.pnl, 0).toFixed(4)}</div></div>
                <div className="border border-shafx-border bg-shafx-surface p-2.5"><span className="block text-[7px] uppercase tracking-[0.14em] text-shafx-textMuted">Wins</span><div className="mt-1 font-mono text-sm font-semibold">{botPaperHistory.filter((trade) => trade.status === 'win').length}</div></div>
                <div className="border border-shafx-border bg-shafx-surface p-2.5"><span className="block text-[7px] uppercase tracking-[0.14em] text-shafx-textMuted">Losses</span><div className="mt-1 font-mono text-sm font-semibold">{botPaperHistory.filter((trade) => trade.status === 'loss').length}</div></div>
              </div>
              <div className="mt-3 divide-y divide-shafx-border border border-shafx-border bg-shafx-surface">
                {botPaperHistory.slice(0, 30).map((trade) => (
                  <div key={trade.id} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2.5">
                    <div>
                      <div className="flex items-center gap-2 text-[9px] font-semibold">
                        <span>{trade.symbol}</span>
                        <span className={trade.direction === 'BUY' ? 'text-shafx-success' : trade.direction === 'SELL' ? 'text-shafx-danger' : 'text-shafx-textMuted'}>{trade.direction ?? 'WAIT'}</span>
                        <span className="font-mono text-shafx-accent">{trade.signalTimeframe ?? '—'} → {trade.entryTimeframe ?? '—'}</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-2 font-mono text-[7px] text-shafx-textMuted">
                        <span>R{trade.round}</span><span>Stake {trade.stake.toFixed(2)}</span><span>{trade.multiplier}×</span>
                        <span>{trade.entry !== null ? trade.entry.toFixed(5) : '—'} → {trade.exit !== null ? trade.exit.toFixed(5) : '—'}</span>
                      </div>
                    </div>
                    <div className={'text-right font-mono text-[10px] font-semibold ' + (trade.pnl >= 0 ? 'text-shafx-success' : 'text-shafx-danger')}>
                      <div>{trade.pnl >= 0 ? '+' : ''}{trade.pnl.toFixed(4)}</div>
                      <div className="text-[7px] uppercase text-shafx-textMuted">{trade.status}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : activeTab === 'history' ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <TradeHistoryPerformance history={tradeHistory} currency={currency} />
        </div>
      ) : (
      <div className="flex-1 overflow-auto">
        {activeTab === 'positions' && (
          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-shafx-border bg-shafx-surface/95 px-3 py-1.5 backdrop-blur">
            <span className="mr-1 font-mono text-[8px] uppercase tracking-[0.14em] text-shafx-textMuted">Bulk close</span>
            <button type="button" onClick={() => void onBulkClose?.('winning')} disabled={!onBulkClose || !openPositions.some((position) => (position.profit ?? 0) > 0)} className="min-h-7 border border-shafx-success/25 bg-shafx-success/[0.05] px-2.5 text-[9px] font-semibold text-shafx-success disabled:opacity-40">Winning</button>
            <button type="button" onClick={() => void onBulkClose?.('losing')} disabled={!onBulkClose || !openPositions.some((position) => (position.profit ?? 0) < 0)} className="min-h-7 border border-shafx-danger/25 bg-shafx-danger/[0.05] px-2.5 text-[9px] font-semibold text-shafx-danger disabled:opacity-40">Losing</button>
            <button type="button" onClick={() => void onBulkClose?.('all')} disabled={!onBulkClose || openPositions.length === 0} className="min-h-7 border border-shafx-border bg-shafx-bg px-2.5 text-[9px] font-semibold text-shafx-text disabled:opacity-40">All</button>
            <span className="text-[8px] text-shafx-textMuted">{openPositions.length} open</span>
          </div>
        )}

        {data.length === 0 ? empty : (
          <table className="w-full min-w-[980px] text-left text-[10px]">
            <thead className="bg-shafx-bg/60 uppercase tracking-wide text-[8px] text-shafx-textMuted">
              <tr>{['Ticket', 'Open / Age', 'Type', 'Symbol', 'TF', 'Stake', '×', 'Entry', 'Protection', 'P/L', 'Action'].map((heading) => <th key={heading} className="px-3 py-1.5 font-semibold">{heading}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-shafx-border">
              {data.map((trade) => {
                const p = precision(trade.symbol)
                const profit = Number(trade.profit ?? 0)
                const isDeriv = trade.brokerProduct === 'DERIV_MULTIPLIER'
                const openAction = activeTab === 'positions' && trade.status === 'open'
                const isSelectedMarket = trade.symbol === selectedSymbol
                const stake = Number(trade.stake ?? trade.lotSize)
                const protection = isDeriv
                  ? [trade.stopLossAmount ? 'SL ' + formatCurrency(trade.stopLossAmount) : null, trade.takeProfitAmount ? 'TP ' + formatCurrency(trade.takeProfitAmount) : null].filter(Boolean).join(' • ') || '—'
                  : [trade.stopLoss !== null ? 'SL ' + formatPrice(trade.stopLoss, p) : null, trade.takeProfit !== null ? 'TP ' + formatPrice(trade.takeProfit, p) : null].filter(Boolean).join(' • ') || '—'
                return (
                  <tr key={trade.id} className={'hover:bg-shafx-surfaceHover ' + (isSelectedMarket ? 'bg-shafx-primary/[0.025]' : '')}>
                    <td className="px-3 py-1.5 font-mono text-shafx-textMuted">{trade.id}</td>
                    <td className="px-3 py-1.5 text-shafx-textMuted">
                      <span className="block">Open {formatTimestamp(trade.openTime)}</span>
                      {trade.status === 'open' && (
                        <span className="mt-0.5 flex items-center gap-1 font-mono text-[8px] text-shafx-accent">
                          <Clock3 className="h-3 w-3" />{getAge(trade.openTime, now)}
                        </span>
                      )}
                      {trade.closeTime && <span className="mt-0.5 block text-[8px] text-shafx-textMuted">Close {formatTimestamp(trade.closeTime)}</span>}
                    </td>
                    <td className={'px-3 py-1.5 font-semibold ' + (trade.type === 'BUY' ? 'text-shafx-success' : 'text-shafx-danger')}>{trade.type}</td>
                    <td className="px-3 py-1.5 font-medium">{trade.symbol}</td>
                    <td className="px-3 py-1.5 font-mono text-shafx-accent">{trade.chartTimeframe ?? '—'}</td>
                    <td className="px-3 py-1.5 font-mono tabular-nums">{stake.toFixed(2)}</td>
                    <td className="px-3 py-1.5 font-mono tabular-nums">{isDeriv ? (trade.multiplier ?? '—') + '×' : '—'}</td>
                    <td className="px-3 py-1.5 font-mono tabular-nums">{trade.entryPrice > 0 ? formatPrice(trade.entryPrice, p) : '—'}</td>
                    <td className="px-3 py-1.5 font-mono text-[8px] tabular-nums">{protection}</td>
                    <td className={'px-3 py-1.5 font-mono font-semibold tabular-nums ' + (profit >= 0 ? 'text-shafx-success' : 'text-shafx-danger')}>{formatLivePnl(profit, currency)}</td>
                    <td className="px-3 py-1.5">
                      {openAction ? (
                        <button type="button" onClick={() => void onClosePosition(trade.id)} className="inline-flex min-h-7 items-center gap-1 border border-shafx-danger/35 bg-shafx-danger/10 px-2 text-[8px] font-semibold text-shafx-danger hover:bg-shafx-danger/20" aria-label={'Close ' + trade.id}>
                          <XCircle className="h-3 w-3" />Close @ {formatPrice(Number(trade.currentPrice ?? currentPrice), p)}
                        </button>
                      ) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      )}
    </div>
  )
}
