import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, Check, ChevronRight, Copy, ExternalLink, KeyRound, Link2, LogIn, LogOut, Plus, RefreshCw, ShieldCheck, TrendingDown, TrendingUp, UserCircle, UserPlus, Wallet } from 'lucide-react'
import type { AccountData } from '../../types'
import { formatCurrency, formatPercent } from '../../lib/format'
import { useAuth } from '../../app/AuthContext'
import { getProviderConnections, setStoredProviderSelection, subscribeToProviderSelection, type ActiveProviderSelection, type ProviderConnectionRecord } from '../../data/provider/providerConnections'
import { providerCatalog } from '../../integrations/catalog'
import { assessProviderConnectionRecord } from '../../data/provider/providerConnectionHealth'
import { ProviderCredentialForm } from '../market/ProviderCredentialForm'
import { setStoredTradingMode } from '../../app/tradingMode'

interface Props {
  account: AccountData
  activeProviderSelection?: ActiveProviderSelection | null
  brokerMode?: boolean
}

type FormMode = 'signin' | 'signup'
type ProviderLoadState = 'checking' | 'ready' | 'error'

async function publicAuthRequest(action: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/auth?action=${encodeURIComponent(action)}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json().catch(() => ({ ok: false, error: 'Unexpected SHAFX identity response.' }))
  if (!response.ok || !data.ok) throw new Error(data.error || 'SHAFX identity request failed.')
  return data
}

export const AccountPanel: React.FC<Props> = ({ account, activeProviderSelection = null, brokerMode = false }) => {
  const [created, setCreated] = useState(false)
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
  const [connectionState, setConnectionState] = useState<ProviderLoadState>('checking')
  const [providerOpen, setProviderOpen] = useState<string | null>(null)
  const [providerBusy, setProviderBusy] = useState<string | null>(null)
  const [providerError, setProviderError] = useState<string | null>(null)
  const { user, loading, error, signIn, signUp, signOut } = useAuth()

  const currentDescriptor = useMemo(
    () => providerCatalog.find((provider) => provider.id === activeProviderSelection?.providerId) ?? null,
    [activeProviderSelection?.providerId],
  )

  const brokerProviders = useMemo(
    () => providerCatalog.filter((provider) => provider.kind === 'broker' && provider.status === 'available'),
    [],
  )

  const connected = useMemo(
    () => connections.filter((connection) => connection.state === 'connected' && connection.accounts.some((account) => account.active)),
    [connections],
  )

  const accountId = user?.simulatorAccountId ?? 'Sign in to view'
  const isCurrentSimulator = !brokerMode
  const positive = account.floatingPL >= 0
  const plPercent = account.balance > 0 ? account.floatingPL / account.balance * 100 : 0

  const refreshConnections = useCallback(async (): Promise<void> => {
    if (!user) return
    try {
      setConnectionState('checking')
      const next = await getProviderConnections()
      setConnections(next)
      setConnectionState('ready')
    } catch {
      setConnectionState('error')
    }
  }, [user])

  useEffect(() => { void refreshConnections() }, [refreshConnections])
  useEffect(() => subscribeToProviderSelection(() => { void refreshConnections() }), [refreshConnections])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('auth') !== 'reset') return
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const token = hash.get('access_token')
    if (token) setResetToken(token)
  }, [])

  const copyId = async (): Promise<void> => {
    if (!user) return
    try {
      await navigator.clipboard.writeText(accountId)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch { setCopied(false) }
  }

  const switchToSimulator = (): void => {
    setStoredTradingMode('simulator', accountId === 'Sign in to view' ? undefined : accountId)
    window.location.assign('/?account=demo')
  }

  const selectBrokerAccount = (connection: ProviderConnectionRecord, providerAccountId: string, environment: 'demo' | 'live'): void => {
    setStoredProviderSelection({
      providerId: connection.providerId,
      connectionId: connection.id,
      accountId: providerAccountId,
      environment,
    })
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
      if (!response.ok || !data?.ok) throw new Error(typeof data?.error === 'string' ? data.error : `Unable to connect ${providerId}.`)
      setProviderOpen(null)
      await refreshConnections()
    } catch (err) {
      setProviderError(err instanceof Error ? err.message : 'Unable to connect provider.')
    } finally {
      setProviderBusy(null)
    }
  }

  const submitAuth = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    setSubmitting(true)
    setMessage(null)
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
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to complete SHAFX account request.')
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="space-y-3">
    {user && (
      <section className="overflow-hidden rounded-2xl border border-shafx-border bg-shafx-surface shadow-[0_18px_50px_rgba(0,0,0,.22)]">
        <div className="border-b border-shafx-border bg-[radial-gradient(circle_at_top_right,rgba(124,92,252,.16),transparent_45%)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-shafx-accent/10 text-shafx-accent"><Wallet className="h-5 w-5" /></div>
              <div className="min-w-0">
                <div className="flex items-center gap-2"><h2 className="truncate text-base font-semibold">Current account</h2><span className={brokerMode ? 'rounded-full border border-shafx-accent/25 bg-shafx-accent/10 px-2 py-0.5 font-mono text-[8px] font-bold text-shafx-accent' : 'rounded-full border border-shafx-success/20 bg-shafx-success/10 px-2 py-0.5 font-mono text-[8px] font-bold text-shafx-success'}>{brokerMode ? 'PROVIDER' : 'SIMULATOR'}</span></div>
                <p className="mt-1 text-[9px] text-shafx-textMuted">{brokerMode ? currentDescriptor?.name ?? 'Connected broker' : 'SHAFX Demo Account'} • {brokerMode ? (activeProviderSelection?.environment === 'live' ? 'Real' : 'Demo') : 'Practice account'}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-shafx-success shadow-[0_0_12px_rgba(34,211,165,.5)]" /><span className="font-mono text-[8px] uppercase tracking-[0.12em] text-shafx-textMuted">Connected</span></div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-shafx-border bg-shafx-bg/75 p-3"><span className="text-[8px] uppercase tracking-[0.14em] text-shafx-textMuted">Balance</span><strong className="mt-1 block font-mono text-sm tabular">{formatCurrency(account.balance, account.currency)}</strong></div>
            <div className="rounded-xl border border-shafx-border bg-shafx-bg/75 p-3"><span className="text-[8px] uppercase tracking-[0.14em] text-shafx-textMuted">Equity</span><strong className="mt-1 block font-mono text-sm tabular">{formatCurrency(account.equity, account.currency)}</strong></div>
            <div className="rounded-xl border border-shafx-border bg-shafx-bg/75 p-3"><span className="text-[8px] uppercase tracking-[0.14em] text-shafx-textMuted">Free margin</span><strong className="mt-1 block font-mono text-sm tabular">{formatCurrency(account.freeMargin, account.currency)}</strong></div>
            <div className="rounded-xl border border-shafx-border bg-shafx-bg/75 p-3"><span className="text-[8px] uppercase tracking-[0.14em] text-shafx-textMuted">Floating P/L</span><strong className={positive ? 'mt-1 block font-mono text-sm tabular text-shafx-success' : 'mt-1 block font-mono text-sm tabular text-shafx-danger'}>{positive ? '+' : ''}{formatCurrency(account.floatingPL, account.currency)} <span className="text-[8px]">({formatPercent(plPercent)})</span></strong></div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-shafx-border bg-shafx-bg/60 px-3 py-2.5">
            <div className="min-w-0"><div className="truncate text-[9px] text-shafx-textMuted">{brokerMode ? 'Broker account' : 'Simulator account'} ID</div><div className="mt-0.5 truncate font-mono text-[10px] font-semibold">{brokerMode ? activeProviderSelection?.accountId ?? 'Selected provider account' : accountId}</div></div>
            <button type="button" onClick={copyId} className="flex min-h-9 items-center gap-1.5 rounded-lg border border-shafx-border bg-shafx-surface px-2.5 text-[9px] font-semibold text-shafx-textMuted"><Copy className="h-3 w-3" />{copied ? 'Copied' : 'Copy ID'}</button>
          </div>
        </div>
      </section>
    )}

    {user && (
      <section className="rounded-2xl border border-shafx-border bg-shafx-surface p-3.5 shadow-[0_14px_36px_rgba(0,0,0,.18)] sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div><div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-shafx-accent" /><h3 className="text-sm font-semibold">Connected brokers</h3></div><p className="mt-1 text-[9px] leading-4 text-shafx-textMuted">Switch between accounts without mixing their balances or trade state.</p></div>
          <button type="button" onClick={() => void refreshConnections()} className="rounded-lg border border-shafx-border bg-shafx-bg p-2 text-shafx-textMuted" title="Refresh connected brokers"><RefreshCw className={connectionState === 'checking' ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} /></button>
        </div>
        <div className="mt-3 space-y-2">
          {connectionState === 'error' && <div className="rounded-xl border border-shafx-danger/20 bg-shafx-danger/5 p-3 text-[9px] text-shafx-danger">Unable to load broker connections right now.</div>}
          {!connected.length && connectionState !== 'checking' && <div className="rounded-xl border border-dashed border-shafx-border bg-shafx-bg/60 p-4 text-center"><Link2 className="mx-auto h-5 w-5 text-shafx-textMuted" /><div className="mt-2 text-xs font-semibold">No broker connected</div><p className="mt-1 text-[9px] text-shafx-textMuted">Choose a broker below to connect an account.</p></div>}
          {connected.map((connection) => {
            const descriptor = providerCatalog.find((provider) => provider.id === connection.providerId)
            const health = assessProviderConnectionRecord(connection)
            return <div key={connection.id} className="rounded-xl border border-shafx-border bg-shafx-bg/55 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><div className="flex items-center gap-2"><div className="truncate text-xs font-semibold">{descriptor?.name ?? connection.providerId}</div><span className="rounded-full border border-shafx-success/20 bg-shafx-success/5 px-1.5 py-0.5 text-[7px] font-semibold text-shafx-success">{health.status}</span></div><div className="mt-1 truncate text-[8px] text-shafx-textMuted">{connection.label}</div></div>
                <span className="font-mono text-[8px] text-shafx-textMuted">{connection.accounts.filter((item) => item.active).length} accounts</span>
              </div>
              <div className="mt-2 space-y-1.5">{connection.accounts.filter((item) => item.active).map((providerAccount) => {
                const selected = brokerMode && activeProviderSelection?.connectionId === connection.id && activeProviderSelection.accountId === providerAccount.providerAccountId
                return <button key={providerAccount.id} type="button" onClick={() => selectBrokerAccount(connection, providerAccount.providerAccountId, providerAccount.environment)} className={selected ? 'flex min-h-12 w-full items-center justify-between rounded-xl border border-shafx-accent/35 bg-shafx-accent/10 px-3 text-left' : 'flex min-h-12 w-full items-center justify-between rounded-xl border border-shafx-border bg-shafx-surface px-3 text-left hover:border-shafx-accent/30'}>
                  <span className="min-w-0"><span className="block truncate text-[10px] font-semibold">{providerAccount.label}</span><span className="mt-0.5 block truncate font-mono text-[8px] text-shafx-textMuted">{providerAccount.providerAccountId} • {providerAccount.environment === 'live' ? 'Real' : 'Demo'} • {providerAccount.currency ?? '—'}</span></span>
                  <span className="ml-2 shrink-0">{selected ? <span className="flex items-center gap-1 rounded-full bg-shafx-accent/15 px-2 py-1 text-[8px] font-semibold text-shafx-accent"><Check className="h-3 w-3" />Current</span> : <span className="text-[8px] font-semibold text-shafx-textMuted">Use</span>}</span>
                </button>
              })}
              </div>
            </div>
          })}
        </div>
      </section>
    )}

    {user && (
      <section className="rounded-2xl border border-shafx-border bg-shafx-surface p-3.5 shadow-[0_14px_36px_rgba(0,0,0,.18)] sm:p-4">
        <div><div className="flex items-center gap-2"><Plus className="h-4 w-4 text-shafx-accent" /><h3 className="text-sm font-semibold">Connect another broker</h3></div><p className="mt-1 text-[9px] leading-4 text-shafx-textMuted">Your available connections live here. SHAFX keeps credentials behind the server-side provider boundary.</p></div>
        <div className="mt-3 space-y-2">
          {brokerProviders.map((provider) => {
            const isDeriv = provider.id === 'deriv'
            const isOpen = providerOpen === provider.id
            return <div key={provider.id} className="rounded-xl border border-shafx-border bg-shafx-bg/55 p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-shafx-accent/10 text-shafx-accent"><Building2 className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1"><div className="text-xs font-semibold">{provider.name}</div><p className="mt-0.5 text-[8px] leading-4 text-shafx-textMuted">{provider.description}</p></div>
                <span className="rounded-full border border-shafx-border px-2 py-1 font-mono text-[7px] text-shafx-textMuted">{provider.authMethods[0] === 'oauth2' ? 'OAUTH' : 'API KEY'}</span>
              </div>
              <div className="mt-2 flex justify-end">
                {isDeriv
                  ? <button type="button" onClick={connectDeriv} className="flex min-h-10 items-center gap-1.5 rounded-lg bg-shafx-accent px-3 text-[9px] font-semibold text-white"><ExternalLink className="h-3.5 w-3.5" />{connected.some((item) => item.providerId === 'deriv') ? 'Connect another Deriv account' : 'Connect Deriv'}</button>
                  : <button type="button" onClick={() => { setProviderOpen(isOpen ? null : provider.id); setProviderError(null) }} className="flex min-h-10 items-center gap-1.5 rounded-lg border border-shafx-border bg-shafx-surface px-3 text-[9px] font-semibold text-shafx-text">{isOpen ? 'Hide form' : 'Connect ' + provider.name}<ChevronRight className={isOpen ? 'h-3.5 w-3.5 rotate-90' : 'h-3.5 w-3.5'} /></button>}
              </div>
              {isOpen && !isDeriv && <div className="mt-2"><ProviderCredentialForm descriptor={provider} busy={providerBusy === provider.id} error={providerError} onSubmit={(credentials) => void connectProvider(provider.id, credentials)} /></div>}
            </div>
          })}
        </div>
      </section>
    )}

    {user && (
      <section className="rounded-2xl border border-shafx-border bg-shafx-surface p-3.5 shadow-[0_14px_36px_rgba(0,0,0,.18)] sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div><div className="flex items-center gap-2"><UserCircle className="h-4 w-4 text-shafx-accent" /><h3 className="text-sm font-semibold">SHAFX identity</h3></div><p className="mt-1 text-[9px] leading-4 text-shafx-textMuted">Your SHAFX login is separate from connected broker accounts.</p></div>
          <span className="rounded-full border border-shafx-success/20 bg-shafx-success/5 px-2 py-1 font-mono text-[7px] font-semibold text-shafx-success">SIGNED IN</span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-shafx-border bg-shafx-bg/60 p-3"><div className="min-w-0"><div className="truncate text-xs font-semibold">{user.displayName || user.email.split('@')[0]}</div><div className="mt-0.5 truncate text-[9px] text-shafx-textMuted">{user.email}</div></div><button type="button" onClick={() => void signOut()} className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-shafx-border bg-shafx-surface px-3 text-[9px] font-semibold text-shafx-textMuted"><LogOut className="h-3.5 w-3.5" />Sign out</button></div>
      </section>
    )}

    {!user && (
      <section className="rounded-2xl border border-shafx-border bg-shafx-surface p-4 shadow-[0_14px_36px_rgba(0,0,0,.18)]">
        <div className="flex items-start gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-shafx-accent/10 text-shafx-accent"><UserCircle className="h-5 w-5" /></div><div><h2 className="text-sm font-semibold">Your SHAFX account</h2><p className="mt-1 text-[10px] text-shafx-textMuted">Sign in to keep your simulator account and broker connections separate.</p></div></div>
      </section>
    )}

    {!user && (
      resetToken ? (
        <section className="rounded-2xl border border-shafx-border bg-shafx-surface p-4">
          <div className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-shafx-accent" />Set a new password</div>
          <p className="mt-1 text-[10px] text-shafx-textMuted">Choose a new password of at least 10 characters.</p>
          <form onSubmit={(event) => void submitAuth(event)} className="mt-3 space-y-2">
            <input value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} type="password" autoComplete="new-password" required minLength={10} placeholder="New password" className="min-h-11 w-full rounded-lg border border-shafx-border bg-shafx-bg px-3 text-sm outline-none" />
            <input value={resetConfirm} onChange={(event) => setResetConfirm(event.target.value)} type="password" autoComplete="new-password" required minLength={10} placeholder="Confirm new password" className="min-h-11 w-full rounded-lg border border-shafx-border bg-shafx-bg px-3 text-sm outline-none" />
            <button disabled={submitting} type="submit" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-shafx-primary px-3 text-sm font-semibold text-white disabled:opacity-60"><KeyRound className="h-4 w-4" />{submitting ? 'Please wait…' : 'Change password'}</button>
          </form>
        </section>
      ) : (
        <section className="rounded-2xl border border-shafx-border bg-shafx-surface p-4">
          {!forgotMode && (
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-shafx-border bg-shafx-bg p-1">
              <button type="button" onClick={() => { setFormMode('signin'); setMessage(null) }} className={`min-h-10 rounded-lg text-xs font-semibold ${formMode === 'signin' ? 'bg-shafx-accent text-white' : 'text-shafx-textMuted'}`}>Sign in</button>
              <button type="button" onClick={() => { setFormMode('signup'); setMessage(null) }} className={`min-h-10 rounded-lg text-xs font-semibold ${formMode === 'signup' ? 'bg-shafx-accent text-white' : 'text-shafx-textMuted'}`}>Create account</button>
            </div>
          )}
          <form onSubmit={(event) => void submitAuth(event)} className="relative mt-3 space-y-2">
            {forgotMode ? (
              <>
                <div className="rounded-xl border border-shafx-border bg-shafx-bg p-3"><div className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-shafx-accent" />Reset your password</div><p className="mt-1 text-[10px] text-shafx-textMuted">Enter your email and SHAFX will send a secure reset link.</p></div>
                <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required placeholder="Email address" className="min-h-11 w-full rounded-lg border border-shafx-border bg-shafx-bg px-3 text-sm outline-none" />
                <button disabled={submitting} type="submit" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-shafx-accent px-3 text-sm font-semibold text-white disabled:opacity-60"><KeyRound className="h-4 w-4" />{submitting ? 'Sending…' : 'Send reset link'}</button>
              </>
            ) : (
              <>
                {formMode === 'signup' && <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" className="min-h-11 w-full rounded-lg border border-shafx-border bg-shafx-bg px-3 text-sm outline-none" />}
                <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required placeholder="Email address" className="min-h-11 w-full rounded-lg border border-shafx-border bg-shafx-bg px-3 text-sm outline-none" />
                <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={formMode === 'signin' ? 'current-password' : 'new-password'} required minLength={formMode === 'signup' ? 10 : 1} placeholder={formMode === 'signup' ? 'Password (minimum 10 characters)' : 'Password'} className="min-h-11 w-full rounded-lg border border-shafx-border bg-shafx-bg px-3 text-sm outline-none" />
                {formMode === 'signup' && (
                  <>
                    <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" required minLength={10} placeholder="Confirm password" className="min-h-11 w-full rounded-lg border border-shafx-border bg-shafx-bg px-3 text-sm outline-none" />
                    <input aria-hidden="true" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} className="absolute -left-[10000px] top-auto h-px w-px opacity-0" />
                  </>
                )}
                <button disabled={submitting} type="submit" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-shafx-accent px-3 text-sm font-semibold text-white disabled:opacity-60">{formMode === 'signin' ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}{submitting ? 'Please wait…' : formMode === 'signin' ? 'Sign in to SHAFX' : 'Create SHAFX account'}</button>
                {formMode === 'signin' && <button type="button" onClick={() => { setForgotMode(true); setMessage(null) }} className="w-full py-1 text-[10px] text-shafx-accent">Forgot password?</button>}
              </>
            )}
          </form>
          {(message || error) && <p className="mt-2 text-[10px] leading-relaxed text-shafx-textMuted">{message || error}</p>}
          {forgotMode && <button type="button" onClick={() => { setForgotMode(false); setMessage(null) }} className="mt-2 w-full text-[10px] text-shafx-textMuted">Back to sign in</button>}
        </section>
      )
    )}

    <p className="px-1 text-[9px] leading-4 text-shafx-textMuted">SHAFX keeps its identity layer separate from provider credentials, account balances and trading state. Provider switching changes the active account context; it does not merge account history.</p>
  </div>