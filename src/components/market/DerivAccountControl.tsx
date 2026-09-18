import React, { useCallback, useEffect, useState } from 'react'

type AccountState = 'checking' | 'connected' | 'disconnected' | 'error'

interface ProviderConnectionResponse {
  ok?: boolean
  connections?: Array<{
    providerId?: string
    state?: string
    accounts?: Array<{ active?: boolean }>
  }>
  error?: string
}

export const DerivAccountControl: React.FC = () => {
  const [state, setState] = useState<AccountState>('checking')
  const [message, setMessage] = useState('Checking Deriv connection…')

  const check = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch('/api/providers/connections', { credentials: 'include', cache: 'no-store' })
      const result = (await response.json()) as ProviderConnectionResponse
      const connections = Array.isArray(result.connections)
        ? result.connections.filter((connection) => connection.providerId === 'deriv' && connection.state === 'connected')
        : []
      const accountCount = connections.reduce((sum, connection) => sum + (connection.accounts?.length || 0), 0)
      if (response.ok && connections.length > 0) {
        setState('connected')
        setMessage('Deriv Connected • ' + accountCount + ' account' + (accountCount === 1 ? '' : 's'))
      } else {
        setState('disconnected')
        setMessage('Connect Deriv')
      }
    } catch {
      setState('error')
      setMessage('Deriv unavailable')
    }
  }, [])

  useEffect(() => { void check() }, [check])

  const connect = (): void => { window.location.assign('/api/deriv/login') }

  if (state === 'connected') {
    return <span className="flex min-h-10 items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-medium text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400" />{message}</span>
  }

  return <button type="button" onClick={connect} disabled={state === 'checking'} className="flex min-h-10 items-center gap-2 rounded-lg border border-shafx-border bg-shafx-surface px-3 text-xs font-medium text-shafx-text transition hover:border-shafx-primary disabled:cursor-wait disabled:opacity-60" title={state === 'error' ? 'Deriv connection check failed; try again' : undefined}><span className={'h-2 w-2 rounded-full ' + (state === 'error' ? 'bg-red-400' : 'bg-shafx-textMuted')} />{message}</button>
}
