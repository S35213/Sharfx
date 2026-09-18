export interface ProviderConnectionAccount {
  id: string
  providerAccountId: string
  label: string
  environment: 'demo' | 'live'
  currency: string | null
  balance: number | null
  equity: number | null
  usedMargin: number | null
  freeMargin: number | null
  floatingPL: number | null
  active: boolean
  lastSyncedAt: string | null
  metadata: Record<string, unknown>
}

export interface ProviderConnectionRecord {
  id: string
  providerId: string
  label: string
  environment: 'demo' | 'live' | 'mixed'
  state: 'connected' | 'expired' | 'disconnected' | 'error'
  authMethod: 'oauth2' | 'api_key' | 'pat' | 'custom'
  expiresAt: string | null
  lastSeenAt: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  accounts: ProviderConnectionAccount[]
}

export interface ActiveProviderSelection {
  providerId: string
  connectionId: string
  /** Provider-native account identifier, not the Supabase row UUID. */
  accountId: string | undefined
  environment: 'demo' | 'live'
}

const CONNECTION_SELECTION_EVENT = 'shafx-provider-selection-changed'
const SELECTION_KEY = 'shafx-active-provider-selection'

const isBrowser = (): boolean => typeof window !== 'undefined'

export async function getProviderConnections(): Promise<ProviderConnectionRecord[]> {
  if (!isBrowser()) return []
  const response = await fetch('/api/providers/connections', {
    credentials: 'include',
    cache: 'no-store',
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data?.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'Unable to load provider connections.')
  }
  return Array.isArray(data.connections) ? data.connections as ProviderConnectionRecord[] : []
}

export function getStoredProviderSelection(): ActiveProviderSelection | null {
  if (!isBrowser()) return null
  try {
    const raw = window.sessionStorage.getItem(SELECTION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ActiveProviderSelection>
    if (
      typeof parsed.providerId !== 'string' ||
      typeof parsed.connectionId !== 'string' ||
      (parsed.environment !== 'demo' && parsed.environment !== 'live')
    ) return null
    return {
      providerId: parsed.providerId,
      connectionId: parsed.connectionId,
      accountId: typeof parsed.accountId === 'string' && parsed.accountId ? parsed.accountId : undefined,
      environment: parsed.environment,
    }
  } catch {
    return null
  }
}

export function setStoredProviderSelection(selection: ActiveProviderSelection): void {
  if (!isBrowser()) return
  window.sessionStorage.setItem(SELECTION_KEY, JSON.stringify(selection))
  window.dispatchEvent(new CustomEvent(CONNECTION_SELECTION_EVENT, { detail: selection }))
}

export function clearStoredProviderSelection(): void {
  if (!isBrowser()) return
  window.sessionStorage.removeItem(SELECTION_KEY)
  window.dispatchEvent(new Event(CONNECTION_SELECTION_EVENT))
}

export function subscribeToProviderSelection(callback: () => void): () => void {
  if (!isBrowser()) return () => undefined
  const handler = () => callback()
  window.addEventListener(CONNECTION_SELECTION_EVENT, handler)
  return () => window.removeEventListener(CONNECTION_SELECTION_EVENT, handler)
}

export function chooseDefaultProviderSelection(connections: ProviderConnectionRecord[]): ActiveProviderSelection | null {
  const stored = getStoredProviderSelection()
  const matches = connections.find((connection) =>
    connection.id === stored?.connectionId &&
    connection.providerId === stored.providerId &&
    connection.state === 'connected',
  )
  if (matches) {
    const account = stored?.accountId
      ? matches.accounts.find((item) => item.providerAccountId === stored.accountId && item.active)
      : matches.accounts.find((item) => item.active)
    if (account) {
      return {
        providerId: matches.providerId,
        connectionId: matches.id,
        accountId: account.id,
        environment: account.environment,
      }
    }
  }

  for (const connection of connections) {
    if (connection.state !== 'connected') continue
    const account = connection.accounts.find((item) => item.active)
    if (!account) continue
    return {
      providerId: connection.providerId,
      connectionId: connection.id,
      accountId: account.id,
      environment: account.environment,
    }
  }
  return null
}
