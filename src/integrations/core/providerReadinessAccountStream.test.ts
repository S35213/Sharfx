import { describe, expect, it } from 'vitest'
import type { ProviderAdapter, ProviderDescriptor } from './types'
import { assessProviderReadiness } from './providerReadiness'

const descriptor: ProviderDescriptor = {
  id: 'test-account-stream',
  name: 'Test Account Stream Provider',
  kind: 'broker',
  status: 'available',
  executionMode: 'external',
  authMethods: ['api_key'],
  description: 'test',
  capabilities: {
    accountRead: true,
    marketData: true,
    historicalCandles: false,
    realtimeMarketData: false,
    realtimeAccountData: true,
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

describe('realtime provider readiness', () => {
  it('requires subscribeAccount when realtime account data is advertised', () => {
    const adapter: ProviderAdapter = {
      descriptor,
      getAccounts: async () => [],
      getQuote: async () => ({ symbol: 'EURUSD', bid: 1, ask: 1.1, timestamp: new Date().toISOString() }),
    }

    const result = assessProviderReadiness(adapter)

    expect(result.ready).toBe(false)
    expect(result.issues).toContain('MISSING_ADAPTER_METHOD')
    expect(result.missingMethods).toEqual(['subscribeAccount'])
  })

  it('accepts the realtime account capability once subscribeAccount is implemented', () => {
    const adapter: ProviderAdapter = {
      descriptor,
      getAccounts: async () => [],
      getQuote: async () => ({ symbol: 'EURUSD', bid: 1, ask: 1.1, timestamp: new Date().toISOString() }),
      subscribeAccount: async () => ({ streamId: 'test-account-stream', close: async () => {} }),
    }

    const result = assessProviderReadiness(adapter)

    expect(result.ready).toBe(true)
    expect(result.missingMethods).toEqual([])
  })
})
