import { describe, expect, it } from 'vitest'
import { prepareTradePlan } from './prepareTradePlan'
import type { SetupCandidate } from '../setup/types'
import type { SymbolSpec } from '../../types'

const setup: SetupCandidate = { direction: 'BUY', status: 'candidate', quality: 'strong', entryPrice: 1.1, stopLoss: 1.099, takeProfit: 1.102, riskRewardRatio: 2, riskDistance: 0.001, rewardDistance: 0.002, confidence: 80, rationale: ['structure'], invalidation: 'below stop', liquidityTarget: null }
const spec: SymbolSpec = { symbol: 'EURUSD', baseCurrency: 'EUR', quoteCurrency: 'USD', pipSize: 0.0001, contractSize: 100000, minLotSize: 0.01, maxLotSize: 100, lotStep: 0.01, pricePrecision: 5 }

describe('prepareTradePlan', () => {
  it('uses the central risk engine for a valid setup', () => {
    const plan = prepareTradePlan({ setup, accountBalance: 1000, accountCurrency: 'USD', riskPercent: 1, symbolSpec: spec })
    expect(plan.isValid).toBe(true)
    expect(plan.lotSize).toBeGreaterThan(0)
    expect(plan.estimatedLoss).toBeLessThanOrEqual(10)
    expect(plan.estimatedReward).toBeGreaterThan(plan.estimatedLoss)
  })
  it('blocks a plan when the risk budget cannot support the minimum lot', () => {
    const plan = prepareTradePlan({ setup, accountBalance: 1, accountCurrency: 'USD', riskPercent: 1, symbolSpec: spec })
    expect(plan.isValid).toBe(false)
    expect(plan.lotSize).toBe(0)
    expect(plan.summary).toMatch(/minimum/i)
  })
})
