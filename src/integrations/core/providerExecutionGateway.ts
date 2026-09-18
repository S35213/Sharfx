import type { ProviderAdapter, ProviderConnection, ProviderOrderRequest, ProviderOrderResult } from './types'

export class ProviderExecutionDisabledError extends Error {
  readonly code = 'EXECUTION_DISABLED'

  constructor(message = 'External provider order execution is disabled in SHAFX.') {
    super(message)
  }
}

export const executeProviderOrder = async (
  adapter: ProviderAdapter,
  connection: ProviderConnection,
  accountId: string,
  order: ProviderOrderRequest,
): Promise<ProviderOrderResult> => {
  if (adapter.descriptor.executionMode === 'external' && connection.environment !== 'demo') {
    throw new ProviderExecutionDisabledError('Live external-provider execution is still disabled by the SHAFX release gate.')
  }
  if (typeof adapter.placeOrder !== 'function' || !adapter.descriptor.capabilities.orderPlacement) {
    throw new ProviderExecutionDisabledError('The provider does not expose an order-placement capability.')
  }
  return adapter.placeOrder(connection, accountId, order)
}

export const executeProviderOrderFailClosed = async (
  adapter: ProviderAdapter,
  connection: ProviderConnection,
  accountId: string,
  order: ProviderOrderRequest,
): Promise<ProviderOrderResult> => {
  if (adapter.descriptor.executionMode === 'external') throw new ProviderExecutionDisabledError()
  return executeProviderOrder(adapter, connection, accountId, order)
}