import React, { useEffect, useState } from 'react'
import { Bot, CheckCircle2, Loader2, Smartphone } from 'lucide-react'

type BotProduct = { slug: string; name: string; description: string; price_kes: number; grant_plan: 'REGULAR' | 'PRO' }
type StoreResponse = { bots: BotProduct[]; ownedBots: Array<{ bot_slug: string; activated_at: string; expires_at: string | null }> }
const formatKes = (amount: number): string => `KSh ${amount.toLocaleString('en-KE')}`

export const BotStore: React.FC = () => {
  const [store, setStore] = useState<StoreResponse | null>(null)
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = async (): Promise<void> => {
    const response = await fetch('/api/bot/store', { credentials: 'include' }); const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'Unable to load the Bot Store.'); setStore(data)
  }
  useEffect(() => { void load().catch((err) => setError(err instanceof Error ? err.message : 'Unable to load the Bot Store.')) }, [])
  const purchase = async (bot: BotProduct): Promise<void> => {
    setBusy(bot.slug); setError(null); setMessage(null)
    try {
      const response = await fetch('/api/paystack?action=charge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ botSlug: bot.slug, phone }) })
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Unable to start the M-PESA payment.')
      setMessage(`${data.displayText || 'Check your phone and approve the M-PESA prompt.'} Payment reference: ${data.reference}`)
      const reference = String(data.reference || '')
      if (reference) for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 3000))
        const statusResponse = await fetch(`/api/paystack?action=status&reference=${encodeURIComponent(reference)}`, { credentials: 'include' }); const statusData = await statusResponse.json().catch(() => ({}))
        if (statusResponse.ok && statusData.purchase?.status === 'success') { setMessage(`${bot.name} is now active on your SHAFX account.`); await load(); break }
        if (statusResponse.ok && statusData.purchase?.status === 'failed') { setError('The payment failed. You can try again.'); break }
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to start the payment.') } finally { setBusy(null) }
  }
  return <section className="rounded-xl border border-shafx-border bg-shafx-surface p-3 sm:p-4">
    <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Bot className="h-4 w-4 text-shafx-primary" /><h2 className="text-sm font-semibold">SHAFX Bot Store</h2></div><p className="mt-1 text-[11px] text-shafx-textMuted">Purchase bot access with an M-PESA STK push. Bots activate only after Paystack confirms the payment.</p></div><span className="rounded-full border border-shafx-border px-2 py-1 text-[9px] uppercase tracking-wider text-shafx-textMuted">M-PESA</span></div>
    <label className="mt-4 block text-[10px] uppercase tracking-wider text-shafx-textMuted">M-PESA phone number</label>
    <div className="mt-1 flex items-center gap-2 rounded-lg border border-shafx-border bg-shafx-bg px-3"><Smartphone className="h-4 w-4 text-shafx-textMuted" /><input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" placeholder="0712345678" className="min-h-11 w-full bg-transparent text-sm outline-none" aria-label="M-PESA phone number" /></div>
    {error && <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">{error}</p>}{message && <p className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-300">{message}</p>}
    <div className="mt-4 space-y-2">{store?.bots.map((bot) => { const owned = store.ownedBots.some((item) => item.bot_slug === bot.slug); return <div key={bot.slug} className="rounded-xl border border-shafx-border bg-shafx-bg p-3"><div className="flex items-start justify-between gap-3"><div><strong className="text-sm">{bot.name}</strong><p className="mt-1 text-[11px] text-shafx-textMuted">{bot.description}</p><p className="mt-2 text-sm font-semibold">{formatKes(bot.price_kes)} <span className="text-[10px] font-normal text-shafx-textMuted">• {bot.grant_plan}</span></p></div>{owned ? <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Active</span> : <button type="button" disabled={busy !== null || phone.trim().length < 10} onClick={() => void purchase(bot)} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-shafx-primary px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy === bot.slug && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Buy</button>}</div></div> })}{store && store.bots.length === 0 && <div className="rounded-xl border border-dashed border-shafx-border p-4 text-center text-xs text-shafx-textMuted">No paid bots are published yet. The store and Paystack purchase pipeline are ready; publish a bot from the SHAFX owner controls when its price is set.</div>}</div>
    <p className="mt-3 text-[10px] text-shafx-textMuted">SHAFX will never ask for your M-PESA PIN. Enter it only in the official M-PESA prompt.</p>
  </section>
}