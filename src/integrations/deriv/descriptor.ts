import type { ProviderDescriptor } from '../core/types'

export const DERIV_PROVIDER_DESCRIPTOR: ProviderDescriptor = {
  id: 'deriv',
  name: 'Deriv',
  kind: 'broker',
  status: 'available',
  executionMode: 'external',
  authMethods: ['oauth2', 'pat'],
  description: 'SHAFX market-data adapter for Deriv public WebSocket data. Account authentication exists separately; real-money execution is intentionally disabled.',
  capabilities: {
    accountRead: false,
    marketData: true,
    historicalCandles: true,
    realtimeMarketData: true,
    realtimeAccountData: false,
    positionsRead: false,
    ordersRead: false,
    orderPlacement: false,
    orderCancellation: false,
    orderModification: false,
    orderLookupByClientOrderId: false,
    positionClose: false,
    multipleAccounts: false,
    demoAccounts: false,
    symbolMetadata: false,
    funding: {
      deposit: 'unsupported',
      withdrawal: 'unsupported',
    },
  },
}
