import { describe, expect, it } from 'vitest'
import type { ProviderAdapter, ProviderDescriptor } from './types'
import { assessProviderReadiness } from './providerReadiness'

const descriptor: ProviderDescriptor = {
  id: 'test',
  name: 'Test Provider',
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

describe('assessProviderReadiness', () => {
  it('rejects descriptors that advertise capabilities without adapter methods', () => {
    const adapter: ProviderAdapter = { descriptor }

    const result = assessProviderReadiness(adapter)

    expect(result.ready).toBe(false)
    expect(result.issues).toContain('MISSING_ADAPTER_METHOD')
    expect(result.missingMethods).toEqual(['getAccounts', 'getQuote'])
  })

  it('requires a realtime account adapter method when the capability is advertised', () => {
    const accountDescriptor: ProviderDescriptor = {
      ...descriptor,
      capabilities: { ...descriptor.capabilities, realtimeAccountData: true },
    }
    const adapter: ProviderAdapter = {
      descriptor: accountDescriptor,
      getAccounts: async () => [],
      getQuote: async () => ({ symbol: 'EURUSD', bid: 1, ask: 1.1, timestamp: new Date().toISOString() }),
    }

    const result = assessProviderReadiness(adapter)

    expect(result.ready).toBe(false)
    expect(result.missingMethods).toEqual(['subscribeAccount'])
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

  it('keeps external live execution disabled even when an adapter implements placement', () => {
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

  it('allows the simulator execution mode to remain a local simulation', () => {
    const simulatorDescriptor: ProviderDescriptor = {
      ...descriptor,
      id: 'simulator',
      executionMode: 'simulated',
      kind: 'other',
      capabilities: { ...descriptor.capabilities, orderPlacement: true },
    }
    const adapter: ProviderAdapter = {
      descriptor: simulatorDescriptor,
      getAccounts: async () => [],
      getQuote: async () => ({ symbol: 'EURUSD', bid: 1, ask: 1.1, timestamp: new Date().toISOString() }),
      placeOrder: async () => ({ providerOrderId: 'sim-1', status: 'filled' }),
    }

    const result = assessProviderReadiness(adapter)

    expect(result.ready).toBe(true)
    expect(result.issues).not.toContain('LIVE_EXECUTION_DISABLED')
  })
})
