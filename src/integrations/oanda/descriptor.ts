import type { ProviderDescriptor } from '../core/types'

export const OANDA_PROVIDER_DESCRIPTOR: ProviderDescriptor = {
  id: 'oanda',
  name: 'OANDA',
  kind: 'broker',
  status: 'available',
  executionMode: 'external',
  authMethods: ['api_key'],
  description: 'OANDA v20 account, market-data, and demo-execution adapter using server-side personal access tokens. Live execution remains behind the SHAFX release gate.',
  credentialFields: [
    { key: 'token', label: 'Personal Access Token', type: 'secret', required: true },
    { key: 'environment', label: 'Environment', type: 'select', required: true, options: [{ value: 'demo', label: 'Practice / Demo' }, { value: 'live', label: 'Live' }] },
  ],
  rateLimit: { requestsPerSecond: 100, scope: 'connection' },
  capabilities: {
    accountRead: true,
    marketData: true,
    historicalCandles: true,
    realtimeMarketData: true,
    realtimeAccountData: true,
    positionsRead: true,
    ordersRead: true,
    orderPlacement: true,
    orderCancellation: true,
    orderModification: false,
    orderLookupByClientOrderId: true,
    positionClose: true,
    multipleAccounts: true,
    demoAccounts: true,
    symbolMetadata: true,
    funding: {
      deposit: 'unsupported',
      withdrawal: 'unsupported',
    },
  },
}
