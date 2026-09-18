import { describe, expect, it } from 'vitest'
import type { ProviderAdapter } from './types'
import { getProviderFundingInstructions } from './providerFunding'

const connection = { providerId: 'test', connectionId: 'c1', environment: 'demo' as const, connectedAt: new Date().toISOString() }
const descriptor = {
  id: 'test', name: 'Test', kind: 'broker' as const, status: 'available' as const, executionMode: 'external' as const,
  authMethods: ['custom' as const], description: '',
  capabilities: {
    accountRead: false, marketData: false, historicalCandles: false, realtimeMarketData: false, realtimeAccountData: false,
    positionsRead: false, ordersRead: false, orderPlacement: false, orderCancellation: false, orderModification: false,
    orderLookupByClientOrderId: false, positionClose: false, multipleAccounts: false, demoAccounts: true, symbolMetadata: false,
    funding: { deposit: 'redirect' as const, withdrawal: 'unsupported' as const },
  },
}
describe('providerFunding', () => {
  it('routes supported funding capability through the adapter', async () => {
    const adapter: ProviderAdapter = {
      descriptor,
      getDepositInstructions: async () => ({ mode: 'redirect', providerUrl: 'https://provider.example/deposit' }),
    }
    await expect(getProviderFundingInstructions(adapter, connection, 'acct', 'deposit')).resolves.toMatchObject({ mode: 'redirect' })
  })
  it('fails closed for unsupported funding', async () => {
    const adapter: ProviderAdapter = { descriptor }
    await expect(getProviderFundingInstructions(adapter, connection, 'acct', 'withdrawal')).rejects.toThrow('not supported')
  })
})