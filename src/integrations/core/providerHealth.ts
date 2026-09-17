import type { ProviderConnection, ProviderConnectionState } from './types'

export type ProviderHealthStatus = 'healthy' | 'degraded' | 'offline' | 'expired'

export interface ProviderHealthInput {
  connection: ProviderConnection
  nowMs: number
  lastMarketDataAtMs?: number
  maxMarketDataAgeMs?: number
  streamConnected?: boolean
}

export interface ProviderHealthResult {
  status: ProviderHealthStatus
  reasons: string[]
}

const connectionStatus = (state: ProviderConnectionState | undefined): ProviderHealthStatus => {
  if (state === 'expired') return 'expired'
  if (state === 'disconnected') return 'offline'
  return 'healthy'
}

export function assessProviderHealth(input: ProviderHealthInput): ProviderHealthResult {
  const reasons: string[] = []
  const baseStatus = connectionStatus(input.connection.state)

  if (!Number.isFinite(input.nowMs) || input.nowMs < 0) {
    return { status: 'offline', reasons: ['Provider health clock is invalid.'] }
  }

  if (input.connection.expiresAt) {
    const expiryMs = Date.parse(input.connection.expiresAt)
    if (Number.isFinite(expiryMs) && expiryMs <= input.nowMs) {
      return { status: 'expired', reasons: ['Provider connection has expired.'] }
    }
  }

  if (baseStatus === 'expired') return { status: 'expired', reasons: ['Provider connection is expired.'] }
  if (baseStatus === 'offline') return { status: 'offline', reasons: ['Provider connection is disconnected.'] }

  if (input.streamConnected === false) reasons.push('Realtime stream is disconnected.')

  if (input.lastMarketDataAtMs !== undefined && input.maxMarketDataAgeMs !== undefined) {
    if (!Number.isFinite(input.lastMarketDataAtMs) || !Number.isFinite(input.maxMarketDataAgeMs) || input.maxMarketDataAgeMs < 0) {
      reasons.push('Market-data freshness configuration is invalid.')
    } else if (input.lastMarketDataAtMs > input.nowMs) {
      reasons.push('Latest market-data timestamp is in the future.')
    } else if (input.nowMs - input.lastMarketDataAtMs > input.maxMarketDataAgeMs) {
      reasons.push('Market data is stale.')
    }
  }

  return {
    status: reasons.length === 0 ? 'healthy' : 'degraded',
    reasons,
  }
}
