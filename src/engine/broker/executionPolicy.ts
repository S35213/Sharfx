import type { SimulatedOrderDraft, TradeOrder } from '../../types'
import type { BrokerAdapter } from './types'

export type BrokerExecutionPermission = 'DISABLED' | 'USER_APPROVAL_REQUIRED'

export interface ExecutionRequest {
  order: SimulatedOrderDraft
  permission: BrokerExecutionPermission
  approvedByUser: boolean
  confirmationId?: string
}

export interface ExecutionResult {
  submitted: boolean
  order?: TradeOrder
  reason: string
}

export async function executeWithPolicy(
  broker: BrokerAdapter,
  request: ExecutionRequest,
): Promise<ExecutionResult> {
  if (request.permission === 'DISABLED') {
    return { submitted: false, reason: 'Live execution is disabled.' }
  }

  if (!request.approvedByUser) {
    return { submitted: false, reason: 'Explicit user approval is required before execution.' }
  }

  if (!request.confirmationId?.trim()) {
    return { submitted: false, reason: 'A confirmation id is required for an approved execution.' }
  }

  const capabilities = broker.getCapabilities()
  if (capabilities.environment !== 'LIVE' || !capabilities.canPlaceOrders) {
    return { submitted: false, reason: 'The selected broker cannot place live orders.' }
  }

  const order = await broker.placeOrder(request.order)
  return { submitted: true, order, reason: 'Order submitted through the configured live broker.' }
}
