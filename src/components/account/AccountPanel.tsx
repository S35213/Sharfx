import React, { useState } from 'react'
import { ChevronRight, Copy, Lock, LogIn, Plus, ShieldCheck, TrendingDown, TrendingUp, UserCircle, Wallet } from 'lucide-react'
import type { AccountData } from '../../types'
import { formatCurrency, formatPercent } from '../../lib/format'
import { DerivAccountControl } from '../market/DerivAccountControl'

interface Props { account: AccountData }

export const AccountPanel: React.FC<Props> = ({ account }) => {
  const [mode, setMode] = useState<'demo' | 'real'>('demo')
  const [created, setCreated] = useState(false)
  const [copied, setCopied] = useState(false)
  const positive = account.floatingPL >= 0
  const plPercent = account.balance > 0 ? account.floatingPL / account.balance * 100 : 0
  const accountId = 'SIM-000001'

  const copyId = async (): Promise<void> => {
    try { await navigator.clipboard.writeText(accountId); setCopied(true); window.setTimeout(() => setCopied(false), 1200) } catch { setCopied(false) }
  }

  return <div className="space-y-3">
    <section className="rounded-xl border border-shafx-border bg-shafx-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-shafx-primary/10 text-shafx-primary"><UserCircle className="h-6 w-6" /></div><div><h2 className="font-semibold">Accounts</h2><p className="text-[11px] text-shafx-textMuted">Manage your SHAFX simulator and connected trading account.</p></div></div>
        <span className="rounded border border-shafx-success/20 bg-shafx-success/10 px-2 py-1 text-[10px] text-shafx-success">{mode === 'demo' ? 'DEMO' : 'REAL'}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-shafx-border bg-shafx-bg p-1">
        <button type="button" onClick={() => setMode('demo')} className={`min-h-11 rounded text-xs font-semibold ${mode === 'demo' ? 'bg-shafx-primary text-white' : 'text-shafx-textMuted'}`}>Demo account</button>
        <button type="button" onClick={() => setMode('real')} className={`min-h-11 rounded text-xs font-semibold ${mode === 'real' ? 'bg-shafx-primary text-white' : 'text-shafx-textMuted'}`}>Real account</button>
      </div>
      {mode === 'real' ? <div className="mt-3 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3 text-xs text-yellow-400"><div className="flex items-center gap-2 font-semibold"><Lock className="h-4 w-4" />Real trading is locked</div><p className="mt-1 leading-relaxed">SHAFX currently does not send real-money orders. Connect a supported broker only when the live-trading stage is explicitly enabled.</p></div> : <div className="mt-3 rounded-lg border border-shafx-border bg-shafx-bg p-3"><div className="flex items-center justify-between"><div><div className="text-[10px] uppercase tracking-wider text-shafx-textMuted">Current simulator</div><div className="mt-1 font-semibold">SHAFX Demo Account</div><div className="mt-1 text-[11px] text-shafx-textMuted">Account ID {accountId}</div></div><button type="button" onClick={copyId} className="flex min-h-10 items-center gap-1 rounded border border-shafx-border px-2 text-[10px] text-shafx-textMuted"><Copy className="h-3 w-3" />{copied ? 'Copied' : 'Copy ID'}</button></div></div>}
    </section>

    <section className="rounded-xl border border-shafx-border bg-shafx-surface p-4 shadow-sm">
      <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Wallet className="h-4 w-4 text-shafx-primary" /><h3 className="font-semibold">Account overview</h3></div><span className="rounded border border-shafx-primary/20 bg-shafx-primary/10 px-2 py-0.5 text-[10px] text-shafx-primary">SIMULATOR</span></div>
      <div className="mt-3 rounded-lg border border-shafx-border bg-shafx-bg p-3"><div className="text-[10px] uppercase tracking-wider text-shafx-textMuted">Balance</div><div className="mt-1 font-mono text-2xl font-semibold tabular">{formatCurrency(account.balance, account.currency)}</div><div className="mt-1 text-[11px] text-shafx-textMuted">Equity {formatCurrency(account.equity, account.currency)}</div></div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs"><div className="rounded border border-shafx-border bg-shafx-bg p-3"><span className="text-shafx-textMuted">Used margin</span><strong className="mt-1 block font-mono">{formatCurrency(account.usedMargin, account.currency)}</strong></div><div className="rounded border border-shafx-border bg-shafx-bg p-3"><span className="text-shafx-textMuted">Free margin</span><strong className="mt-1 block font-mono">{formatCurrency(account.freeMargin, account.currency)}</strong></div></div>
      <div className="mt-2 flex items-center justify-between rounded border border-shafx-border bg-shafx-bg p-3"><span className="text-xs text-shafx-textMuted">Floating P/L</span><span className={`flex items-center gap-1 font-mono font-semibold ${positive ? 'text-shafx-success' : 'text-shafx-danger'}`}>{positive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}{formatCurrency(account.floatingPL, account.currency)} <span className="text-[10px]">({formatPercent(plPercent)})</span></span></div>
    </section>

    <section className="rounded-xl border border-shafx-border bg-shafx-surface p-4 shadow-sm">
      <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-shafx-primary" /><h3 className="font-semibold">Account actions</h3></div>
      <div className="mt-3 space-y-2">
        <button type="button" onClick={() => setCreated(true)} className="flex min-h-12 w-full items-center justify-between rounded-lg border border-shafx-border bg-shafx-bg px-3 text-left"><span className="flex items-center gap-2"><Plus className="h-4 w-4 text-shafx-primary" /><span><strong className="block text-xs">Create demo account</strong><small className="text-[10px] text-shafx-textMuted">Start another local paper-trading profile</small></span></span><ChevronRight className="h-4 w-4 text-shafx-textMuted" /></button>
        <div className="rounded-lg border border-shafx-border bg-shafx-bg p-3"><div className="flex items-center justify-between"><div><strong className="text-xs">Connect Deriv</strong><p className="mt-1 text-[10px] text-shafx-textMuted">Connect your Deriv account for supported authenticated features.</p></div><DerivAccountControl /></div></div>
        <div className="flex min-h-12 items-center justify-between rounded-lg border border-shafx-border bg-shafx-bg px-3"><span className="flex items-center gap-2 text-xs"><LogIn className="h-4 w-4 text-shafx-textMuted" />Sign in to SHAFX</span><span className="text-[10px] text-shafx-textMuted">Coming later</span></div>
      </div>
      {created && <div className="mt-3 rounded-lg border border-shafx-success/20 bg-shafx-success/10 p-3 text-xs text-shafx-success"><strong>Demo profile ready.</strong><p className="mt-1 text-[10px]">This is a local simulator profile. It does not create a broker account or move real money.</p></div>}
    </section>

    <p className="px-1 text-[10px] leading-relaxed text-shafx-textMuted">SIMULATED — NOT FINANCIAL ADVICE. SHAFX demo balances, orders and account profiles are for practice only.</p>
  </div>
}
