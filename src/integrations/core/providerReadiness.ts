import type { ProviderAdapter, ProviderCapabilities } from './types'

export type ProviderReadinessIssue =
  | 'MISSING_ADAPTER_METHOD'
  | 'LIVE_EXECUTION_DISABLED'

export interface ProviderReadinessResult {
  ready: boolean
  issues: ProviderReadinessIssue[]
  missingMethods: string[]
}

const capabilityMethods: Array<[keyof ProviderCapabilities, keyof ProviderAdapter]> = [
  ['accountRead', 'getAccounts'],
  ['marketData', 'getQuote'],
  ['historicalCandles', 'getHistoricalCandles'],
  ['realtimeMarketData', 'subscribe'],
  ['realtimeAccountData', 'subscribeAccount'],
  ['positionsRead', 'getPositions'],
  ['ordersRead', 'getOrders'],
  ['orderPlacement', 'placeOrder'],
  ['orderCancellation', 'cancelOrder'],
  ['orderModification', 'modifyOrder'],
  ['orderLookupByClientOrderId', 'getOrderByClientOrderId'],
  ['positionClose', 'closePosition'],
  ['symbolMetadata', 'getInstruments'],
]

export const assessProviderReadiness = (adapter: ProviderAdapter): ProviderReadinessResult => {
  const missingMethods: string[] = []

  for (const [capability, method] of capabilityMethods) {
    if (adapter.descriptor.capabilities[capability] && typeof adapter[method] !== 'function') {
      missingMethods.push(String(method))
    }
  }

  if (adapter.descriptor.capabilities.funding.deposit !== 'unsupported' && typeof adapter.getDepositInstructions !== 'function') {
    missingMethods.push('getDepositInstructions')
  }
  if (adapter.descriptor.capabilities.funding.withdrawal !== 'unsupported' && typeof adapter.getWithdrawalInstructions !== 'function') {
    missingMethods.push('getWithdrawalInstructions')
  }

  const issues: ProviderReadinessIssue[] = missingMethods.length > 0 ? ['MISSING_ADAPTER_METHOD'] : []

  // External providers stay blocked from real-money execution until SHAFX has an
  // explicit server-side execution boundary, reconciliation, audit trail, and release gate.
  if (adapter.descriptor.executionMode === 'external' && adapter.descriptor.capabilities.orderPlacement && typeof adapter.placeOrder === 'function') {
    issues.push('LIVE_EXECUTION_DISABLED')
  }

  return {
    ready: issues.length === 0,
    issues,
    missingMethods,
  }
}
