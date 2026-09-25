import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, Check, Copy, ExternalLink, LogOut, RefreshCw, ShieldCheck, UserCircle, Wallet } from 'lucide-react'
import type { AccountData } from '../../types'
import { formatCurrency, formatPercent } from '../../lib/format'
import { getProviderConnections, setStoredProviderSelection, subscribeToProviderSelection, type ActiveProviderSelection, type ProviderConnectionRecord } from '../../data/provider/providerConnections'
import { assessProviderConnectionRecord } from '../../data/provider/providerConnectionHealth'
import { useAuth } from '../../app/AuthContext'

interface Props { account: AccountData; activeProviderSelection?: ActiveProviderSelection | null }

export const AccountPanel: React.FC<Props> = ({ account, activeProviderSelection = null }) => {
  const [copied, setCopied] = useState(false)
  const [connections, setConnections] = useState<ProviderConnectionRecord[]>([])
  const [checking, setChecking] = useState(true)
  const { user, signOut } = useAuth()
  const positive = account.floatingPL >= 0
  const plPercent = account.balance > 0 ? (account.floatingPL / account.balance) * 100 : 0

  const refresh = useCallback(async () => {
    if (!user) return
    setChecking(true)
    try { setConnections(await getProviderConnections()) } finally { setChecking(false) }
  }, [user])

  useEffect(() => { void refresh(); return subscribeToProviderSelection(() => void refresh()) }, [refresh])

  const connected = useMemo(() => connections.filter((item) => item.state === 'connected' && item.accounts.some((accountItem) => accountItem.active)), [connections])
  const activeConnection = connected.find((item) => item.id === activeProviderSelection?.connectionId) ?? connected.find((item) => item.providerId === 'deriv')
  const activeAccount = activeConnection?.accounts.find((item) => item.providerAccountId === activeProviderSelection?.accountId && item.active) ?? activeConnection?.accounts.find((item) => item.active)

  const copyAccountId = async (): Promise<void> => {
    const id = activeAccount?.providerAccountId ?? activeProviderSelection?.accountId
    if (!id) return
    try { await navigator.clipboard.writeText(id); setCopied(true); window.setTimeout(() => setCopied(false), 1200) } catch { /* clipboard unavailable */ }
  }

  const selectAccount = (connection: ProviderConnectionRecord, providerAccountId: string, environment: 'demo' | 'live'): void => {
    setStoredProviderSelection({ providerId: connection.providerId, connectionId: connection.id, accountId: providerAccountId, environment })
    window.location.reload()
  }

  return <div className="space-y-3">
    <section className="rounded-2xl border border-shafx-border bg-shafx-surface p-3.5 shadow-[0_14px_36px_rgba(0,0,0,.18)] sm:p-4">
      <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-shafx-primary/10 text-shafx-primary"><UserCircle className="h-5 w-5" /></div><div><h2 className="text-sm font-semibold">SHAFX account</h2><p className="text-[9px] leading-4 text-shafx-textMuted">Your SHAFX identity is separate from your Deriv account.</p></div></div><span className="rounded-full border border-shafx-success/20 bg-shafx-success/10 px-2 py-1 text-[8px] font-semibold text-shafx-success">ACTIVE</span></div>
      {user && <div className="mt-3 rounded-xl border border-shafx-border bg-shafx-bg p-3"><div className="text-sm font-semibold">{user.displayName || user.email.split('@')[0]}</div><div className="mt-1 text-[9px] text-shafx-textMuted">{user.email}</div><button type="button" onClick={() => void signOut()} className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-shafx-border bg-shafx-surface text-[9px] font-semibold text-shafx-textMuted"><LogOut className="h-3.5 w-3.5" />Sign out</button></div>}
    </section>

    <section className="overflow-hidden rounded-2xl border border-shafx-border bg-shafx-surface p-3.5 sm:p-4">
      <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><Wallet className="h-4 w-4 text-shafx-accent" /><h3 className="text-sm font-semibold">Current Deriv account</h3></div><span className={activeProviderSelection?.environment === 'live' ? 'rounded-full border border-shafx-accent/25 bg-shafx-accent/10 px-2 py-1 text-[8px] font-bold text-shafx-accent' : 'rounded-full border border-shafx-success/20 bg-shafx-success/10 px-2 py-1 text-[8px] font-bold text-shafx-success'}>{activeProviderSelection?.environment === 'live' ? 'REAL' : 'DEMO'}</span></div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-shafx-border bg-shafx-bg/70 p-3"><span className="text-[8px] uppercase tracking-[0.14em] text-shafx-textMuted">Balance</span><strong className="mt-1 block font-mono text-sm tabular">{formatCurrency(account.balance, account.currency)}</strong></div>
        <div className="rounded-xl border border-shafx-border bg-shafx-bg/70 p-3"><span className="text-[8px] uppercase tracking-[0.14em] text-shafx-textMuted">Equity</span><strong className="mt-1 block font-mono text-sm tabular">{formatCurrency(account.equity, account.currency)}</strong></div>
        <div className="rounded-xl border border-shafx-border bg-shafx-bg/70 p-3"><span className="text-[8px] uppercase tracking-[0.14em] text-shafx-textMuted">Free margin</span><strong className="mt-1 block font-mono text-sm tabular">{formatCurrency(account.freeMargin, account.currency)}</strong></div>
        <div className="rounded-xl border border-shafx-border bg-shafx-bg/70 p-3"><span className="text-[8px] uppercase tracking-[0.14em] text-shafx-textMuted">Floating P/L</span><strong className={positive ? 'mt-1 block font-mono text-sm tabular text-shafx-success' : 'mt-1 block font-mono text-sm tabular text-shafx-danger'}>{positive ? '+' : ''}{formatCurrency(account.floatingPL, account.currency)} <span className="text-[8px]">({formatPercent(plPercent)})</span></strong></div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-shafx-border bg-shafx-bg/60 p-3"><div className="min-w-0"><div className="text-[8px] uppercase tracking-[0.14em] text-shafx-textMuted">Broker account ID</div><div className="mt-1 truncate font-mono text-[10px] font-semibold">{activeAccount?.providerAccountId ?? activeProviderSelection?.accountId ?? 'Connected Deriv account'}</div></div><button type="button" onClick={() => void copyAccountId()} className="flex min-h-9 items-center gap-1.5 rounded-lg border border-shafx-border bg-shafx-surface px-2.5 text-[9px] font-semibold text-shafx-textMuted"><Copy className="h-3 w-3" />{copied ? 'Copied' : 'Copy ID'}</button></div>
    </section>

    <section className="rounded-2xl border border-shafx-border bg-shafx-surface p-3.5 sm:p-4">
      <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-shafx-accent" /><h3 className="text-sm font-semibold">Connected Deriv accounts</h3></div>
      <div className="mt-3 space-y-2">
        {checking ? <div className="text-[10px] text-shafx-textMuted">Refreshing Deriv accounts…</div> : connected.flatMap((connection) => connection.accounts.filter((item) => item.active).map((item) => {
          const selected = activeProviderSelection?.accountId === item.providerAccountId
          return <button key={item.id} type="button" onClick={() => selectAccount(connection, item.providerAccountId, item.environment)} className={selected ? 'flex min-h-12 w-full items-center justify-between rounded-xl border border-shafx-accent/30 bg-shafx-accent/10 px-3 text-left' : 'flex min-h-12 w-full items-center justify-between rounded-xl border border-shafx-border bg-shafx-bg px-3 text-left hover:border-shafx-accent/30'}>
            <span><span className="block text-[10px] font-semibold">{item.environment === 'live' ? 'Real account' : 'Demo account'}</span><span className="mt-0.5 block font-mono text-[8px] text-shafx-textMuted">{item.providerAccountId} • {item.currency ?? '—'} • {item.balance === null ? '—' : item.currency + ' ' + item.balance.toFixed(2)}</span></span>
            {selected ? <span className="flex items-center gap-1 rounded-full bg-shafx-accent/15 px-2 py-1 text-[8px] font-semibold text-shafx-accent"><Check className="h-3 w-3" />Current</span> : <span className="text-[8px] text-shafx-textMuted">Use</span>}
          </button>
        })) }
      </div>
    </section>

    <section className="rounded-2xl border border-shafx-border bg-shafx-surface p-3.5 sm:p-4">
      <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-shafx-accent" /><h3 className="text-sm font-semibold">Account safety</h3></div>
      <p className="mt-2 text-[9px] leading-5 text-shafx-textMuted">SHAFX reads the connected Deriv account. Your trading money remains at Deriv; SHAFX does not create a separate trading wallet.</p>
    </section>
  </div>
