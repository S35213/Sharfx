import type { ProviderDescriptor } from '../core/types'

export const OANDA_PROVIDER_DESCRIPTOR: ProviderDescriptor = {
  id: 'oanda',
  name: 'OANDA',
  kind: 'broker',
  status: 'planned',
  executionMode: 'external',
  authMethods: ['api_key'],
  description: 'Planned FX broker adapter. OANDA documents REST trading, account access, historical pricing and streaming prices.',
  capabilities: {
    accountRead: false,
    marketData: false,
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
    demoAccounts: false,
    symbolMetadata: false,
    funding: {
      deposit: 'unsupported',
      withdrawal: 'unsupported',
    },
  },
}
