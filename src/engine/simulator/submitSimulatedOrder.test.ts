import { describe, expect, it } from 'vitest'
import { submitSimulatedOrder } from './submitSimulatedOrder'

const draft = { symbol: 'EUR/USD', type: 'BUY' as const, lotSize: 0.1, entryPrice: 1.085, stopLoss: 1.082, takeProfit: 1.09, riskPercent: 1, riskAmount: 100, rewardAmount: 166.67, riskRewardRatio: 1.67 }

describe('submitSimulatedOrder', () => {
  it('creates a simulated open order without external I/O', () => { const order = submitSimulatedOrder(draft); expect(order.id).toMatch(/^SIM-/); expect(order.status).toBe('open'); expect(order.symbol).toBe('EUR/USD') })
  it('rejects invalid BUY levels', () => { expect(() => submitSimulatedOrder({ ...draft, stopLoss: 1.086 })).toThrow('Buy SL must be below entry') })
  it('rejects invalid SELL levels', () => { expect(() => submitSimulatedOrder({ ...draft, type: 'SELL', stopLoss: 1.084, takeProfit: 1.09 })).toThrow('Sell SL must be above entry') })
})
