import type { ProviderDescriptor } from '../core/types'

export const DERIV_PROVIDER_DESCRIPTOR: ProviderDescriptor = {
  id: 'deriv',
  name: 'Deriv',
  kind: 'broker',
  status: 'available',
  authMethods: ['oauth2', 'pat'],
  description: 'Deriv connection using the SHAFX server-side OAuth flow and current public market/account streams.',
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
    positionClose: false,
    multipleAccounts: true,
    demoAccounts: true,
    symbolMetadata: false,
    funding: {
      deposit: 'redirect',
      withdrawal: 'redirect',
    },
  },
}
