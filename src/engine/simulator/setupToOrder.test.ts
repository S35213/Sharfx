import { describe, expect, it } from 'vitest'
import type { SetupCandidate } from '../setup/types'
import { setupToSimulatedOrder } from './setupToOrder'

const setup: SetupCandidate = { direction: 'BUY', status: 'candidate', quality: 'strong', entryPrice: 1.1, stopLoss: 1.099, takeProfit: 1.102, riskRewardRatio: 2, riskDistance: 0.001, rewardDistance: 0.002, confidence: 80, rationale: ['Bullish structure'], invalidation: 'Below support', liquidityTarget: null }

describe('setup to simulated order', () => {
  it('maps a valid setup without executing it', () => {
    const draft = setupToSimulatedOrder(setup, 'EURUSD', 0.1, 1, 10)
    expect(draft).toEqual({ symbol: 'EURUSD', type: 'BUY', lotSize: 0.1, entryPrice: 1.1, stopLoss: 1.099, takeProfit: 1.102, riskPercent: 1, riskAmount: 10, rewardAmount: 20, riskRewardRatio: 2 })
  })
  it('rejects invalidated setup candidates', () => {
    expect(() => setupToSimulatedOrder({ ...setup, status: 'invalid' }, 'EURUSD', 0.1, 1, 10)).toThrow('Only valid setup candidates')
  })
})
