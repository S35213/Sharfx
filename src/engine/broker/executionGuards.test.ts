import { describe, expect, it } from 'vitest'
import type { SimulatedOrderDraft } from '../../types'
import { validateExecutionGuards } from './executionGuards'

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
  profit: undefined,
}

const base = {
  order,
  currentPrice: 1.1001,
  maxPriceAgeSeconds: 5,
  priceTimestamp: 100,
  nowSeconds: 102,
  expectedConfirmationId: 'confirm-1',
  confirmationId: 'confirm-1',
}

describe('validateExecutionGuards', () => {
  it('accepts fresh data with matching confirmation', () => {
    expect(validateExecutionGuards(base).isValid).toBe(true)
  })

  it('rejects stale prices', () => {
    const result = validateExecutionGuards({ ...base, nowSeconds: 106 })
    expect(result.isValid).toBe(false)
    expect(result.reason).toContain('stale')
  })

  it('rejects future timestamps', () => {
    const result = validateExecutionGuards({ ...base, priceTimestamp: 103 })
    expect(result.isValid).toBe(false)
  })

  it('rejects mismatched confirmations', () => {
    const result = validateExecutionGuards({ ...base, confirmationId: 'wrong' })
    expect(result.isValid).toBe(false)
  })

  it('rejects invalid numeric data', () => {
    const result = validateExecutionGuards({ ...base, currentPrice: Number.NaN })
    expect(result.isValid).toBe(false)
  })
})
