import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, Check, Copy, ExternalLink, Link2, LogIn, LogOut, Plus, RefreshCw, ShieldCheck, UserCircle, UserPlus, Wallet, KeyRound } from 'lucide-react'
import type { AccountData } from '../../types'
import { formatCurrency, formatPercent } from '../../lib/format'
import { getProviderConnections, setStoredProviderSelection, subscribeToProviderSelection, type ActiveProviderSelection, type ProviderConnectionRecord } from '../../data/provider/providerConnections'
import { assessProviderConnectionRecord } from '../../data/provider/providerConnectionHealth'
import { providerCatalog } from '../../integrations/catalog'
import { ProviderCredentialForm } from '../market/ProviderCredentialForm'
import { setStoredTradingMode } from '../../app/tradingMode'
import { useAuth } from '../../app/AuthContext'

interface Props { account: AccountData; activeProviderSelection?: ActiveProviderSelection | null; brokerMode?: boolean }
type FormMode = 'signin' | 'signup'

async function publicAuthRequest(action: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/auth?action=${encodeURIComponent(action)}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json().catch(() => ({ ok: false, error: 'Unexpected SHAFX identity response.' }))
  if (!response.ok || !data.ok) throw new Error(data.error || 'SHAFX identity request failed.')
  return data
}

export const AccountPanel: React.FC<Props> = ({ account, activeProviderSelection = null, brokerMode = false }) => {
  const [copied, setCopied] = useState(false)
  const [formMode, setFormMode] = useState<FormMode>('signin')
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
  const [connections, setConnections] = useState<ProviderConnectionRecord[]>([])
  const [connectionState, setConnectionState] = useState<'checking' | 'ready' | 'error'>('checking')
  const [providerOpen, setProviderOpen] = useState<string | null>(null)
  const [providerBusy, setProviderBusy] = useState<string | null>(null)
  const [providerError, setProviderError] = useState<string | null>(null)
  const { user, loading, error, signIn, signUp, signOut } = useAuth()
  const positive = account.floatingPL >= 0
  const plPercent = account.balance > 0 ? account.floatingPL / account.balance * 100 : 0
  const accountId = user?.simulatorAccountId ?? 'Sign in to view'
  const currentDescriptor = useMemo(() => providerCatalog.find((provider) => provider.id === activeProviderSelection?.providerId) ?? null, [activeProviderSelection?.providerId])
  const brokerProviders = useMemo(() => providerCatalog.filter((provider) => provider.kind === 'broker' && provider.status === 'available'), [])
  const connected = useMemo(() => connections.filter((connection) => connection.state === 'connected' && connection.accounts.some((item) => item.active)), [connections])

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

  const refreshConnections = useCallback(async (): Promise<void> => {
    if (!user) return
    try {
      setConnectionState('checking')
      setConnections(await getProviderConnections())
      setConnectionState('ready')
    } catch {
      setConnectionState('error')
    }
  }, [user])

  useEffect(() => { void refreshConnections() }, [refreshConnections])
  useEffect(() => subscribeToProviderSelection(() => { void refreshConnections() }), [refreshConnections])

  const switchToSimulator = (): void => {
    setStoredTradingMode('simulator', accountId === 'Sign in to view' ? undefined : accountId)
    window.location.assign('/?account=demo')
  }

  const selectBrokerAccount = (connection: ProviderConnectionRecord, providerAccountId: string, environment: 'demo' | 'live'): void => {
    setStoredProviderSelection({ providerId: connection.providerId, connectionId: connection.id, accountId: providerAccountId, environment })
    setStoredTradingMode('broker', accountId === 'Sign in to view' ? undefined : accountId)
    window.location.assign('/?account=broker')
  }

  const connectDeriv = (): void => { window.location.assign('/api/deriv/login') }

  const connectProvider = async (providerId: string, credentials: Record<string, string>): Promise<void> => {
    try {
      setProviderBusy(providerId)
      setProviderError(null)
      const response = await fetch('/api/providers/connections', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect', providerId, credentials }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Unable to connect provider.')
      setProviderOpen(null)
      await refreshConnections()
    } catch (err) {
      setProviderError(err instanceof Error ? err.message : 'Unable to connect provider.')
    } finally {
      setProviderBusy(null)
    }
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

    {user && (
      <section className="overflow-hidden rounded-2xl border border-shafx-border bg-shafx-surface shadow-[0_18px_50px_rgba(0,0,0,.22)]">
        <div className="border-b border-shafx-border bg-[radial-gradient(circle_at_top_right,rgba(124,92,252,.16),transparent_45%)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-shafx-accent/10 text-shafx-accent"><Wallet className="h-5 w-5" /></div>
              <div className="min-w-0">
                <div className="flex items-center gap-2"><h3 className="truncate text-base font-semibold">Current trading account</h3><span className={brokerMode ? 'rounded-full border border-shafx-accent/25 bg-shafx-accent/10 px-2 py-0.5 font-mono text-[8px] font-bold text-shafx-accent' : 'rounded-full border border-shafx-success/20 bg-shafx-success/10 px-2 py-0.5 font-mono text-[8px] font-bold text-shafx-success'}>{brokerMode ? 'PROVIDER' : 'SIMULATOR'}</span></div>
                <p className="mt-1 text-[9px] text-shafx-textMuted">{brokerMode ? currentDescriptor?.name ?? 'Connected broker' : 'SHAFX Demo Account'} • {brokerMode ? (activeProviderSelection?.environment === 'live' ? 'Real' : 'Demo') : 'Practice'}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-shafx-success shadow-[0_0_12px_rgba(34,211,165,.45)]" /><span className="font-mono text-[8px] uppercase tracking-[0.12em] text-shafx-textMuted">Active</span></div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-shafx-border bg-shafx-bg/75 p-3"><span className="block text-[8px] uppercase tracking-[0.14em] text-shafx-textMuted">Balance</span><strong className="mt-1 block font-mono text-sm tabular">{formatCurrency(account.balance, account.currency)}</strong></div>
            <div className="rounded-xl border border-shafx-border bg-shafx-bg/75 p-3"><span className="block text-[8px] uppercase tracking-[0.14em] text-shafx-textMuted">Equity</span><strong className="mt-1 block font-mono text-sm tabular">{formatCurrency(account.equity, account.currency)}</strong></div>
            <div className="rounded-xl border border-shafx-border bg-shafx-bg/75 p-3"><span className="block text-[8px] uppercase tracking-[0.14em] text-shafx-textMuted">Free margin</span><strong className="mt-1 block font-mono text-sm tabular">{formatCurrency(account.freeMargin, account.currency)}</strong></div>
            <div className="rounded-xl border border-shafx-border bg-shafx-bg/75 p-3"><span className="block text-[8px] uppercase tracking-[0.14em] text-shafx-textMuted">Floating P/L</span><strong className={positive ? 'mt-1 block font-mono text-sm tabular text-shafx-success' : 'mt-1 block font-mono text-sm tabular text-shafx-danger'}>{positive ? '+' : ''}{formatCurrency(account.floatingPL, account.currency)} <span className="text-[8px]">({formatPercent(plPercent)})</span></strong></div>
          </div>

          {brokerMode && (() => {
            const activeConnection = connected.find((connection) => connection.id === activeProviderSelection?.connectionId)
            const activeAccounts = activeConnection?.accounts.filter((item) => item.active) ?? []
            const demoAccount = activeAccounts.find((item) => item.environment === 'demo')
            const realAccount = activeAccounts.find((item) => item.environment === 'live')
            if (!demoAccount && !realAccount) return null
            return <div className="mt-3 rounded-xl border border-shafx-border bg-shafx-bg/60 p-2.5">
              <div className="mb-2 flex items-center justify-between gap-2"><span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-shafx-textMuted">Account environment</span><span className="text-[8px] text-shafx-textMuted">Switch account</span></div>
              <div className="grid grid-cols-2 gap-1.5">
                {realAccount && <button type="button" onClick={() => selectBrokerAccount(activeConnection!, realAccount.providerAccountId, 'live')} className={activeProviderSelection?.environment === 'live' ? 'min-h-10 rounded-lg bg-shafx-accent text-[9px] font-bold text-white' : 'min-h-10 rounded-lg border border-shafx-border bg-shafx-surface text-[9px] font-semibold text-shafx-textMuted'}>Real<br /><span className="text-[7px] opacity-80">{realAccount.label}</span></button>}
                {demoAccount && <button type="button" onClick={() => selectBrokerAccount(activeConnection!, demoAccount.providerAccountId, 'demo')} className={activeProviderSelection?.environment === 'demo' ? 'min-h-10 rounded-lg bg-shafx-accent text-[9px] font-bold text-white' : 'min-h-10 rounded-lg border border-shafx-border bg-shafx-surface text-[9px] font-semibold text-shafx-textMuted'}>Demo<br /><span className="text-[7px] opacity-80">{demoAccount.label}</span></button>}
              </div>
            </div>
          })()}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-shafx-border bg-shafx-bg/60 px-3 py-2.5">
            <div className="min-w-0"><div className="truncate text-[8px] uppercase tracking-[0.12em] text-shafx-textMuted">{brokerMode ? 'Broker account' : 'Simulator account'} ID</div><div className="mt-0.5 truncate font-mono text-[10px] font-semibold">{brokerMode ? activeProviderSelection?.accountId ?? 'Selected account' : accountId}</div></div>
            <button type="button" onClick={copyId} className="flex min-h-9 items-center gap-1.5 rounded-lg border border-shafx-border bg-shafx-surface px-2.5 text-[9px] font-semibold text-shafx-textMuted"><Copy className="h-3 w-3" />{copied ? 'Copied' : 'Copy ID'}</button>
          </div>
        </div>
      </section>
    )}

    {user && (
      <section className="rounded-2xl border border-shafx-border bg-shafx-surface p-3.5 shadow-[0_14px_36px_rgba(0,0,0,.18)] sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div><div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-shafx-accent" /><h3 className="text-sm font-semibold">Connected brokers & accounts</h3></div><p className="mt-1 text-[9px] leading-4 text-shafx-textMuted">Each broker account stays separate. Switching accounts changes the active trading context.</p></div>
          <button type="button" onClick={() => void refreshConnections()} className="rounded-lg border border-shafx-border bg-shafx-bg p-2 text-shafx-textMuted" title="Refresh broker connections"><RefreshCw className={connectionState === 'checking' ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} /></button>
        </div>
        <div className="mt-3 space-y-2">
          {!connected.length && connectionState !== 'checking' && <div className="rounded-xl border border-dashed border-shafx-border bg-shafx-bg/60 p-4 text-center"><Link2 className="mx-auto h-5 w-5 text-shafx-textMuted" /><div className="mt-2 text-xs font-semibold">No broker connection yet</div><p className="mt-1 text-[9px] text-shafx-textMuted">Connect a broker below to add its demo or real account to SHAFX.</p></div>}
          {connected.map((connection) => {
            const descriptor = providerCatalog.find((provider) => provider.id === connection.providerId)
            const health = assessProviderConnectionRecord(connection)
            return <div key={connection.id} className="rounded-xl border border-shafx-border bg-shafx-bg/55 p-3">
              <div className="flex items-center justify-between gap-2"><div className="min-w-0"><div className="truncate text-xs font-semibold">{descriptor?.name ?? connection.providerId}</div><div className="mt-0.5 truncate text-[8px] text-shafx-textMuted">{connection.label}</div></div><span className="rounded-full border border-shafx-success/20 bg-shafx-success/5 px-1.5 py-0.5 font-mono text-[7px] font-semibold text-shafx-success">{health.status}</span></div>
              <div className="mt-2 space-y-1.5">{connection.accounts.filter((item) => item.active).map((providerAccount) => {
                const selected = brokerMode && activeProviderSelection?.connectionId === connection.id && activeProviderSelection.accountId === providerAccount.providerAccountId
                return <button key={providerAccount.id} type="button" onClick={() => selectBrokerAccount(connection, providerAccount.providerAccountId, providerAccount.environment)} className={selected ? 'flex min-h-12 w-full items-center justify-between rounded-xl border border-shafx-accent/35 bg-shafx-accent/10 px-3 text-left' : 'flex min-h-12 w-full items-center justify-between rounded-xl border border-shafx-border bg-shafx-surface px-3 text-left hover:border-shafx-accent/30'}>
                  <span className="min-w-0"><span className="block truncate text-[10px] font-semibold">{providerAccount.label}</span><span className="mt-0.5 block truncate font-mono text-[8px] text-shafx-textMuted">{providerAccount.providerAccountId} • {providerAccount.environment === 'live' ? 'Real' : 'Demo'} • {providerAccount.currency ?? '—'}</span></span>
                  {selected ? <span className="flex items-center gap-1 rounded-full bg-shafx-accent/15 px-2 py-1 text-[8px] font-semibold text-shafx-accent"><Check className="h-3 w-3" />Current</span> : <span className="text-[8px] font-semibold text-shafx-textMuted">Use account</span>}
                </button>
              })}
              </div>
            </div>
          })}
        </div>
        {brokerMode && <button type="button" onClick={switchToSimulator} className="mt-3 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-shafx-border bg-shafx-bg text-[9px] font-semibold text-shafx-textMuted">Switch to SHAFX Simulator</button>}
      </section>
    )}

    {user && (
      <section className="rounded-2xl border border-shafx-border bg-shafx-surface p-3.5 shadow-[0_14px_36px_rgba(0,0,0,.18)] sm:p-4">
        <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Plus className="h-4 w-4 text-shafx-accent" /><h3 className="text-sm font-semibold">Connect a broker</h3></div><p className="mt-1 text-[9px] leading-4 text-shafx-textMuted">Choose a supported broker connection. SHAFX keeps provider credentials on the server boundary.</p></div></div>
        <div className="mt-3 space-y-2">
          {brokerProviders.map((provider) => {
            const isDeriv = provider.id === 'deriv'
            const isOpen = providerOpen === provider.id
            return <div key={provider.id} className="rounded-xl border border-shafx-border bg-shafx-bg/55 p-3">
              <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-shafx-accent/10 text-shafx-accent"><Building2 className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="text-xs font-semibold">{provider.name}</div><p className="mt-0.5 text-[8px] leading-4 text-shafx-textMuted">{provider.description}</p></div><span className="rounded-full border border-shafx-border px-2 py-1 font-mono text-[7px] text-shafx-textMuted">{provider.authMethods[0] === 'oauth2' ? 'OAUTH' : 'API KEY'}</span></div>
              <div className="mt-2 flex justify-end">
                {isDeriv ? <button type="button" onClick={connectDeriv} className="flex min-h-10 items-center gap-1.5 rounded-lg bg-shafx-accent px-3 text-[9px] font-semibold text-white"><ExternalLink className="h-3.5 w-3.5" />{connected.some((item) => item.providerId === 'deriv') ? 'Add Deriv account' : 'Connect Deriv'}</button> : <button type="button" onClick={() => { setProviderOpen(isOpen ? null : provider.id); setProviderError(null) }} className="flex min-h-10 items-center gap-1.5 rounded-lg border border-shafx-border bg-shafx-surface px-3 text-[9px] font-semibold text-shafx-text">{isOpen ? 'Hide form' : 'Connect ' + provider.name}</button>}
              </div>
              {isOpen && !isDeriv && <div className="mt-2"><ProviderCredentialForm descriptor={provider} busy={providerBusy === provider.id} error={providerError} onSubmit={(credentials) => void connectProvider(provider.id, credentials)} /></div>}
            </div>
          })}
        </div>
      </section>
    )}

    {user && !brokerMode && (
      <section className="rounded-2xl border border-shafx-success/20 bg-shafx-surface p-3.5 sm:p-4">
        <div className="flex items-start gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-shafx-success/10 text-shafx-success"><Wallet className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="text-sm font-semibold">SHAFX Simulator</div><p className="mt-1 text-[9px] leading-4 text-shafx-textMuted">Practice with the isolated simulator account. It does not share history with provider accounts.</p></div><span className="rounded-full border border-shafx-success/20 bg-shafx-success/5 px-2 py-1 font-mono text-[7px] font-semibold text-shafx-success">ACTIVE</span></div>
        <div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-xl border border-shafx-border bg-shafx-bg/70 p-3"><span className="text-[8px] uppercase tracking-[0.12em] text-shafx-textMuted">Balance</span><strong className="mt-1 block font-mono text-sm">{formatCurrency(account.balance, account.currency)}</strong></div><div className="rounded-xl border border-shafx-border bg-shafx-bg/70 p-3"><span className="text-[8px] uppercase tracking-[0.12em] text-shafx-textMuted">Account ID</span><strong className="mt-1 block truncate font-mono text-[9px]">{accountId}</strong></div></div>
      </section>
    )}

    <section className="rounded-2xl border border-shafx-border bg-shafx-surface p-3.5 sm:p-4">
      <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-shafx-accent" /><h3 className="text-sm font-semibold">Account actions</h3></div>
      <div className="mt-3 rounded-xl border border-shafx-border bg-shafx-bg/60 p-3"><div className="text-[9px] text-shafx-textMuted">SHAFX identity</div><div className="mt-1 text-xs font-semibold">{user?.displayName || user?.email?.split('@')[0] || 'Guest'}</div><div className="mt-0.5 text-[9px] text-shafx-textMuted">{user?.email ?? 'Not signed in'}</div><button type="button" onClick={() => { if (user) void signOut() }} className="mt-3 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-shafx-border bg-shafx-surface text-[9px] font-semibold text-shafx-textMuted"><LogOut className="h-3.5 w-3.5" />{user ? 'Sign out' : 'Sign in above'}</button></div>
    </section>
    <p className="px-1 text-[10px] leading-relaxed text-shafx-textMuted">SIMULATED — NOT FINANCIAL ADVICE. SHAFX identity, demo balances and simulated orders are separate from broker accounts and real money.</p>
  </div>
}
