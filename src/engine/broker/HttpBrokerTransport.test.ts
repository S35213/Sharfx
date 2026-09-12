import { describe, expect, it, vi } from 'vitest'
import type { SimulatedOrderDraft, TradeOrder } from '../../types'
import { HttpBrokerTransport } from './HttpBrokerTransport'

const order: SimulatedOrderDraft = {
  symbol: 'EURUSD', type: 'BUY', lotSize: 0.01, entryPrice: 1.1, stopLoss: 1.09,
  takeProfit: 1.12, riskPercent: 1, riskAmount: 10, rewardAmount: 20, riskRewardRatio: 2,
}

const trade: TradeOrder = { ...order, id: 'live-1', status: 'open', openTime: '2026-09-12T00:00:00.000Z' }

const response = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body })

describe('HttpBrokerTransport', () => {
  it('uses POST for order placement and includes browser credentials', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(trade))
    const transport = new HttpBrokerTransport({ baseUrl: 'https://gateway.example.test/', fetchImpl })
    await expect(transport.placeOrder(order)).resolves.toEqual(trade)
    expect(fetchImpl).toHaveBeenCalledWith('https://gateway.example.test/orders', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify(order),
    }))
  })

  it('uses DELETE and POST for order and position actions', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ ok: true }))
    const transport = new HttpBrokerTransport({ baseUrl: 'https://gateway.example.test', fetchImpl })
    await transport.cancelOrder('order/1')
    await transport.closePosition('position/2')
    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'https://gateway.example.test/orders/order%2F1', expect.objectContaining({ method: 'DELETE' }))
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'https://gateway.example.test/positions/position%2F2/close', expect.objectContaining({ method: 'POST' }))
  })

  it('rejects non-success gateway responses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ error: 'unauthorized' }, false, 401))
    const transport = new HttpBrokerTransport({ baseUrl: 'https://gateway.example.test', fetchImpl })
    await expect(transport.placeOrder(order)).rejects.toThrow('Broker gateway request failed (401).')
  })

  it('fails closed for invalid gateway configuration and blank ids', async () => {
    expect(() => new HttpBrokerTransport({ baseUrl: 'javascript:alert(1)' })).toThrow('Broker gateway base URL must use HTTP or HTTPS.')
    const fetchImpl = vi.fn()
    const transport = new HttpBrokerTransport({ baseUrl: 'https://gateway.example.test', fetchImpl })
    await expect(transport.cancelOrder(' ')).rejects.toThrow('Order id is required')
    await expect(transport.closePosition('')).rejects.toThrow('Order id is required')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
