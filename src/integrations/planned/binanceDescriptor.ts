import type { ProviderDescriptor } from '../core/types'

export const BINANCE_PROVIDER_DESCRIPTOR: ProviderDescriptor = {
  id: 'binance',
  name: 'Binance',
  kind: 'exchange',
  status: 'planned',
  executionMode: 'external',
  authMethods: ['api_key', 'custom'],
  description: 'Planned exchange adapter. Requires a server-side credential vault and endpoint-specific capability checks before activation.',
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
