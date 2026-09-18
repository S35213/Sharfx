import { describe, expect, it } from 'vitest'
import { executeProviderOrderFailClosed } from './providerExecutionGateway'
import type { ProviderAdapter } from './types'

describe('provider execution boundary', () => {
  it('blocks external provider execution', async () => {
    const adapter = { descriptor: { id: 'external', name: 'External', kind: 'broker', status: 'available', executionMode: 'external', authMethods: ['custom'], description: '', capabilities: { accountRead: false, marketData: false, historicalCandles: false, realtimeMarketData: false, realtimeAccountData: false, positionsRead: false, ordersRead: false, orderPlacement: true, orderCancellation: false, orderModification: false, orderLookupByClientOrderId: false, positionClose: false, multipleAccounts: false, demoAccounts: true, symbolMetadata: false, funding: { deposit: 'unsupported', withdrawal: 'unsupported' } } } } as ProviderAdapter
    await expect(executeProviderOrderFailClosed(adapter, { providerId: 'external', connectionId: 'c1', environment: 'demo', connectedAt: new Date().toISOString() }, 'acct', { symbol: 'EUR/USD', side: 'BUY', quantity: 1, quantityUnit: 'base', type: 'MARKET' })).rejects.toThrow('disabled')
  })
})