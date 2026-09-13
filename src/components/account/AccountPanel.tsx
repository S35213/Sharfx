import React, { useState } from 'react'
import { ChevronRight, Copy, Lock, LogIn, LogOut, Plus, ShieldCheck, TrendingDown, TrendingUp, UserCircle, UserPlus, Wallet } from 'lucide-react'
import type { AccountData } from '../../types'
import { formatCurrency, formatPercent } from '../../lib/format'
import { DerivAccountControl } from '../market/DerivAccountControl'
import { useAuth } from '../../app/AuthContext'

interface Props { account: AccountData }

type FormMode = 'signin' | 'signup'

export const AccountPanel: React.FC<Props> = ({ account }) => {
  const [mode, setMode] = useState<'demo' | 'real'>('demo')
  const [created, setCreated] = useState(false)
  const [copied, setCopied] = useState(false)
  const [formMode, setFormMode] = useState<FormMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const { user, loading, error, signIn, signUp, signOut } = useAuth()
  const positive = account.floatingPL >= 0
  const plPercent = account.balance > 0 ? account.floatingPL / account.balance * 100 : 0
  const accountId = user?.simulatorAccountId ?? 'Sign in to view'

  const copyId = async (): Promise<void> => {
    if (!user) return
    try { await navigator.clipboard.writeText(accountId); setCopied(true); window.setTimeout(() => setCopied(false), 1200) } catch { setCopied(false) }
  }

  const submitAuth = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault(); setSubmitting(true); setMessage(null)
    try {
      if (formMode === 'signup') {
        const result = await signUp({ displayName, email, password })
        setMessage(result.message || (result.needsEmailConfirmation ? 'Check your email to confirm your SHAFX account, then sign in.' : 'Your SHAFX account is ready.'))
      } else { await signIn({ email, password }); setMessage('Signed in to SHAFX.') }
      if (formMode === 'signin') setPassword('')
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Unable to complete SHAFX account request.') }
    finally { setSubmitting(false) }
  }

  return <div className="space-y-3">
    <section className="rounded-xl border border-shafx-border bg-shafx-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-shafx-primary/10 text-shafx-primary"><UserCircle className="h-6 w-6" /></div><div><h2 className="font-semibold">SHAFX account</h2><p className="text-[11px] text-shafx-textMuted">Your SHAFX identity is separate from any broker connection.</p></div></div>
        {user && <span className="rounded border border-shafx-success/20 bg-shafx-success/10 px-2 py-1 text-[10px] text-shafx-success">ACTIVE</span>}
      </div>

      {loading ? <div className="mt-4 rounded-lg border border-shafx-border bg-shafx-bg p-3 text-xs text-shafx-textMuted">Checking your SHAFX session…</div> : user ? <div className="mt-4 space-y-3 rounded-lg border border-shafx-border bg-shafx-bg p-3"><div><div className="text-sm font-semibold">{user.displayName || user.email}</div><div className="mt-1 text-[11px] text-shafx-textMuted">{user.email}</div></div><div className="flex items-center justify-between gap-2"><div><div className="text-[10px] uppercase tracking-wider text-shafx-textMuted">Simulator account</div><div className="mt-1 font-mono text-xs">{accountId}</div></div><button type="button" onClick={copyId} className="flex min-h-10 items-center gap-1 rounded border border-shafx-border px-2 text-[10px] text-shafx-textMuted"><Copy className="h-3 w-3" />{copied ? 'Copied' : 'Copy ID'}</button></div><button type="button" onClick={() => void signOut()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-shafx-border text-xs text-shafx-textMuted"><LogOut className="h-4 w-4" />Sign out</button></div> : <><div className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-shafx-border bg-shafx-bg p-1"><button type="button" onClick={() => setFormMode('signin')} className={`min-h-10 rounded text-xs font-semibold ${formMode === 'signin' ? 'bg-shafx-primary text-white' : 'text-shafx-textMuted'}`}>Sign in</button><button type="button" onClick={() => setFormMode('signup')} className={`min-h-10 rounded text-xs font-semibold ${formMode === 'signup' ? 'bg-shafx-primary text-white' : 'text-shafx-textMuted'}`}>Create account</button></div><form onSubmit={(event) => void submitAuth(event)} className="mt-3 space-y-2">{formMode === 'signup' && <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" className="min-h-11 w-full rounded-lg border border-shafx-border bg-shafx-bg px-3 text-sm outline-none" />}<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required placeholder="Email address" className="min-h-11 w-full rounded-lg border border-shafx-border bg-shafx-bg px-3 text-sm outline-none" /><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={formMode === 'signin' ? 'current-password' : 'new-password'} required minLength={8} placeholder="Password (minimum 8 characters)" className="min-h-11 w-full rounded-lg border border-shafx-border bg-shafx-bg px-3 text-sm outline-none" /><button disabled={submitting} type="submit" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-shafx-primary px-3 text-sm font-semibold text-white disabled:opacity-60">{formMode === 'signin' ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}{submitting ? 'Please wait…' : formMode === 'signin' ? 'Sign in to SHAFX' : 'Create SHAFX account'}</button></form>{(message || error) && <p className="mt-3 text-[11px] leading-relaxed text-shafx-textMuted">{message || error}</p>}</>}
    </section>

    <section className="rounded-xl border border-shafx-border bg-shafx-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-shafx-primary" /><div><h3 className="font-semibold">Automatic account status</h3><p className="mt-1 text-[10px] text-shafx-textMuted">Every sign-in checks the account status automatically.</p></div></div></div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px]"><div className="rounded border border-shafx-success/20 bg-shafx-success/10 p-2 text-shafx-success">ACTIVE<br /><span className="text-shafx-textMuted">allowed</span></div><div className="rounded border border-yellow-500/20 bg-yellow-500/10 p-2 text-yellow-400">SUSPENDED<br /><span className="text-shafx-textMuted">blocked</span></div><div className="rounded border border-shafx-danger/20 bg-shafx-danger/10 p-2 text-shafx-danger">BANNED<br /><span className="text-shafx-textMuted">blocked</span></div></div>
    </section>

    <section className="rounded-xl border border-shafx-border bg-shafx-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><Wallet className="h-4 w-4 text-shafx-primary" /><div><h3 className="font-semibold">Trading account</h3><p className="mt-1 text-[10px] text-shafx-textMuted">Your simulator is built into SHAFX. Brokers are optional connections.</p></div></div><span className="rounded border border-shafx-success/20 bg-shafx-success/10 px-2 py-0.5 text-[10px] text-shafx-success">DEMO</span></div>
      <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-shafx-border bg-shafx-bg p-1"><button type="button" onClick={() => setMode('demo')} className={`min-h-11 rounded text-xs font-semibold ${mode === 'demo' ? 'bg-shafx-primary text-white' : 'text-shafx-textMuted'}`}>Simulator</button><button type="button" onClick={() => setMode('real')} className={`min-h-11 rounded text-xs font-semibold ${mode === 'real' ? 'bg-shafx-primary text-white' : 'text-shafx-textMuted'}`}>Broker</button></div>
      {mode === 'real' ? <div className="mt-3 space-y-2"><div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3 text-xs text-yellow-400"><div className="flex items-center gap-2 font-semibold"><Lock className="h-4 w-4" />Real order execution is locked</div><p className="mt-1 leading-relaxed">Connecting a broker does not give SHAFX permission to place real-money orders until that separate live-trading stage is enabled.</p></div><div className="rounded-lg border border-shafx-border bg-shafx-bg p-3"><div className="flex items-center justify-between"><div><strong className="text-xs">Connect Deriv</strong><p className="mt-1 text-[10px] text-shafx-textMuted">Connect your broker account for supported authenticated features.</p></div><DerivAccountControl /></div></div></div> : <><div className="mt-3 rounded-lg border border-shafx-border bg-shafx-bg p-3"><div className="text-[10px] uppercase tracking-wider text-shafx-textMuted">Balance</div><div className="mt-1 font-mono text-2xl font-semibold tabular">{formatCurrency(account.balance, account.currency)}</div><div className="mt-1 text-[11px] text-shafx-textMuted">Equity {formatCurrency(account.equity, account.currency)}</div></div><div className="mt-2 grid grid-cols-2 gap-2 text-xs"><div className="rounded border border-shafx-border bg-shafx-bg p-3"><span className="text-shafx-textMuted">Used margin</span><strong className="mt-1 block font-mono">{formatCurrency(account.usedMargin, account.currency)}</strong></div><div className="rounded border border-shafx-border bg-shafx-bg p-3"><span className="text-shafx-textMuted">Free margin</span><strong className="mt-1 block font-mono">{formatCurrency(account.freeMargin, account.currency)}</strong></div></div><div className="mt-2 flex items-center justify-between rounded border border-shafx-border bg-shafx-bg p-3"><span className="text-xs text-shafx-textMuted">Floating P/L</span><span className={`flex items-center gap-1 font-mono font-semibold ${positive ? 'text-shafx-success' : 'text-shafx-danger'}`}>{positive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}{formatCurrency(account.floatingPL, account.currency)} <span className="text-[10px]">({formatPercent(plPercent)})</span></span></div></>}
    </section>

    <section className="rounded-xl border border-shafx-border bg-shafx-surface p-4 shadow-sm"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-shafx-primary" /><h3 className="font-semibold">Account actions</h3></div><button type="button" onClick={() => setCreated(true)} className="mt-3 flex min-h-12 w-full items-center justify-between rounded-lg border border-shafx-border bg-shafx-bg px-3 text-left"><span className="flex items-center gap-2"><Plus className="h-4 w-4 text-shafx-primary" /><span><strong className="block text-xs">Create demo profile</strong><small className="text-[10px] text-shafx-textMuted">Add another practice profile when multi-account storage is enabled</small></span></span><ChevronRight className="h-4 w-4 text-shafx-textMuted" /></button>{created && <div className="mt-3 rounded-lg border border-shafx-success/20 bg-shafx-success/10 p-3 text-xs text-shafx-success">Demo profile controls are ready for persistent storage in the next account-data migration.</div>}</section>

    <p className="px-1 text-[10px] leading-relaxed text-shafx-textMuted">SIMULATED — NOT FINANCIAL ADVICE. SHAFX identity, demo balances and simulated orders are separate from broker accounts and real money.</p>
  </div>
}
