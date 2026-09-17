import type { ProviderDescriptor } from '../core/types'

export const DERIV_PROVIDER_DESCRIPTOR: ProviderDescriptor = {
  id: 'deriv',
  name: 'Deriv',
  kind: 'broker',
  status: 'available',
  executionMode: 'external',
  authMethods: ['oauth2'],
  description: 'SHAFX market-data and authenticated account-data adapter for Deriv. Real-money execution remains intentionally disabled.',
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
      deposit: 'unsupported',
      withdrawal: 'unsupported',
    },
  },
}
