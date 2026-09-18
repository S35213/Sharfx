import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, RefreshCw } from 'lucide-react'
import { providerCatalog } from '../../integrations/catalog'
import { ProviderCredentialForm } from './ProviderCredentialForm'
import {
  chooseDefaultProviderSelection,
  getProviderConnections,
  setStoredProviderSelection,
  type ProviderConnectionRecord,
} from '../../data/provider/providerConnections'

type LoadState = 'checking' | 'ready' | 'error'

export const ProviderConnectionControl: React.FC = () => {
  const [connections, setConnections] = useState<ProviderConnectionRecord[]>([])
  const [state, setState] = useState<LoadState>('checking')
  const [open, setOpen] = useState(false)
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [oandaOpen, setOandaOpen] = useState(false)
  const [oandaBusy, setOandaBusy] = useState(false)
  const [oandaError, setOandaError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setState('checking')
      const next = await getProviderConnections()
      setConnections(next)
      const selected = chooseDefaultProviderSelection(next)
      if (selected) {
        setStoredProviderSelection(selected)
        setSelectedConnectionId(selected.connectionId)
        setSelectedAccountId(selected.accountId ?? null)
      } else {
        setSelectedConnectionId(null)
        setSelectedAccountId(null)
      }
      setState('ready')
    } catch {
      setState('error')
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const connected = useMemo(
    () => connections.filter((item) => item.state === 'connected' && item.accounts.some((account) => account.active)),
    [connections],
  )
  const selectedConnection = connected.find((item) => item.id === selectedConnectionId) ?? connected[0]
  const selectedAccount = selectedConnection?.accounts.find((item) => item.providerAccountId === selectedAccountId && item.active)
    ?? selectedConnection?.accounts.find((item) => item.active)
  const providerName = selectedConnection
    ? providerCatalog.find((item) => item.id === selectedConnection.providerId)?.name ?? selectedConnection.providerId
    : 'No broker'

  const selectAccount = (connection: ProviderConnectionRecord, accountId: string, environment: 'demo' | 'live'): void => {
    const selection = {
      providerId: connection.providerId,
      connectionId: connection.id,
      accountId,
      environment,
    }
    setStoredProviderSelection(selection)
    setSelectedConnectionId(connection.id)
    setSelectedAccountId(accountId)
    setOpen(false)
  }

  const connectDeriv = (): void => { window.location.assign('/api/deriv/login') }

  const connectOanda = async (credentials: Record<string, string>): Promise<void> => {
    try {
      setOandaBusy(true)
      setOandaError(null)
      const response = await fetch('/api/providers/connections', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect', providerId: 'oanda', credentials }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Unable to connect OANDA.')
      setOandaOpen(false)
      await refresh()
    } catch (error) {
      setOandaError(error instanceof Error ? error.message : 'Unable to connect OANDA.')
    } finally {
      setOandaBusy(false)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={state === 'checking'}
        className="flex min-h-11 max-w-[240px] items-center gap-2 rounded-md border border-shafx-border bg-shafx-bg px-2.5 text-left text-xs font-semibold disabled:opacity-60"
        aria-expanded={open}
        aria-label="Choose broker connection and account"
      >
        <span className={'h-2 w-2 rounded-full ' + (connected.length > 0 ? 'bg-emerald-400' : state === 'error' ? 'bg-red-400' : 'bg-shafx-textMuted')} />
        <span className="min-w-0 flex-1 truncate">{selectedAccount ? providerName + ' • ' + selectedAccount.label : state === 'error' ? 'Broker unavailable' : 'Connect broker'}</span>
        {connected.length > 1 && <span className="text-[9px] text-shafx-textMuted">{connected.length}</span>}
        <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-shafx-textMuted" />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-[70] w-[min(92vw,360px)] rounded-xl border border-shafx-border bg-shafx-surface p-2 shadow-2xl">
          <div className="flex items-center justify-between px-2 py-1.5">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wider text-shafx-textMuted">Provider connections</div>
              <div className="text-[10px] text-shafx-textMuted">{connected.length} active connection{connected.length === 1 ? '' : 's'}</div>
            </div>
            <button type="button" onClick={() => void refresh()} className="rounded p-1.5 text-shafx-textMuted hover:bg-shafx-surfaceHover" title="Refresh connections">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="max-h-72 space-y-1 overflow-y-auto">
            {connected.map((connection) => (
              <div key={connection.id} className="rounded-lg border border-shafx-border bg-shafx-bg p-1.5">
                <div className="px-2 py-1 text-[10px] font-semibold">{providerCatalog.find((item) => item.id === connection.providerId)?.name ?? connection.providerId} • {connection.label}</div>
                {connection.accounts.filter((account) => account.active).map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => selectAccount(connection, account.providerAccountId, account.environment)}
                    className="flex min-h-10 w-full items-center justify-between rounded px-2 text-left text-xs hover:bg-shafx-surfaceHover"
                  >
                    <span>
                      <span className="block font-medium">{account.label}</span>
                      <span className="block text-[9px] text-shafx-textMuted">{account.providerAccountId} • {account.environment} • {account.currency ?? '—'}</span>
                    </span>
                    {connection.id === selectedConnectionId && account.providerAccountId === selectedAccountId && <Check className="h-4 w-4 text-emerald-400" />}
                  </button>
                ))}
              </div>
            ))}

            {connected.length === 0 && (
              <div className="rounded-lg border border-dashed border-shafx-border p-3 text-center text-[10px] text-shafx-textMuted">
                No persisted broker accounts are connected yet.
              </div>
            )}
          </div>

          <div className="mt-2 grid gap-1.5">
            <button type="button" onClick={connectDeriv} className="min-h-10 rounded-lg border border-shafx-primary/30 bg-shafx-primary/10 px-3 text-xs font-semibold text-shafx-primary hover:border-shafx-primary">
              Connect Deriv
            </button>
            <button type="button" onClick={() => { setOandaOpen((value) => !value); setOandaError(null) }} className="min-h-10 rounded-lg border border-shafx-border bg-shafx-bg px-3 text-xs font-semibold hover:border-shafx-primary">
              Connect OANDA
            </button>
            {oandaOpen && <ProviderCredentialForm
              descriptor={providerCatalog.find((item) => item.id === 'oanda')!}
              busy={oandaBusy}
              error={oandaError}
              onSubmit={(credentials) => void connectOanda(credentials)}
            />}

            <div className="rounded-lg border border-shafx-border px-3 py-2 text-[9px] leading-relaxed text-shafx-textMuted">
              Provider adapters use the same connection/account registry. Each adapter keeps provider-specific authentication and API behavior behind the SHAFX contract.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
