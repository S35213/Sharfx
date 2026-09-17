import { describe, expect, it } from 'vitest'
import type { ProviderConnection } from './types'
import { assessProviderHealth } from './providerHealth'

const connection: ProviderConnection = {
  providerId: 'test',
  connectionId: 'connection-1',
  environment: 'demo',
  connectedAt: '2026-09-17T09:00:00.000Z',
  state: 'connected',
}

describe('assessProviderHealth', () => {
  it('accepts a connected provider with fresh data', () => {
    expect(assessProviderHealth({ connection, nowMs: 10_000, lastMarketDataAtMs: 9_500, maxMarketDataAgeMs: 1_000 })).toEqual({ status: 'healthy', reasons: [] })
  })

  it('degrades when market data is stale', () => {
    const result = assessProviderHealth({ connection, nowMs: 10_000, lastMarketDataAtMs: 8_000, maxMarketDataAgeMs: 1_000 })
    expect(result.status).toBe('degraded')
    expect(result.reasons).toContain('Market data is stale.')
  })

  it('fails closed for an expired connection', () => {
    const result = assessProviderHealth({ connection: { ...connection, state: 'expired' }, nowMs: 10_000 })
    expect(result.status).toBe('expired')
  })

  it('detects a future market-data timestamp', () => {
    const result = assessProviderHealth({ connection, nowMs: 10_000, lastMarketDataAtMs: 10_001, maxMarketDataAgeMs: 1_000 })
    expect(result.status).toBe('degraded')
    expect(result.reasons).toContain('Latest market-data timestamp is in the future.')
  })
})
