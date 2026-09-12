import type { BrokerAdapter } from './types'

export type PositionAction = 'CANCEL_ORDER' | 'CLOSE_POSITION'
export type PositionPermission = 'DISABLED' | 'USER_APPROVAL_REQUIRED'

export interface PositionActionRequest {
  action: PositionAction
  orderId: string
  permission: PositionPermission
  approvedByUser: boolean
  confirmationId?: string
  expectedConfirmationId?: string
}

export interface PositionActionResult {
  executed: boolean
  reason: string
}

export async function executePositionAction(
  broker: BrokerAdapter,
  request: PositionActionRequest,
): Promise<PositionActionResult> {
  if (!request.orderId.trim()) {
    return { executed: false, reason: 'An order id is required.' }
  }
  if (request.permission === 'DISABLED') {
    return { executed: false, reason: 'Live position actions are disabled.' }
  }
  if (!request.approvedByUser) {
    return { executed: false, reason: 'Explicit user approval is required before this action.' }
  }
  if (!request.confirmationId?.trim() || !request.expectedConfirmationId?.trim()) {
    return { executed: false, reason: 'A confirmation id is required for an approved action.' }
  }
  if (request.confirmationId.trim() !== request.expectedConfirmationId.trim()) {
    return { executed: false, reason: 'The action confirmation does not match the approved request.' }
  }

  const capabilities = broker.getCapabilities()
  if (capabilities.environment !== 'LIVE') {
    return { executed: false, reason: 'The selected broker is not a live broker.' }
  }

  if (request.action === 'CANCEL_ORDER') {
    if (!capabilities.canCancelOrders) {
      return { executed: false, reason: 'The selected broker cannot cancel live orders.' }
    }
    await broker.cancelOrder(request.orderId)
    return { executed: true, reason: 'Live order cancellation submitted through the configured broker.' }
  }

  if (!capabilities.canClosePositions) {
    return { executed: false, reason: 'The selected broker cannot close live positions.' }
  }
  await broker.closePosition(request.orderId)
  return { executed: true, reason: 'Live position close submitted through the configured broker.' }
}
