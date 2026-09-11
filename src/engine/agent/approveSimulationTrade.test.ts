import { describe, expect, it } from 'vitest'
import { approveSimulationTrade } from './approveSimulationTrade'
import { prepareTradePlan } from './prepareTradePlan'
import type { SetupCandidate } from '../setup/types'
import type { SymbolSpec } from '../../types'

const setup: SetupCandidate = { direction: 'BUY', status: 'candidate', quality: 'strong', entryPrice: 1.1, stopLoss: 1.099, takeProfit: 1.102, riskRewardRatio: 2, riskDistance: 0.001, rewardDistance: 0.002, confidence: 80, rationale: ['structure'], invalidation: 'below stop', liquidityTarget: null }
const spec: SymbolSpec = { symbol: 'EURUSD', baseCurrency: 'EUR', quoteCurrency: 'USD', pipSize: 0.0001, contractSize: 100000, minLotSize: 0.01, maxLotSize: 100, lotStep: 0.01, pricePrecision: 5 }
const plan = prepareTradePlan({ setup, accountBalance: 1000, accountCurrency: 'USD', riskPercent: 1, symbolSpec: spec })

describe('approveSimulationTrade', () => {
  it('rejects without explicit approval', () => expect(() => approveSimulationTrade({ approvedByUser: false, plan, accountCurrency: 'USD', symbolSpec: spec })).toThrow(/approval/i))
  it('creates a draft only after approval', () => {
    const draft = approveSimulationTrade({ approvedByUser: true, plan, accountCurrency: 'USD', symbolSpec: spec })
    expect(draft.symbol).toBe('EURUSD')
    expect(draft.riskPercent).toBe(1)
    expect(draft.lotSize).toBe(plan.lotSize)
  })
})
