import type { ProviderDescriptor } from '../core/types'

export const IBKR_PROVIDER_DESCRIPTOR: ProviderDescriptor = {
  id: 'ibkr',
  name: 'Interactive Brokers',
  kind: 'broker',
  status: 'planned',
  executionMode: 'external',
  authMethods: ['custom'],
  description: 'Planned IBKR adapter. The Web API has account, portfolio, trading and execution endpoints, but its session/auth lifecycle is provider-specific.',
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
