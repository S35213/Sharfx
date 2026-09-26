import type { ProviderAdapter, ProviderCapabilities } from './types'

export type ProviderReadinessIssue =
  | 'MISSING_ADAPTER_METHOD'

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

/**
 * Check provider capabilities for the whole adapter by default.
 * A caller can scope the check to the capabilities it actually needs so an
 * unrelated capability (for example funding or account history) cannot prevent
 * a market-data flow from starting.
 */
export const assessProviderReadiness = (
  adapter: ProviderAdapter,
  requiredCapabilities?: Array<keyof ProviderCapabilities>,
): ProviderReadinessResult => {
  const missingMethods: string[] = []
  const scopedCapabilities = requiredCapabilities ? new Set(requiredCapabilities) : null

  for (const [capability, method] of capabilityMethods) {
    if (scopedCapabilities && !scopedCapabilities.has(capability)) continue
    if (adapter.descriptor.capabilities[capability] && typeof adapter[method] !== 'function') {
      missingMethods.push(String(method))
    }
  }

  const checkFunding = scopedCapabilities === null || scopedCapabilities.has('funding')

  // Redirect-based funding is intentionally handled by the application UI/provider URL.
  // Readiness should require adapter funding methods only when SHAFX expects the adapter
  // itself to produce funding instructions (for example API/manual modes).
  if (checkFunding && adapter.descriptor.capabilities.funding.deposit === 'api' && typeof adapter.getDepositInstructions !== 'function') {
    missingMethods.push('getDepositInstructions')
  }
  if (checkFunding && adapter.descriptor.capabilities.funding.withdrawal === 'api' && typeof adapter.getWithdrawalInstructions !== 'function') {
    missingMethods.push('getWithdrawalInstructions')
  }

  const issues: ProviderReadinessIssue[] = missingMethods.length > 0 ? ['MISSING_ADAPTER_METHOD'] : []

  return {
    ready: issues.length === 0,
    issues,
    missingMethods,
  }
}
