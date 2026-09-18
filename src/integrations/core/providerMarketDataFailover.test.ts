import { describe, expect, it } from 'vitest'
import type { ProviderAdapter } from './types'
import { getQuoteWithFailover } from './providerMarketDataFailover'

const connection = (providerId: string, connectionId: string) => ({
  providerId,
  connectionId,
  environment: 'demo' as const,
  state: 'connected' as const,
  connectedAt: '2026-09-18T09:00:00.000Z',
})

describe('getQuoteWithFailover', () => {
  it('uses the first healthy provider', async () => {
    const first: ProviderAdapter = {
      descriptor: { id: 'first', name: 'First', kind: 'broker', status: 'available', executionMode: 'external', authMethods: ['custom'], description: '', capabilities: { accountRead: false, marketData: true, historicalCandles: false, realtimeMarketData: false, realtimeAccountData: false, positionsRead: false, ordersRead: false, orderPlacement: false, orderCancellation: false, orderModification: false, orderLookupByClientOrderId: false, positionClose: false, multipleAccounts: false, demoAccounts: true, symbolMetadata: false, funding: { deposit: 'unsupported', withdrawal: 'unsupported' } } },
      getAccounts: async () => [],
      getQuote: async () => ({ symbol: 'EUR/USD', bid: 1, ask: 1.1, timestamp: new Date().toISOString() }),
    }
    const result = await getQuoteWithFailover([{ adapter: first, connection: connection('first', 'c1') }], 'EUR/USD')
    expect(result.providerId).toBe('first')
    expect(result.attemptedProviderIds).toEqual(['first'])
  })

  it('falls back after a provider failure', async () => {
    const failing: ProviderAdapter = {
      descriptor: { id: 'first', name: 'First', kind: 'broker', status: 'available', executionMode: 'external', authMethods: ['custom'], description: '', capabilities: { accountRead: false, marketData: true, historicalCandles: false, realtimeMarketData: false, realtimeAccountData: false, positionsRead: false, ordersRead: false, orderPlacement: false, orderCancellation: false, orderModification: false, orderLookupByClientOrderId: false, positionClose: false, multipleAccounts: false, demoAccounts: true, symbolMetadata: false, funding: { deposit: 'unsupported', withdrawal: 'unsupported' } } },
      getAccounts: async () => [],
      getQuote: async () => { throw new Error('upstream down') },
    }
    const healthy: ProviderAdapter = {
      ...failing,
      descriptor: { ...failing.descriptor, id: 'second', name: 'Second' },
      getQuote: async () => ({ symbol: 'EUR/USD', bid: 1.2, ask: 1.3, timestamp: new Date().toISOString() }),
    }
    const result = await getQuoteWithFailover([
      { adapter: failing, connection: connection('first', 'c1') },
      { adapter: healthy, connection: connection('second', 'c2') },
    ], 'EUR/USD')
    expect(result.providerId).toBe('second')
    expect(result.attemptedProviderIds).toEqual(['first', 'second'])
    expect(result.quote.bid).toBe(1.2)
  })
})
