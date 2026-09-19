import { describe, expect, it } from 'vitest'
import { buildSimulationFlow } from './simulationFlow'

describe('buildSimulationFlow', () => {
  it('orders opens and closes chronologically', () => {
    const open = { id: 'a', symbol: 'EURUSD', type: 'BUY' as const, lotSize: .1, entryPrice: 1.085, stopLoss: null, takeProfit: null, riskPercent: .25, riskAmount: 2.5, rewardAmount: 5, riskRewardRatio: 2, status: 'open' as const, openTime: '2026-09-19T10:01:00Z' }
    const closed = { ...open, id: 'b', status: 'closed' as const, closeTime: '2026-09-19T10:03:00Z', profit: 4 }
    expect(buildSimulationFlow([open], [closed]).map((item) => item.kind)).toEqual(['OPEN', 'CLOSE'])
  })
})
