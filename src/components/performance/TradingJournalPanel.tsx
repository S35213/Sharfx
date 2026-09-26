import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Save, Sparkles } from 'lucide-react'
import type { TradeOrder } from '../../types'
import { formatCurrency, formatTimestamp } from '../../lib/format'

interface Props { tradeHistory: TradeOrder[]; currency: string }
const storageKey = 'shafx.trading.journal'
type JournalEntry = { tradeId: string; note: string }

const readNotes = (): JournalEntry[] => {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is JournalEntry => typeof item === 'object' && item !== null && typeof (item as { tradeId?: unknown }).tradeId === 'string' && typeof (item as { note?: unknown }).note === 'string')
  } catch { return [] }
}

export function TradingJournalPanel({ tradeHistory, currency }: Props) {
  const closed = useMemo(() => tradeHistory.filter((trade) => trade.status === 'closed' && Number.isFinite(trade.profit ?? NaN)), [tradeHistory])
  const [notes, setNotes] = useState<JournalEntry[]>(readNotes)
  const [selectedId, setSelectedId] = useState('')
  const selected = closed.find((trade) => trade.id === selectedId) ?? closed[0] ?? null
  const selectedNote = notes.find((entry) => entry.tradeId === selected?.id)?.note ?? ''

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(notes)) } catch { /* Local storage is optional. */ }
  }, [notes])

  const saveNote = (value: string): void => {
    if (!selected) return
    setNotes((previous) => {
      const without = previous.filter((entry) => entry.tradeId !== selected.id)
      return value.trim() ? [...without, { tradeId: selected.id, note: value }] : without
    })
  }

  return <section className="rounded-lg border border-shafx-border bg-shafx-surface p-4 text-sm">
    <div className="flex items-start justify-between gap-3">
      <div><h3 className="flex items-center gap-2 font-semibold text-shafx-text"><BookOpen className="h-4 w-4 text-shafx-primary" /> Trading journal</h3><p className="mt-1 text-[11px] text-shafx-textMuted">Review completed trades and record what you learned.</p></div>
      <span className="rounded border border-shafx-border px-2 py-1 text-[10px] text-shafx-textMuted">DEMO</span>
    </div>
    {closed.length === 0 ? <div className="mt-3 rounded border border-shafx-border bg-shafx-bg p-4 text-center"><p className="text-xs text-shafx-text">Your journal starts with your first completed trade.</p><p className="mt-1 text-[11px] text-shafx-textMuted">Close a Deriv trade to get an automatic review and a place for your notes.</p></div> : <div className="mt-3 space-y-3">
      <label className="block text-[10px] uppercase tracking-wider text-shafx-textMuted" htmlFor="journal-trade">Trade to review</label>
      <select id="journal-trade" value={selected?.id ?? ''} onChange={(event) => setSelectedId(event.target.value)} className="min-h-11 w-full rounded border border-shafx-border bg-shafx-bg px-3 text-xs text-shafx-text">{closed.map((trade) => <option key={trade.id} value={trade.id}>{trade.id} • {trade.symbol} • {formatCurrency(trade.profit ?? 0, currency)}</option>)}</select>
      {selected && <div className="rounded border border-shafx-border bg-shafx-bg p-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-shafx-text"><Sparkles className="h-3.5 w-3.5 text-shafx-primary" />Agent review</div>
        <p className="mt-2 text-xs text-shafx-text">{buildReview(selected, currency)}</p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-shafx-textMuted"><span>Side <strong className="text-shafx-text">{selected.type}</strong></span><span>Outcome <strong className="text-shafx-text">{(selected.profit ?? 0) > 0 ? 'Win' : (selected.profit ?? 0) < 0 ? 'Loss' : 'Break-even'}</strong></span><span>Risk <strong className="text-shafx-text">{formatCurrency(selected.riskAmount, currency)}</strong></span><span>R:R <strong className="text-shafx-text">{selected.riskRewardRatio.toFixed(2)}:1</strong></span></div>
        <p className="mt-2 text-[10px] text-shafx-textMuted">Opened {formatTimestamp(selected.openTime)}{selected.closeTime ? ` • Closed ${formatTimestamp(selected.closeTime)}` : ''}</p>
      </div>}
      <div><label className="block text-[10px] uppercase tracking-wider text-shafx-textMuted" htmlFor="journal-note">Your note</label><textarea id="journal-note" key={selected?.id} defaultValue={selectedNote} onBlur={(event) => saveNote(event.currentTarget.value)} placeholder="What did you learn from this trade?" className="mt-1 min-h-20 w-full resize-y rounded border border-shafx-border bg-shafx-bg p-3 text-xs text-shafx-text placeholder:text-shafx-textMuted" /></div>
      <p className="flex items-center gap-1 text-[10px] text-shafx-textMuted"><Save className="h-3 w-3" />Notes are saved locally on this device.</p>
    </div>}
    <p className="mt-3 text-[10px] text-shafx-textMuted">LIVE DERIV TRADE REVIEW — NOT FINANCIAL ADVICE. Journal reviews are educational and do not predict future performance.</p>
  </section>
}

function buildReview(trade: TradeOrder, currency: string): string {
  const profit = trade.profit ?? 0
  if (profit > 0) return `${trade.type} ${trade.symbol} finished positive at ${formatCurrency(profit, currency)}. Compare the entry, stop, target and market conditions before deciding what to repeat.`
  if (profit < 0) return `${trade.type} ${trade.symbol} finished negative at ${formatCurrency(profit, currency)}. Review whether the setup invalidated as expected and whether the risk stayed within your plan.`
  return `${trade.type} ${trade.symbol} finished around break-even. Review the entry timing, invalidation and target before taking another similar setup.`
}
