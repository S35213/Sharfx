import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, RefreshCw } from 'lucide-react'
import { getProviderConnections, setStoredProviderSelection, chooseDefaultProviderSelection, type ProviderConnectionRecord } from '../../data/provider/providerConnections'

export const ProviderConnectionControl: React.FC = () => {
  const [connections, setConnections] = useState<ProviderConnectionRecord[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try { setConnections(await getProviderConnections()) } finally { setLoading(false) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const derivConnections = useMemo(() => connections.filter((item) => item.providerId === 'deriv' && item.state === 'connected'), [connections])
  const selected = chooseDefaultProviderSelection(connections)
  const selectedAccount = derivConnections.flatMap((connection) => connection.accounts).find((account) => account.active && account.providerAccountId === selected?.accountId)

  const connectDeriv = () => window.location.assign('/api/deriv/login')
  const selectAccount = (connection: ProviderConnectionRecord, accountId: string, environment: 'demo' | 'live') => {
    setStoredProviderSelection({ providerId: 'deriv', connectionId: connection.id, accountId, environment })
    window.location.reload()
  }

  return <div className="relative">
    <button type="button" onClick={() => setOpen((value) => !value)} className="flex min-h-10 max-w-[260px] items-center gap-2 rounded-lg border border-shafx-border bg-shafx-surface px-3 text-left text-xs font-semibold" aria-expanded={open}>
      <span className={'h-2 w-2 rounded-full ' + (selectedAccount ? 'bg-emerald-400' : 'bg-shafx-warning')} />
      <span className="min-w-0 flex-1 truncate">{selectedAccount ? 'Deriv • ' + (selectedAccount.environment === 'live' ? 'Real' : 'Demo') : 'Connect Deriv'}</span>
      <ChevronDown className="h-3.5 w-3.5 text-shafx-textMuted" />
    </button>
    {open && <div className="absolute right-0 top-[calc(100%+8px)] z-[120] w-[min(94vw,360px)] rounded-2xl border border-shafx-border bg-shafx-surface p-2 shadow-2xl">
      <div className="flex items-center justify-between px-2 py-1.5"><div><div className="text-[9px] font-semibold uppercase tracking-wider text-shafx-textMuted">Deriv</div><div className="text-[10px] text-shafx-textMuted">Connected broker accounts</div></div><button type="button" onClick={() => void refresh()} className="rounded p-1.5 text-shafx-textMuted"><RefreshCw className={'h-3.5 w-3.5 ' + (loading ? 'animate-spin' : '')} /></button></div>
      {!derivConnections.length ? <div className="space-y-2 p-2"><div className="rounded-xl border border-dashed border-shafx-border p-4 text-center text-[10px] text-shafx-textMuted">No Deriv connection found.</div><button type="button" onClick={connectDeriv} className="min-h-10 w-full rounded-xl bg-shafx-accent px-3 text-xs font-semibold text-white">Connect Deriv with OAuth</button></div> : <div className="space-y-2">
        {derivConnections.flatMap((connection) => connection.accounts.filter((account) => account.active).map((account) => {
          const current = selected?.connectionId === connection.id && selected.accountId === account.providerAccountId
          return <button key={account.id} type="button" onClick={() => selectAccount(connection, account.providerAccountId, account.environment)} className={current ? 'flex min-h-11 w-full items-center justify-between rounded-xl bg-shafx-accent/10 px-3 text-left' : 'flex min-h-11 w-full items-center justify-between rounded-xl border border-shafx-border px-3 text-left hover:bg-shafx-surfaceHover'}><span><span className="block text-[10px] font-semibold">{account.environment === 'live' ? 'Real account' : 'Demo account'}</span><span className="block text-[8px] text-shafx-textMuted">{account.providerAccountId} • {account.currency ?? '—'}</span></span>{current && <Check className="h-4 w-4 text-shafx-accent" />}</button>
        }))}
        <button type="button" onClick={connectDeriv} className="min-h-10 w-full rounded-xl border border-shafx-border bg-shafx-bg px-3 text-xs font-semibold text-shafx-text">Add / reconnect Deriv</button>
      </div>}
      <div className="mt-2 rounded-xl border border-shafx-border bg-shafx-bg p-2.5 text-[9px] leading-4 text-shafx-textMuted">OAuth authorization stays on the SHAFX server side. SHAFX does not ask for your Deriv password.</div>
    </div>}
  </div>
