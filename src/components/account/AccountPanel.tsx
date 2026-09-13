import React, { useEffect, useState } from 'react'
import { ChevronRight, Copy, Link2, Lock, LogIn, LogOut, Plus, ShieldCheck, TrendingDown, TrendingUp, UserCircle, UserPlus, Wallet, KeyRound, CheckCircle2 } from 'lucide-react'
import type { AccountData } from '../../types'
import { formatCurrency, formatPercent } from '../../lib/format'
import { DerivAccountControl } from '../market/DerivAccountControl'
import { useAuth } from '../../app/AuthContext'

interface Props { account: AccountData }
type FormMode = 'signin' | 'signup'
type TradeMode = 'simulator' | 'broker'

async function publicAuthRequest(action: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/auth?action=${encodeURIComponent(action)}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json().catch(() => ({ ok: false, error: 'Unexpected SHAFX identity response.' }))
  if (!response.ok || !data.ok) throw new Error(data.error || 'SHAFX identity request failed.')
  return data
}

export const AccountPanel: React.FC<Props> = ({ account }) => {
  const [created, setCreated] = useState(false)
  const [copied, setCopied] = useState(false)
  const [formMode, setFormMode] = useState<FormMode>('signin')
  const [tradeMode, setTradeMode] = useState<TradeMode>('simulator')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirm, setResetConfirm] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [website, setWebsite] = useState('')
  const [resetToken, setResetToken] = useState<string | null>(null)
  const [forgotMode, setForgotMode] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const { user, loading, error, signIn, signUp, signOut } = useAuth()
  const positive = account.floatingPL >= 0
  const plPercent = account.balance > 0 ? account.floatingPL / account.balance * 100 : 0
  const accountId = user?.simulatorAccountId ?? 'Sign in to view'

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('auth') !== 'reset') return
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const token = hash.get('access_token')
    if (token) setResetToken(token)
  }, [])

  const copyId = async (): Promise<void> => {
    if (!user) return
    try { await navigator.clipboard.writeText(accountId); setCopied(true); window.setTimeout(() => setCopied(false), 1200) } catch { setCopied(false) }
  }

  const submitAuth = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault(); setSubmitting(true); setMessage(null)
    try {
      if (forgotMode) {
        const result = await publicAuthRequest('reset-request', { email })
        setMessage(result.message)
      } else if (resetToken) {
        if (resetPassword.length < 10) { setMessage('Password must be at least 10 characters.'); return }
        if (resetPassword !== resetConfirm) { setMessage('Passwords do not match.'); return }
        const result = await publicAuthRequest('update-password', { token: resetToken, password: resetPassword })
        setMessage(result.message)
        setResetToken(null)
        window.history.replaceState({}, '', '/')
        window.location.hash = ''
        setFormMode('signin')
        setPassword('')
        setResetPassword('')
        setResetConfirm('')
      } else if (formMode === 'signup') {
        if (password.length < 10) { setMessage('Password must be at least 10 characters.'); return }
        if (password !== confirmPassword) { setMessage('Passwords do not match.'); return }
        const result = await signUp({ displayName, email, password, website })
        setMessage(result.message || (result.needsEmailConfirmation ? 'Check your email to confirm your SHAFX account, then sign in.' : 'Your SHAFX account is ready.'))
        if (result.needsEmailConfirmation) setPassword('')
      } else {
        await signIn({ email, password })
        setMessage('Signed in to SHAFX.')
        setPassword('')
      }
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Unable to complete SHAFX account request.') }
    finally { setSubmitting(false) }
  }

  const chooseTradeMode = (next: TradeMode) => {
    setTradeMode(next)
    if (next === 'broker') setMessage('Connect your broker first. SHAFX will not place a real-money order just because a broker is connected.')
    else setMessage('SHAFX Simulator selected. You can practice without a broker.')
  }

  return <div className="space-y-3">
    <section className="rounded-xl border border-shafx-border bg-shafx-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-shafx-primary/10 text-shafx-primary"><UserCircle className="h-6 w-6" /></div><div><h2 className="font-semibold">SHAFX account</h2><p className="text-[11px] text-shafx-textMuted">Your SHAFX identity is separate from any broker connection.</p></div></div>{user && <span className="rounded border border-shafx-success/20 bg-shafx-success/10 px-2 py-1 text-[10px] text-shafx-success">ACTIVE</span>}</div>
      {loading ? <div className="mt-4 rounded-lg border border-shafx-border bg-shafx-bg p-3 text-xs text-shafx-textMuted">Checking your SHAFX session…</div> : user ? <div className="mt-4 space-y-3">
        <div className="rounded-lg border border-shafx-border bg-shafx-bg p-3"><div className="text-sm font-semibold">Welcome back, {user.displayName || user.email.split('@')[0]}</div><div className="mt-1 text-[11px] text-shafx-textMuted">{user.email}</div><div className="mt-3 flex items-center justify-between gap-2"><div><div className="text-[10px] uppercase tracking-wider text-shafx-textMuted">SHAFX simulator account</div><div className="mt-1 font-mono text-xs">{accountId}</div></div><button type="button" onClick={copyId} className="flex min-h-10 items-center gap-1 rounded border border-shafx-border px-2 text-[10px] text-shafx-textMuted"><Copy className="h-3 w-3" />{copied ? 'Copied' : 'Copy ID'}</button></div></div>
        <button type="button" onClick={() => void signOut()} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-shafx-border text-xs text-shafx-textMuted"><LogOut className="h-4 w-4" />Sign out</button>
      </div> : resetToken ? <>
        <div className="mt-4 rounded-lg border border-shafx-primary/20 bg-shafx-primary/5 p-3"><div className="flex items-center gap-2 font-semibold text-sm"><KeyRound className="h-4 w-4 text-shafx-primary" />Set a new SHAFX password</div><p className="mt-1 text-[10px] text-shafx-textMuted">Choose a new password of at least 10 characters.</p></div>
        <form onSubmit={(event) => void submitAuth(event)} className="mt-3 space-y-2"><input value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} type="password" autoComplete="new-password" required minLength={10} placeholder="New password" className="min-h-11 w-full rounded-lg border border-shafx-border bg-shafx-bg px-3 text-sm outline-none" /><input value={resetConfirm} onChange={(event) => setResetConfirm(event.target.value)} type="password" autoComplete="new-password" required minLength={10} placeholder="Confirm new password" className="min-h-11 w-full rounded-lg border border-shafx-border bg-shafx-bg px-3 text-sm outline-none" /><button disabled={submitting} type="submit" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-shafx-primary px-3 text-sm font-semibold text-white disabled:opacity-60"><KeyRound className="h-4 w-4" />{submitting ? 'Please wait…' : 'Change password'}</button></form>
      </> : <>
        {!forgotMode && <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-shafx-border bg-shafx-bg p-1"><button type="button" onClick={() => { setFormMode('signin'); setMessage(null) }} className={`min-h-10 rounded text-xs font-semibold ${formMode === 'signin' ? 'bg-shafx-primary text-white' : 'text-shafx-textMuted'}`}>Sign in</button><button type="button" onClick={() => { setFormMode('signup'); setMessage(null) }} className={`min-h-10 rounded text-xs font-semibold ${formMode === 'signup' ? 'bg-shafx-primary text-white' : 'text-shafx-textMuted'}`}>Create account</button></div>}
        <form onSubmit={(event) => void submitAuth(event)} className="relative mt-3 space-y-2">{forgotMode ? <><div className="rounded-lg border border-shafx-border bg-shafx-bg p-3"><div className="flex items-center gap-2 font-semibold text-sm"><KeyRound className="h-4 w-4 text-shafx-primary" />Reset your password</div><p className="mt-1 text-[10px] text-shafx-textMuted">Enter your email and SHAFX will send a secure reset link.</p></div><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required placeholder="Email address" className="min-h-11 w-full rounded-lg border border-shafx-border bg-shafx-bg px-3 text-sm outline-none" /><button disabled={submitting} type="submit" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-shafx-primary px-3 text-sm font-semibold text-white disabled:opacity-60"><KeyRound className="h-4 w-4" />{submitting ? 'Sending…' : 'Send reset link'}</button></> : <>{formMode === 'signup' && <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" className="min-h-11 w-full rounded-lg border border-shafx-border bg-shafx-bg px-3 text-sm outline-none" />}<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required placeholder="Email address" className="min-h-11 w-full rounded-lg border border-shafx-border bg-shafx-bg px-3 text-sm outline-none" /><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={formMode === 'signin' ? 'current-password' : 'new-password'} required minLength={formMode === 'signup' ? 10 : 1} placeholder={formMode === 'signup' ? 'Password (minimum 10 characters)' : 'Password'} className="min-h-11 w-full rounded-lg border border-shafx-border bg-shafx-bg px-3 text-sm outline-none" />{formMode === 'signup' && <><input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" required minLength={10} placeholder="Confirm password" className="min-h-11 w-full rounded-lg border border-shafx-border bg-shafx-bg px-3 text-sm outline-none" /><input aria-hidden="true" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} className="absolute -left-[10000px] top-auto h-px w-px opacity-0" /></>}<button disabled={submitting} type="submit" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-shafx-primary px-3 text-sm font-semibold text-white disabled:opacity-60">{formMode === 'signin' ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}{submitting ? 'Please wait…' : formMode === 'signin' ? 'Sign in to SHAFX' : 'Create SHAFX account'}</button>{formMode === 'signin' && <button type="button" onClick={() => { setForgotMode(true); setMessage(null) }} className="w-full py-1 text-[10px] text-shafx-primary">Forgot password?</button>}</>}</form>{(message || error) && <p className="mt-3 text-[11px] leading-relaxed text-shafx-textMuted">{message || error}</p>}{forgotMode && <button type="button" onClick={() => { setForgotMode(false); setMessage(null) }} className="mt-2 w-full text-[10px] text-shafx-textMuted">Back to sign in</button>}</>}
    </section>

    {user && <section className="rounded-xl border border-shafx-primary/20 bg-shafx-surface p-4 shadow-sm"><div className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-5 w-5 text-shafx-primary" /><div><h3 className="font-semibold">Choose your trading account</h3><p className="mt-1 text-[11px] text-shafx-textMuted">You can practice inside SHAFX without a broker, or connect a broker account when you are ready.</p></div></div><div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-shafx-border bg-shafx-bg p-1"><button type="button" onClick={() => chooseTradeMode('simulator')} className={`min-h-12 rounded-lg text-xs font-semibold ${tradeMode === 'simulator' ? 'bg-shafx-primary text-white' : 'text-shafx-textMuted'}`}><span className="block">SHAFX Simulator</span><span className="mt-1 block text-[9px] opacity-80">Practice • no broker</span></button><button type="button" onClick={() => chooseTradeMode('broker')} className={`min-h-12 rounded-lg text-xs font-semibold ${tradeMode === 'broker' ? 'bg-shafx-primary text-white' : 'text-shafx-textMuted'}`}><span className="block">Connect Broker</span><span className="mt-1 block text-[9px] opacity-80">Use a broker account</span></button></div>{tradeMode === 'broker' && <div className="mt-3 rounded-lg border border-shafx-border bg-shafx-bg p-3"><div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4 text-shafx-primary" />Connect your broker</div><p className="mt-1 text-[10px] leading-relaxed text-shafx-textMuted">Start with a supported broker connection. Connecting a broker does not automatically enable real-money order execution.</p></div><DerivAccountControl /></div></div>}</section>}

    <section className="rounded-xl border border-shafx-border bg-shafx-surface p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-shafx-primary" /><div><h3 className="font-semibold">Automatic account status</h3><p className="mt-1 text-[10px] text-shafx-textMuted">Every sign-in checks the account status automatically.</p></div></div></div><div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px]"><div className="rounded border border-shafx-success/20 bg-shafx-success/10 p-2 text-shafx-success">ACTIVE<br /><span className="text-shafx-textMuted">allowed</span></div><div className="rounded border border-yellow-500/20 bg-yellow-500/10 p-2 text-yellow-400">SUSPENDED<br /><span className="text-shafx-textMuted">blocked</span></div><div className="rounded border border-shafx-danger/20 bg-shafx-danger/10 p-2 text-shafx-danger">BANNED<br /><span className="text-shafx-textMuted">blocked</span></div></div></section>

    <section className="rounded-xl border border-shafx-border bg-shafx-surface p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><Wallet className="h-4 w-4 text-shafx-primary" /><div><h3 className="font-semibold">{user ? 'Trading account' : 'Simulator preview'}</h3><p className="mt-1 text-[10px] text-shafx-textMuted">{user ? 'Your SHAFX simulator is ready without a broker.' : 'Sign in to make this simulator account yours.'}</p></div></div><span className="rounded border border-shafx-success/20 bg-shafx-success/10 px-2 py-0.5 text-[10px] text-shafx-success">DEMO</span></div><div className="mt-3 rounded-lg border border-shafx-border bg-shafx-bg p-3"><div className="text-[10px] uppercase tracking-wider text-shafx-textMuted">Balance</div><div className="mt-1 font-mono text-2xl font-semibold tabular">{formatCurrency(account.balance, account.currency)}</div><div className="mt-1 text-[11px] text-shafx-textMuted">Equity {formatCurrency(account.equity, account.currency)}</div></div><div className="mt-2 grid grid-cols-2 gap-2 text-xs"><div className="rounded border border-shafx-border bg-shafx-bg p-3"><span className="text-shafx-textMuted">Used margin</span><strong className="mt-1 block font-mono">{formatCurrency(account.usedMargin, account.currency)}</strong></div><div className="rounded border border-shafx-border bg-shafx-bg p-3"><span className="text-shafx-textMuted">Free margin</span><strong className="mt-1 block font-mono">{formatCurrency(account.freeMargin, account.currency)}</strong></div></div><div className="mt-2 flex items-center justify-between rounded border border-shafx-border bg-shafx-bg p-3"><span className="text-xs text-shafx-textMuted">Floating P/L</span><span className={`flex items-center gap-1 font-mono font-semibold ${positive ? 'text-shafx-success' : 'text-shafx-danger'}`}>{positive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}{formatCurrency(account.floatingPL, account.currency)} <span className="text-[10px]">({formatPercent(plPercent)})</span></span></div></section>

    <section className="rounded-xl border border-shafx-border bg-shafx-surface p-4 shadow-sm"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-shafx-primary" /><h3 className="font-semibold">Account actions</h3></div><button type="button" onClick={() => setCreated(true)} className="mt-3 flex min-h-12 w-full items-center justify-between rounded-lg border border-shafx-border bg-shafx-bg px-3 text-left"><span className="flex items-center gap-2"><Plus className="h-4 w-4 text-shafx-primary" /><span><strong className="block text-xs">Create demo profile</strong><small className="text-[10px] text-shafx-textMuted">Add another practice profile when multi-account storage is enabled</small></span></span><ChevronRight className="h-4 w-4 text-shafx-textMuted" /></button>{created && <div className="mt-3 rounded-lg border border-shafx-success/20 bg-shafx-success/10 p-3 text-xs text-shafx-success">Demo profile controls are ready for persistent storage in the next account-data migration.</div>}</section>
    <p className="px-1 text-[10px] leading-relaxed text-shafx-textMuted">SIMULATED — NOT FINANCIAL ADVICE. SHAFX identity, demo balances and simulated orders are separate from broker accounts and real money.</p>
  </div>
}
