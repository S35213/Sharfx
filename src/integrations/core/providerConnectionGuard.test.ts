import { describe, expect, it } from 'vitest'
import type { ProviderAdapter, ProviderDescriptor } from './types'
import { validateProviderConnection } from './providerConnectionGuard'

const descriptor: ProviderDescriptor = {
  id: 'test',
  name: 'Test',
  kind: 'broker',
  status: 'available',
  executionMode: 'external',
  authMethods: ['api_key'],
  description: 'test',
  capabilities: {
    accountRead: false,
    marketData: false,
    historicalCandles: false,
    realtimeMarketData: false,
    realtimeAccountData: false,
    positionsRead: false,
    ordersRead: false,
    orderPlacement: false,
    orderCancellation: false,
    orderModification: false,
    orderLookupByClientOrderId: false,
    positionClose: false,
    multipleAccounts: false,
    demoAccounts: true,
    symbolMetadata: false,
    funding: { deposit: 'unsupported', withdrawal: 'unsupported' },
  },
}

const adapter: ProviderAdapter = { descriptor }
const baseConnection = {
  providerId: 'test',
  connectionId: 'conn-1',
  environment: 'demo' as const,
  connectedAt: new Date().toISOString(),
}

describe('validateProviderConnection', () => {
  it('accepts a matching active connection', () => {
    expect(validateProviderConnection(adapter, baseConnection).allowed).toBe(true)
  })

  it('rejects connections for another provider', () => {
    expect(validateProviderConnection(adapter, { ...baseConnection, providerId: 'other' }).allowed).toBe(false)
  })

  it('rejects expired or disconnected connections', () => {
    expect(validateProviderConnection(adapter, { ...baseConnection, state: 'expired' }).allowed).toBe(false)
    expect(validateProviderConnection(adapter, { ...baseConnection, state: 'disconnected' }).allowed).toBe(false)
  })

  it('enforces the requested environment', () => {
    expect(validateProviderConnection(adapter, baseConnection, 'demo').allowed).toBe(true)
    expect(validateProviderConnection(adapter, baseConnection, 'live').allowed).toBe(false)
  })
})
