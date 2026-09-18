import type { ProviderAdapter, ProviderConnection, ProviderOrderRequest, ProviderOrderResult } from './types'

export class ProviderExecutionDisabledError extends Error {
  readonly code = 'EXECUTION_DISABLED'

  constructor(message = 'External provider order execution is disabled in SHAFX.') {
    super(message)
  }
}

export const executeProviderOrderFailClosed = async (
  adapter: ProviderAdapter,
  _connection: ProviderConnection,
  _accountId: string,
  _order: ProviderOrderRequest,
): Promise<ProviderOrderResult> => {
  if (adapter.descriptor.executionMode === 'external') {
    throw new ProviderExecutionDisabledError()
  }
  if (typeof adapter.placeOrder !== 'function' || !adapter.descriptor.capabilities.orderPlacement) {
    throw new ProviderExecutionDisabledError('The provider does not expose an order-placement capability.')
  }
  return adapter.placeOrder(_connection, _accountId, _order)
}