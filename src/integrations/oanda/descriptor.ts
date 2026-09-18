import type { ProviderDescriptor } from '../core/types'

export const OANDA_PROVIDER_DESCRIPTOR: ProviderDescriptor = {
  id: 'oanda',
  name: 'OANDA',
  kind: 'broker',
  status: 'available',
  executionMode: 'external',
  authMethods: ['api_key'],
  description: 'OANDA v20 account and market-data adapter using server-side personal access tokens. Real-money execution remains intentionally disabled.',
  rateLimit: { requestsPerSecond: 100, scope: 'connection' },
  capabilities: {
    accountRead: true,
    marketData: true,
    historicalCandles: true,
    realtimeMarketData: true,
    realtimeAccountData: true,
    positionsRead: true,
    ordersRead: true,
    orderPlacement: false,
    orderCancellation: false,
    orderModification: false,
    orderLookupByClientOrderId: false,
    positionClose: false,
    multipleAccounts: true,
    demoAccounts: true,
    symbolMetadata: true,
    funding: {
      deposit: 'unsupported',
      withdrawal: 'unsupported',
    },
  },
}
