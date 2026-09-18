import type { ProviderConnectionRecord } from '../../data/provider/providerConnections'
import { assessProviderConnectionRecord } from '../../data/provider/providerConnectionHealth'

export interface ProviderHealthAlert {
  connectionId: string
  providerId: string
  severity: 'warning' | 'critical'
  status: 'degraded' | 'expired' | 'offline'
  message: string
}

export function collectProviderHealthAlerts(connections: ProviderConnectionRecord[], nowMs = Date.now()): ProviderHealthAlert[] {
  return connections.flatMap((connection) => {
    const result = assessProviderConnectionRecord(connection, nowMs)
    if (result.status === 'healthy') return []
    const severity = result.status === 'expired' || result.status === 'offline' ? 'critical' : 'warning'
    return [{
      connectionId: connection.id,
      providerId: connection.providerId,
      severity,
      status: result.status,
      message: result.reasons.join(' ') || 'Provider connection requires attention.',
    }]
  })
}
