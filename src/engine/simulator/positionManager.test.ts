import { describe, expect, it } from 'vitest'
import { calculatePositionProfit, closeSimulatedPosition, markSimulatedPosition } from './positionManager'
import type { SymbolSpec, TradeOrder } from '../../types'

const spec: SymbolSpec = { symbol: 'EURUSD', baseCurrency: 'EUR', quoteCurrency: 'USD', pipSize: 0.0001, contractSize: 100000, minLotSize: 0.01, maxLotSize: 100, lotStep: 0.01, pricePrecision: 5 }
const order: TradeOrder = { id: 'SIM-1', symbol: 'EURUSD', type: 'BUY', lotSize: 0.1, entryPrice: 1.10000, stopLoss: 1.09900, takeProfit: 1.10200, riskPercent: 1, riskAmount: 10, rewardAmount: 20, riskRewardRatio: 2, status: 'open', openTime: '2026-01-01T00:00:00.000Z' }

describe('position manager', () => {
  it('calculates directional profit', () => {
    expect(calculatePositionProfit(order, 1.101, spec)).toBe(10)
    expect(calculatePositionProfit({ ...order, type: 'SELL' }, 1.099, spec)).toBe(10)
  })

  it('marks an open position with floating profit', () => {
    const marked = markSimulatedPosition(order, { currentPrice: 1.1005, symbolSpec: spec })
    expect(marked.status).toBe('open')
    expect(marked.profit).toBe(5)
  })

  it('closes automatically at stop or target', () => {
    const stopped = markSimulatedPosition(order, { currentPrice: 1.098, symbolSpec: spec })
    expect(stopped.status).toBe('closed')
    expect(stopped.profit).toBe(-10)
    const targeted = markSimulatedPosition(order, { currentPrice: 1.103, symbolSpec: spec })
    expect(targeted.status).toBe('closed')
    expect(targeted.profit).toBe(20)
  })

  it('supports explicit manual close', () => {
    const closed = closeSimulatedPosition(order, { exitPrice: 1.1007, closeTime: '2026-01-01T01:00:00.000Z' }, spec)
    expect(closed.status).toBe('closed')
    expect(closed.closeTime).toBe('2026-01-01T01:00:00.000Z')
    expect(closed.profit).toBe(7)
  })
})
