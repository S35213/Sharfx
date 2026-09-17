import { describe, expect, it } from 'vitest'
import type { ProviderAdapter, ProviderDescriptor } from './types'
import { assessProviderReadiness } from './providerReadiness'

const descriptor: ProviderDescriptor = {
  id: 'test',
  name: 'Test Provider',
  kind: 'broker',
  status: 'available',
  authMethods: ['api_key'],
  description: 'test',
  capabilities: {
    accountRead: true,
    marketData: true,
    historicalCandles: false,
    realtimeMarketData: false,
    realtimeAccountData: false,
    positionsRead: false,
    ordersRead: false,
    orderPlacement: false,
    orderCancellation: false,
    positionClose: false,
    multipleAccounts: false,
    demoAccounts: true,
    symbolMetadata: false,
    funding: { deposit: 'unsupported', withdrawal: 'unsupported' },
  },
}

describe('assessProviderReadiness', () => {
  it('rejects descriptors that advertise capabilities without adapter methods', () => {
    const adapter: ProviderAdapter = { descriptor }

    const result = assessProviderReadiness(adapter)

    expect(result.ready).toBe(false)
    expect(result.issues).toContain('MISSING_ADAPTER_METHOD')
    expect(result.missingMethods).toEqual(['getAccounts', 'getQuote'])
  })

  it('accepts a capability-complete adapter without execution capabilities', () => {
    const adapter: ProviderAdapter = {
      descriptor,
      getAccounts: async () => [],
      getQuote: async () => ({ symbol: 'EURUSD', bid: 1, ask: 1.1, timestamp: new Date().toISOString() }),
    }

    const result = assessProviderReadiness(adapter)

    expect(result.ready).toBe(true)
    expect(result.missingMethods).toEqual([])
  })

  it('keeps live execution disabled even when a future adapter implements placement', () => {
    const executionDescriptor: ProviderDescriptor = {
      ...descriptor,
      capabilities: { ...descriptor.capabilities, orderPlacement: true },
    }
    const adapter: ProviderAdapter = {
      descriptor: executionDescriptor,
      getAccounts: async () => [],
      getQuote: async () => ({ symbol: 'EURUSD', bid: 1, ask: 1.1, timestamp: new Date().toISOString() }),
      placeOrder: async () => ({ providerOrderId: '1', status: 'accepted' }),
    }

    const result = assessProviderReadiness(adapter)

    expect(result.ready).toBe(false)
    expect(result.issues).toContain('LIVE_EXECUTION_DISABLED')
  })
})
