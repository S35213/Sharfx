import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, CheckCircle2, ChevronRight, Link2, RefreshCw, ShieldCheck, WalletCards } from 'lucide-react'
import { PublicWelcome } from './PublicWelcome'
import { getProviderConnections, setStoredProviderSelection, type ProviderConnectionRecord } from '../../data/provider/providerConnections'
import { useAuth } from '../../app/AuthContext'

interface Props { onConnected: () => void }

type BrokerTile = { id: string; name: string; kind: 'available' | 'soon'; note: string }

const BROKERS: BrokerTile[] = [
  { id: 'deriv', name: 'Deriv', kind: 'available', note: 'CFD trading through Deriv cTrader — one secure broker connection' },
  { id: 'hfm', name: 'HFM', kind: 'soon', note: 'Coming soon' },
  { id: 'exness', name: 'Exness', kind: 'soon', note: 'Coming soon' },
  { id: 'oanda', name: 'OANDA', kind: 'soon', note: 'Coming soon' },
]

function BrokerLogo({ id, name }: { id: string; name: string }) {
  if (id === 'deriv') return <div title={name} className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-slate-900 shadow-sm"><span className="text-[15px] font-black tracking-[-0.08em]">d</span></div>
  if (id === 'hfm') return <div title={name} className="flex h-11 w-11 items-center justify-center rounded-xl border border-red-500/25 bg-red-500/10 text-red-400"><span className="text-[12px] font-black">HFM</span></div>
  if (id === 'exness') return <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-shafx-border bg-shafx-bg text-shafx-textMuted"><span className="text-[10px] font-black tracking-tight">EX</span></div>
  return <div title={name} className="flex h-11 w-11 items-center justify-center rounded-xl border border-shafx-border bg-shafx-bg text-shafx-textMuted"><span className="text-[11px] font-black">OA</span></div>
}

function balanceText(balance: number | null, currency: string | null): string {
  if (!Number.isFinite(Number(balance))) return 'Balance unavailable'
  return (currency || '—') + ' ' + Number(balance).toFixed(2)
}

export const AccountAccessGate: React.FC<Props> = ({ onConnected }) => {
  const { user } = useAuth()
  const [connections, setConnections] = useState<ProviderConnectionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const activationRequired = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('ctrader') === 'activate-required'

  const derivConnection = useMemo(() => connections.find((item) => item.providerId === 'deriv' && item.state === 'connected'), [connections])
  const ctraderConnection = useMemo(() => connections.find((item) => item.providerId === 'ctrader' && item.state === 'connected'), [connections])
  const activeConnection = ctraderConnection || derivConnection
  const accounts = useMemo(() => activeConnection?.accounts.filter((item) => item.active) ?? [], [activeConnection])

  const refresh = useCallback(async (): Promise<void> => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const next = await getProviderConnections()
      setConnections(next)

      const params = new URLSearchParams(window.location.search)
      const callbackAccountId = params.get('account')
      const callbackConnection = next.find((item) => item.providerId === 'ctrader' && item.state === 'connected')
      const callbackAccount = callbackConnection?.accounts.find((item) => item.active && item.providerAccountId === callbackAccountId)
      if (params.get('ctrader') === 'connected' && callbackConnection && callbackAccount && callbackAccount.environment === 'demo') {
        setStoredProviderSelection({
          providerId: 'ctrader',
          connectionId: callbackConnection.id,
          accountId: callbackAccount.providerAccountId,
          environment: callbackAccount.environment,
        })
        onConnected()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load broker connections.')
    } finally {
      setLoading(false)
    }
  }, [user, onConnected])

  useEffect(() => { void refresh() }, [refresh])

  const connectBroker = (): void => {
    setConnecting(true)
    setError(null)
    window.location.assign('/api/providers/ctrader?op=login')
  }

  const selectAccount = (providerAccountId: string, environment: 'demo' | 'live'): void => {
    if (!activeConnection) return
    setStoredProviderSelection({ providerId: activeConnection.providerId, connectionId: activeConnection.id, accountId: providerAccountId, environment })
    onConnected()
  }

  if (!user) return <PublicWelcome />

  return <main className="min-h-screen overflow-y-auto bg-shafx-bg px-4 py-7 text-shafx-text sm:px-8 sm:py-10">
    <div className="mx-auto max-w-5xl">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-shafx-accent/30 bg-shafx-accent/10 text-shafx-accent"><WalletCards className="h-5 w-5" /></div>
          <div><div className="text-lg font-semibold">SHAFX</div><div className="text-[9px] uppercase tracking-[0.22em] text-shafx-textMuted">Broker connection</div></div>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-shafx-border bg-shafx-surface px-3 py-2 text-[10px] text-shafx-textMuted sm:flex"><ShieldCheck className="h-3.5 w-3.5 text-shafx-success" />Signed in • {user.displayName || user.email.split('@')[0]}</div>
      </header>

      {!activeConnection ? (
        activationRequired ? (
          <section className="mx-auto mt-12 max-w-2xl">
            <div className="rounded-3xl border border-shafx-warning/25 bg-shafx-surface p-6 text-center shadow-[0_18px_60px_rgba(0,0,0,.2)]">
              <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-shafx-warning">One-time Deriv cTrader setup</div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">Your broker login worked, but no cTrader trading account is active yet.</h1>
              <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-shafx-textMuted">Deriv creates the cTrader trading account from your existing Deriv account. There is no separate cTrader password. Activate cTrader in Deriv’s CFD section, then return here and continue the same SHAFX onboarding.</p>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                <a href="https://deriv.com/help-centre-question/how-do-i-activate-a-deriv-ctrader-account" target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-shafx-accent px-4 text-xs font-semibold text-white">See cTrader activation steps <ArrowRight className="h-4 w-4" /></a>
                <button type="button" onClick={() => window.location.assign('/api/providers/ctrader?op=login')} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-shafx-border bg-shafx-bg px-4 text-xs font-semibold">Check cTrader again <RefreshCw className="h-4 w-4" /></button>
              </div>
            </div>
          </section>
        ) : (
        <section className="mx-auto mt-14 max-w-4xl">
          <div className="text-center">
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-shafx-textMuted">Required before the workspace opens</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Connect your broker once, then enter SHAFX.</h1>
            <p className="mx-auto mt-3 max-w-2xl text-base leading-7 text-shafx-textMuted">Choose Deriv and SHAFX will open the secure cTrader authorization flow directly. After authorization, your Deriv cTrader demo account can be selected automatically.</p>
          </div>

          <div className="mt-9 max-w-xl">
            {BROKERS.map((broker) => {
              const available = broker.kind === 'available'
              return <button
                key={broker.id}
                type="button"
                disabled={!available || connecting}
                onClick={available ? connectBroker : undefined}
                className={"group relative min-h-28 rounded-2xl border p-4 text-left transition " + (
                  available
                    ? "border-shafx-primary/40 bg-shafx-surface hover:border-shafx-primary/70"
                    : "border-shafx-border bg-shafx-surface/70 opacity-80"
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3"><BrokerLogo id={broker.id} name={broker.name} /><div className="min-w-0"><div className="flex items-center gap-2"><h2 className="truncate text-base font-semibold">{broker.name}</h2><span className={"rounded-full border px-2 py-1 text-[8px] font-bold uppercase tracking-wide " + (available ? "border-shafx-success/25 bg-shafx-success/10 text-shafx-success" : "border-shafx-border bg-shafx-bg text-shafx-textMuted")}>{available ? "Available" : "Coming soon"}</span></div><p className="mt-1 text-sm leading-6 text-shafx-textMuted">{available ? "One secure connection: sign in with your Deriv credentials through cTrader, authorize SHAFX, then continue." : broker.note}</p></div></div>
                  <span className={"flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 " + (connecting && available ? "border-red-500 bg-red-500 text-white" : "border-shafx-textMuted/40 bg-transparent text-transparent")}>
                    <Check className="h-4 w-4" />
                  </span>
                </div>
                <div className={"mt-3 flex items-center gap-1.5 text-[9px] font-semibold " + (available ? "text-shafx-accent" : "text-shafx-textMuted")}>{available ? (connecting ? "Opening secure cTrader authorization…" : "Log in / create access") : "Broker integration is being prepared."}<ChevronRight className="h-3 w-3" /></div>
              </button>
            })}
          </div>

          <div className="mt-5 flex items-start gap-2 rounded-2xl border border-shafx-border bg-shafx-surface/60 p-4 text-[10px] leading-5 text-shafx-textMuted"><Link2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-shafx-accent" /><span>SHAFX never asks you to type your Deriv password into SHAFX. The secure broker page handles sign-in and authorization, then SHAFX stores only the server-side authorization needed to access your connected trading account.</span></div>
          {(error || loading) && <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-shafx-textMuted">{loading ? 'Checking broker connection…' : error}</div>}
        </section>
        )
      ) : (
        <section className="mx-auto mt-12 max-w-4xl">
          <div className="text-center">
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-shafx-textMuted">{activeConnection?.providerId === 'ctrader' ? 'cTrader connected' : 'Deriv connected'}</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Choose demo or real account.</h1>
            <p className="mx-auto mt-3 max-w-2xl text-base leading-7 text-shafx-textMuted">The broker authorization is complete. SHAFX can now use the selected Deriv cTrader account without asking you to log in again.</p>
          </div>

          <div className="mt-8 rounded-3xl border border-shafx-border bg-shafx-surface p-4 shadow-[0_18px_60px_rgba(0,0,0,.2)]">
            <div className="flex items-center justify-between gap-3 border-b border-shafx-border pb-3"><div><div className="flex items-center gap-2 text-sm font-semibold"><BrokerLogo id={activeConnection?.providerId === 'ctrader' ? 'ctrader' : 'deriv'} name={activeConnection?.providerId === 'ctrader' ? 'Deriv cTrader' : 'Deriv'} /><span>{activeConnection?.providerId === 'ctrader' ? 'Deriv cTrader accounts' : 'Deriv accounts'}</span></div><div className="mt-1 text-[9px] text-shafx-textMuted">{accounts.length} connected account{accounts.length === 1 ? '' : 's'}</div></div><button type="button" onClick={() => void refresh()} className="flex min-h-10 items-center gap-2 rounded-lg border border-shafx-border px-3 text-[9px] font-semibold text-shafx-textMuted"><RefreshCw className="h-3.5 w-3.5" />Refresh</button></div>
            {accounts.length === 0 ? (
              <div className="py-12 text-center"><div className="text-sm font-semibold">No Deriv cTrader account is available yet.</div><p className="mt-2 text-sm leading-6 text-shafx-textMuted">Activate Deriv cTrader if needed, then use Check cTrader again.</p></div>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {accounts.map((account) => (
                  <div key={account.id} className="rounded-2xl border border-shafx-border bg-shafx-bg p-4">
                    <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold">{account.environment === 'live' ? 'Real account' : 'Demo account'}</div><div className="mt-1 font-mono text-[9px] text-shafx-textMuted">{account.providerAccountId}</div></div><span className={account.environment === 'live' ? 'rounded-full border border-shafx-accent/25 bg-shafx-accent/10 px-2 py-1 text-[8px] font-semibold text-shafx-accent' : 'rounded-full border border-shafx-success/25 bg-shafx-success/10 px-2 py-1 text-[8px] font-semibold text-shafx-success'}>{account.environment === 'live' ? 'REAL' : 'DEMO'}</span></div>
                    <div className="mt-6"><div className="text-[9px] uppercase tracking-[0.16em] text-shafx-textMuted">Current broker balance</div><div className="mt-1 font-mono text-2xl font-bold tabular-nums">{balanceText(account.balance, account.currency)}</div></div>
                    <button type="button" onClick={() => selectAccount(account.providerAccountId, account.environment)} className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-shafx-accent px-3 text-xs font-semibold text-white">Use this account <ArrowRight className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-shafx-border bg-shafx-surface/70 p-4"><div className="flex items-center gap-2 text-xs font-semibold"><CheckCircle2 className="h-4 w-4 text-shafx-success" />Real account money stays with the broker.</div><p className="mt-1 text-sm leading-6 text-shafx-textMuted">SHAFX reads the connected account and, where broker execution is enabled, sends authorized trading instructions through the Deriv connection. SHAFX does not need a separate wallet for your trading funds.</p></div>
            <div className="rounded-2xl border border-shafx-border bg-shafx-surface/70 p-4"><div className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck className="h-4 w-4 text-shafx-accent" />Deposit / withdraw remains on Deriv.</div><p className="mt-1 text-sm leading-6 text-shafx-textMuted">Use the broker's official funding area. SHAFX can open that official area without taking custody of the money.</p></div>
          </div>
        </section>
      )}
    </div>
  </main>
}
