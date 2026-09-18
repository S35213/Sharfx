import type { ProviderConnectionRecord } from './providerConnections'

export type ProviderConnectionHealth = 'healthy' | 'degraded' | 'expired' | 'offline'

export interface ProviderConnectionHealthResult {
  status: ProviderConnectionHealth
  reasons: string[]
}

export function assessProviderConnectionRecord(
  connection: ProviderConnectionRecord,
  nowMs = Date.now(),
  staleAfterMs = 5 * 60_000,
): ProviderConnectionHealthResult {
  if (connection.state === 'disconnected') return { status: 'offline', reasons: ['Connection is disconnected.'] }

  if (connection.expiresAt) {
    const expiresAt = Date.parse(connection.expiresAt)
    if (Number.isFinite(expiresAt) && expiresAt <= nowMs) {
      return { status: 'expired', reasons: ['Connection credentials have expired.'] }
    }
  }

  const lastSeen = Date.parse(connection.lastSeenAt)
  if (Number.isFinite(lastSeen) && nowMs - lastSeen > staleAfterMs) {
    return { status: 'degraded', reasons: ['Connection heartbeat is stale.'] }
  }

  if (connection.state === ('error' as ProviderConnectionRecord['state'])) {
    return { status: 'degraded', reasons: ['Provider reported an error state.'] }
  }

  return { status: 'healthy', reasons: [] }
}
