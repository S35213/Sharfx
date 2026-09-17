import type { ProviderDescriptor } from '../core/types'

export const SIMULATOR_PROVIDER_DESCRIPTOR: ProviderDescriptor = {
  id: 'simulator',
  name: 'SHAFX Simulator',
  kind: 'other',
  status: 'available',
  authMethods: [],
  description: 'Local SHAFX simulation environment. It does not place real-money orders or move customer funds.',
  capabilities: {
    accountRead: true,
    marketData: true,
    historicalCandles: true,
    realtimeMarketData: false,
    realtimeAccountData: false,
    positionsRead: true,
    ordersRead: true,
    orderPlacement: true,
    orderCancellation: true,
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
