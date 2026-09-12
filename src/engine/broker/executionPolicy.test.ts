import { describe, expect, it, vi } from 'vitest'
import type { SimulatedOrderDraft, TradeOrder } from '../../types'
import type { BrokerAdapter } from './types'
import { executeWithPolicy } from './executionPolicy'

const order: SimulatedOrderDraft = {
  symbol: 'EURUSD',
  type: 'BUY',
  lotSize: 0.01,
  entryPrice: 1.1,
  stopLoss: 1.095,
  takeProfit: 1.11,
  riskPercent: 1,
  riskAmount: 5,
  rewardAmount: 10,
  riskRewardRatio: 2,
  status: 'pending',
}

const trade: TradeOrder = {
  id: 'live-1',
  openTime: '2026-09-12T00:00:00.000Z',
  ...order,
}

function broker(overrides: Partial<BrokerAdapter> = {}): BrokerAdapter {
  return {
    getCapabilities: () => ({
      environment: 'LIVE',
      canPlaceOrders: true,
      canCancelOrders: true,
      canClosePositions: true,
      supportsStreamingPrices: false,
    }),
    placeOrder: vi.fn(async () => trade),
    cancelOrder: vi.fn(async () => undefined),
    closePosition: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('executeWithPolicy', () => {
  it('fails closed when live execution is disabled', async () => {
    const live = broker()
    const result = await executeWithPolicy(live, {
      order,
      permission: 'DISABLED',
      approvedByUser: true,
      confirmationId: 'confirm-1',
    })
    expect(result.submitted).toBe(false)
    expect(live.placeOrder).not.toHaveBeenCalled()
  })

  it('requires explicit approval', async () => {
    const live = broker()
    const result = await executeWithPolicy(live, {
      order,
      permission: 'USER_APPROVAL_REQUIRED',
      approvedByUser: false,
      confirmationId: 'confirm-1',
    })
    expect(result.submitted).toBe(false)
    expect(live.placeOrder).not.toHaveBeenCalled()
  })

  it('requires a confirmation id', async () => {
    const live = broker()
    const result = await executeWithPolicy(live, {
      order,
      permission: 'USER_APPROVAL_REQUIRED',
      approvedByUser: true,
    })
    expect(result.submitted).toBe(false)
    expect(live.placeOrder).not.toHaveBeenCalled()
  })

  it('rejects brokers that do not advertise live placement', async () => {
    const live = broker({
      getCapabilities: () => ({
        environment: 'LIVE',
        canPlaceOrders: false,
        canCancelOrders: false,
        canClosePositions: false,
        supportsStreamingPrices: false,
      }),
    })
    const result = await executeWithPolicy(live, {
      order,
      permission: 'USER_APPROVAL_REQUIRED',
      approvedByUser: true,
      confirmationId: 'confirm-1',
    })
    expect(result.submitted).toBe(false)
    expect(live.placeOrder).not.toHaveBeenCalled()
  })

  it('submits only after every gate passes', async () => {
    const live = broker()
    const result = await executeWithPolicy(live, {
      order,
      permission: 'USER_APPROVAL_REQUIRED',
      approvedByUser: true,
      confirmationId: 'confirm-1',
    })
    expect(result.submitted).toBe(true)
    expect(result.order).toEqual(trade)
    expect(live.placeOrder).toHaveBeenCalledWith(order)
  })
})
