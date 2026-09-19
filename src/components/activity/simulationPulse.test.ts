import { describe, expect, it } from 'vitest'
import { buildSimulationPulseStats } from './simulationPulse'

describe('buildSimulationPulseStats', () => {
  const open = { id: 'bot-1', symbol: 'EURUSD', type: 'BUY' as const, lotSize: 0.1, entryPrice: 1.08, stopLoss: null, takeProfit: null, riskPercent: 0.25, riskAmount: 2.5, rewardAmount: 5, riskRewardRatio: 2, status: 'open' as const, openTime: '2026-09-19T09:00:00Z' }
  const closed = { ...open, id: 'bot-2', status: 'closed' as const, closeTime: '2026-09-19T09:05:00Z', profit: 4 }

  it('counts bot positions and closed bot trades only', () => {
    expect(buildSimulationPulseStats({ openPositions: [open], tradeHistory: [closed], botOrderIds: ['bot-1', 'bot-2'], botRunning: true })).toEqual({
      botRunning: 1,
      openBotPositions: 1,
      closedBotTrades: 1,
      activeSimulatorSessions: 1,
    })
  })

  it('keeps the session count honest', () => {
    expect(buildSimulationPulseStats({ openPositions: [], tradeHistory: [], botOrderIds: [], botRunning: false }).activeSimulatorSessions).toBe(1)
  })
})
