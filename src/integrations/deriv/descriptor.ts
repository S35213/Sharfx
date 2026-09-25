import type { ProviderDescriptor } from '../core/types'

export const DERIV_PROVIDER_DESCRIPTOR: ProviderDescriptor = {
  id: 'deriv',
  name: 'Deriv',
  kind: 'broker',
  status: 'available',
  executionMode: 'external',
  authMethods: ['oauth2'],
  description: 'Live Deriv market and authenticated account connection for SHAFX. Account selection is demo or real and balances come from Deriv.',
  capabilities: {
    accountRead: true,
    marketData: true,
    historicalCandles: true,
    realtimeMarketData: true,
    realtimeAccountData: true,
    positionsRead: false,
    ordersRead: false,
    orderPlacement: false,
    orderCancellation: false,
    orderModification: false,
    orderLookupByClientOrderId: false,
    positionClose: false,
    multipleAccounts: true,
    demoAccounts: true,
    symbolMetadata: false,
    funding: {
      deposit: 'external',
      withdrawal: 'external',
    },
  },
}
