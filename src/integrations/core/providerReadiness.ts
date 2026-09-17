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
  ['positionsRead', 'getPositions'],
  ['ordersRead', 'getOrders'],
  ['orderPlacement', 'placeOrder'],
  ['orderCancellation', 'cancelOrder'],
  ['positionClose', 'closePosition'],
  ['symbolMetadata', 'getInstruments'],
  ['funding', 'getDepositInstructions'],
]

export const assessProviderReadiness = (adapter: ProviderAdapter): ProviderReadinessResult => {
  const missingMethods: string[] = []

  for (const [capability, method] of capabilityMethods) {
    if (capability === 'funding') {
      if (adapter.descriptor.capabilities.funding.deposit !== 'unsupported' && typeof adapter.getDepositInstructions !== 'function') {
        missingMethods.push('getDepositInstructions')
      }
      if (adapter.descriptor.capabilities.funding.withdrawal !== 'unsupported' && typeof adapter.getWithdrawalInstructions !== 'function') {
        missingMethods.push('getWithdrawalInstructions')
      }
      continue
    }

    if (adapter.descriptor.capabilities[capability] && typeof adapter[method] !== 'function') {
      missingMethods.push(String(method))
    }
  }

  const issues: ProviderReadinessIssue[] = missingMethods.length > 0 ? ['MISSING_ADAPTER_METHOD'] : []

  // The architecture deliberately keeps live execution disabled until the runtime
  // has an explicit execution boundary. A provider descriptor alone must never turn
  // on real-money trading.
  if (adapter.descriptor.capabilities.orderPlacement && typeof adapter.placeOrder === 'function') {
    issues.push('LIVE_EXECUTION_DISABLED')
  }

  return {
    ready: issues.length === 0,
    issues,
    missingMethods,
  }
}
