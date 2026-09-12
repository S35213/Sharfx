import { describe, expect, it, vi } from 'vitest'
import type { BrokerAdapter } from './types'
import { executePositionAction } from './positionPolicy'

function broker(overrides: Partial<BrokerAdapter> = {}): BrokerAdapter {
  return {
    getCapabilities: () => ({
      environment: 'LIVE',
      canPlaceOrders: true,
      canCancelOrders: true,
      canClosePositions: true,
      supportsStreamingPrices: false,
    }),
    placeOrder: vi.fn(async () => { throw new Error('unused') }),
    cancelOrder: vi.fn(async () => undefined),
    closePosition: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('executePositionAction', () => {
  const base = {
    action: 'CLOSE_POSITION' as const,
    orderId: 'live-1',
    permission: 'USER_APPROVAL_REQUIRED' as const,
    approvedByUser: true,
    confirmationId: 'confirm-1',
    expectedConfirmationId: 'confirm-1',
  }

  it('fails closed when actions are disabled', async () => {
    const b = broker()
    const result = await executePositionAction(b, { ...base, permission: 'DISABLED' })
    expect(result.executed).toBe(false)
    expect(b.closePosition).not.toHaveBeenCalled()
  })

  it('requires approval and matching confirmation', async () => {
    const b = broker()
    expect((await executePositionAction(b, { ...base, approvedByUser: false })).executed).toBe(false)
    expect((await executePositionAction(b, { ...base, confirmationId: 'wrong' })).executed).toBe(false)
    expect(b.closePosition).not.toHaveBeenCalled()
  })

  it('closes a live position only when the broker advertises the capability', async () => {
    const b = broker()
    const result = await executePositionAction(b, base)
    expect(result.executed).toBe(true)
    expect(b.closePosition).toHaveBeenCalledWith('live-1')
  })

  it('cancels a live order only when the broker advertises the capability', async () => {
    const b = broker()
    const result = await executePositionAction(b, { ...base, action: 'CANCEL_ORDER' })
    expect(result.executed).toBe(true)
    expect(b.cancelOrder).toHaveBeenCalledWith('live-1')
  })

  it('rejects unsupported broker actions without calling transport', async () => {
    const b = broker({
      getCapabilities: () => ({
        environment: 'LIVE',
        canPlaceOrders: true,
        canCancelOrders: false,
        canClosePositions: false,
        supportsStreamingPrices: false,
      }),
    })
    expect((await executePositionAction(b, { ...base, action: 'CANCEL_ORDER' })).executed).toBe(false)
    expect((await executePositionAction(b, base)).executed).toBe(false)
    expect(b.cancelOrder).not.toHaveBeenCalled()
    expect(b.closePosition).not.toHaveBeenCalled()
  })
})
