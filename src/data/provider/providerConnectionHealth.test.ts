import { describe, expect, it } from 'vitest'
import { assessProviderConnectionRecord } from './providerConnectionHealth'
import type { ProviderConnectionRecord } from './providerConnections'

const base: ProviderConnectionRecord = {
  id: 'c1',
  providerId: 'oanda',
  label: 'OANDA Demo',
  environment: 'demo',
  state: 'connected',
  authMethod: 'api_key',
  expiresAt: null,
  lastSeenAt: '2026-09-18T09:00:00.000Z',
  metadata: {},
  createdAt: '2026-09-18T08:00:00.000Z',
  updatedAt: '2026-09-18T09:00:00.000Z',
  accounts: [],
}

describe('assessProviderConnectionRecord', () => {
  it('reports healthy for a connected fresh record', () => {
    expect(assessProviderConnectionRecord(base, Date.parse('2026-09-18T09:01:00.000Z')).status).toBe('healthy')
  })

  it('reports degraded when the heartbeat is stale', () => {
    expect(assessProviderConnectionRecord(base, Date.parse('2026-09-18T10:00:00.000Z')).status).toBe('degraded')
  })

  it('reports expired when the credential expiry is in the past', () => {
    expect(assessProviderConnectionRecord({ ...base, expiresAt: '2026-09-18T08:59:00.000Z' }, Date.parse('2026-09-18T09:00:00.000Z')).status).toBe('expired')
  })

  it('reports offline when disconnected', () => {
    expect(assessProviderConnectionRecord({ ...base, state: 'disconnected' }, Date.now()).status).toBe('offline')
  })
})
