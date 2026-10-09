import type { ProviderDescriptor } from '../core/types'

export const CTRADER_PROVIDER_DESCRIPTOR: ProviderDescriptor = {
  id: 'ctrader',
  name: 'Deriv cTrader',
  kind: 'broker',
  status: 'available',
  executionMode: 'external',
  authMethods: ['oauth2'],
  description: 'SHAFX-native CFD execution through Deriv cTrader Open API. Practice execution is the first release gate; live execution remains disabled by the SHAFX release boundary.',
  credentialFields: [],
  rateLimit: { requestsPerSecond: 50, scope: 'connection' },
  capabilities: {
    accountRead: true,
    marketData: true,
    historicalCandles: false,
    realtimeMarketData: true,
    realtimeAccountData: true,
    positionsRead: true,
    ordersRead: true,
    orderPlacement: true,
    orderCancellation: true,
    orderModification: true,
    orderLookupByClientOrderId: true,
    positionClose: true,
    multipleAccounts: true,
    demoAccounts: true,
    symbolMetadata: true,
    funding: {
      deposit: 'redirect',
      withdrawal: 'redirect',
    },
  },
}
