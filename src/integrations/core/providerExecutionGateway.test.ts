import { describe, expect, it } from 'vitest'
import { executeProviderOrder } from './providerExecutionGateway'
import type { ProviderAdapter } from './types'

describe('provider execution boundary', () => {
  it('allows external demo execution through the provider adapter', async () => {
    const adapter = {
      descriptor: { id: 'external', name: 'External', kind: 'broker', status: 'available', executionMode: 'external', authMethods: ['custom'], description: '',
        capabilities: { accountRead: false, marketData: false, historicalCandles: false, realtimeMarketData: false, realtimeAccountData: false, positionsRead: false, ordersRead: false, orderPlacement: true, orderCancellation: false, orderModification: false, orderLookupByClientOrderId: false, positionClose: false, multipleAccounts: false, demoAccounts: true, symbolMetadata: false, funding: { deposit: 'unsupported', withdrawal: 'unsupported' } } },
      placeOrder: async () => ({ providerOrderId: 'demo-1', status: 'filled' }),
    } as ProviderAdapter
    await expect((await import('./providerExecutionGateway')).executeProviderOrder(adapter, { providerId: 'external', connectionId: 'c1', environment: 'demo', connectedAt: new Date().toISOString() }, 'acct', { symbol: 'EUR/USD', side: 'BUY', quantity: 1, quantityUnit: 'base', type: 'MARKET' })).resolves.toMatchObject({ providerOrderId: 'demo-1' })
  })
  it('blocks external live execution at the release gate', async () => {
    const adapter = { descriptor: { id: 'external', name: 'External', kind: 'broker', status: 'available', executionMode: 'external', authMethods: ['custom'], description: '', capabilities: { accountRead: false, marketData: false, historicalCandles: false, realtimeMarketData: false, realtimeAccountData: false, positionsRead: false, ordersRead: false, orderPlacement: true, orderCancellation: false, orderModification: false, orderLookupByClientOrderId: false, positionClose: false, multipleAccounts: false, demoAccounts: true, symbolMetadata: false, funding: { deposit: 'unsupported', withdrawal: 'unsupported' } } }, placeOrder: async () => ({ providerOrderId: 'live-1', status: 'filled' }) } as ProviderAdapter
    await expect((await import('./providerExecutionGateway')).executeProviderOrder(adapter, { providerId: 'external', connectionId: 'c1', environment: 'live', connectedAt: new Date().toISOString() }, 'acct', { symbol: 'EUR/USD', side: 'BUY', quantity: 1, quantityUnit: 'base', type: 'MARKET' })).rejects.toThrow('release gate')
  })
})