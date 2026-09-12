import { describe, expect, it } from 'vitest'
import { monitorPosition } from './monitorPosition'
import type { TradeOrder } from '../../types'

const order: TradeOrder = {
  id: 'sim-1', symbol: 'EURUSD', type: 'BUY', lotSize: 0.01, entryPrice: 1.1,
  stopLoss: 1.095, takeProfit: 1.11, riskPercent: 1, riskAmount: 5,
  rewardAmount: 10, riskRewardRatio: 2, status: 'open', openTime: '2026-01-01T00:00:00Z', profit: 2,
}

const invalidSetup = {
  status: 'invalid' as const,
  direction: 'BUY' as const,
  quality: 'strong' as const,
  entryPrice: 1.1,
  stopLoss: 1.095,
  takeProfit: 1.11,
  riskRewardRatio: 2,
  riskDistance: 0.005,
  rewardDistance: 0.01,
  confidence: 90,
  rationale: ['test'],
  invalidation: 'Setup invalidated below support.',
  liquidityTarget: null,
}

describe('monitorPosition', () => {
  it('marks a normal position healthy', () => expect(monitorPosition(order, 1.103).state).toBe('HEALTHY'))
  it('warns when price approaches the stop', () => expect(monitorPosition(order, 1.0965).state).toBe('APPROACHING_STOP'))
  it('warns when price approaches the target', () => expect(monitorPosition(order, 1.108).state).toBe('APPROACHING_TARGET'))
  it('detects an explicit setup invalidation', () => expect(monitorPosition(order, 1.094, invalidSetup).state).toBe('INVALIDATED'))
  it('reports a closed position without alerting', () => expect(monitorPosition({ ...order, status: 'closed', profit: 7 }, 1.108).shouldAlert).toBe(false))
  it('rejects invalid prices', () => expect(() => monitorPosition(order, Number.NaN)).toThrow())
})
