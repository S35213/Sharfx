import { describe, expect, it, vi } from 'vitest'
import type { SimulatedOrderDraft, TradeOrder } from '../../types'
import { LiveBroker } from './liveBroker'

const draft: SimulatedOrderDraft = {
  symbol: 'EURUSD', type: 'BUY', lotSize: 0.01, entryPrice: 1.1, stopLoss: 1.09,
  takeProfit: 1.12, riskPercent: 1, riskAmount: 10, rewardAmount: 20,
  riskRewardRatio: 2, status: 'open',
}

const trade: TradeOrder = { ...draft, id: 'live-1', openTime: '2026-01-01T00:00:00.000Z' }

describe('LiveBroker', () => {
  it('fails closed when no live transport is configured', async () => {
    const broker = new LiveBroker()
    expect(broker.getCapabilities()).toMatchObject({ environment: 'LIVE', canPlaceOrders: false, canCancelOrders: false, canClosePositions: false })
    await expect(broker.placeOrder(draft)).rejects.toThrow('Live broker execution is not configured')
  })

  it('delegates only when an explicit transport is supplied', async () => {
    const transport = {
      placeOrder: vi.fn(async () => trade),
      cancelOrder: vi.fn(async () => undefined),
      closePosition: vi.fn(async () => undefined),
    }
    const broker = new LiveBroker(transport)
    expect(broker.getCapabilities()).toMatchObject({ environment: 'LIVE', canPlaceOrders: true })
    await expect(broker.placeOrder(draft)).resolves.toEqual(trade)
    await broker.cancelOrder('live-1')
    await broker.closePosition('live-1')
    expect(transport.placeOrder).toHaveBeenCalledWith(draft)
    expect(transport.cancelOrder).toHaveBeenCalledWith('live-1')
    expect(transport.closePosition).toHaveBeenCalledWith('live-1')
  })

  it('rejects blank order ids before reaching transport', async () => {
    const transport = { placeOrder: vi.fn(), cancelOrder: vi.fn(), closePosition: vi.fn() }
    const broker = new LiveBroker(transport)
    await expect(broker.cancelOrder('   ')).rejects.toThrow('Order id is required')
    await expect(broker.closePosition('')).rejects.toThrow('Order id is required')
    expect(transport.cancelOrder).not.toHaveBeenCalled()
    expect(transport.closePosition).not.toHaveBeenCalled()
  })
})
