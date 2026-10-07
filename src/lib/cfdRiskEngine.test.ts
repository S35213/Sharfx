import { describe, expect, it } from 'vitest'
import type { SymbolSpec } from '../types'
import { calculateCfdRiskPlan, calculateLotSizeForRisk, calculatePipValuePerLot, normalizeLotSize } from './cfdRiskEngine'

const eurUsd: SymbolSpec = {
  symbol: 'EUR/USD',
  baseCurrency: 'EUR',
  quoteCurrency: 'USD',
  pipSize: 0.0001,
  contractSize: 100000,
  minLotSize: 0.01,
  maxLotSize: 100,
  lotStep: 0.01,
  pricePrecision: 5,
}

describe('SHAFX CFD risk engine', () => {
  it('calculates EUR/USD pip value for a USD account', () => {
    expect(calculatePipValuePerLot(eurUsd, 'USD')).toBeCloseTo(10, 8)
  })

  it('requires explicit conversion when quote currency differs from account currency', () => {
    const eurGbp = { ...eurUsd, symbol: 'EUR/GBP', quoteCurrency: 'GBP' }
    expect(calculatePipValuePerLot(eurGbp, 'USD')).toBeNull()
    expect(calculatePipValuePerLot(eurGbp, 'USD', 1.25)).toBeCloseTo(12.5, 8)
  })

  it('sizes $5 risk with a 10 pip stop at about 0.05 lot', () => {
    expect(calculateLotSizeForRisk(5, 10, 10, eurUsd)).toBeCloseTo(0.05, 8)
  })

  it('never exceeds the broker step when rounding down', () => {
    expect(normalizeLotSize(0.057, eurUsd)).toBe(0.05)
  })

  it('keeps the ticket tradable when the broker minimum lot exceeds the selected risk window', () => {
    const minLotSymbol = { ...eurUsd, minLotSize: 1, maxLotSize: 100, lotStep: 1 }
    const plan = calculateCfdRiskPlan({
      accountBalance: 1000,
      accountCurrency: 'USD',
      symbol: minLotSymbol,
      side: 'BUY',
      entryPrice: 1.17,
      stopLossPrice: 1.169,
      takeProfitPrice: 1.172,
      riskAmount: 2,
    })

    expect(plan.valid).toBe(true)
    expect(plan.lotSize).toBe(1)
    expect(plan.estimatedLossAtStop).toBeCloseTo(100, 8)
    expect(plan.warning).toContain('broker minimum lot')
  })

  it('builds a valid BUY plan and calculates reward/risk', () => {
    const plan = calculateCfdRiskPlan({
      accountBalance: 100,
      accountCurrency: 'USD',
      symbol: eurUsd,
      side: 'BUY',
      entryPrice: 1.17,
      stopLossPrice: 1.169,
      takeProfitPrice: 1.172,
      riskAmount: 5,
      effectiveLeverage: 100,
    })

    expect(plan.valid).toBe(true)
    expect(plan.lotSize).toBeCloseTo(0.05, 8)
    expect(plan.stopDistancePips).toBeCloseTo(10, 8)
    expect(plan.targetDistancePips).toBeCloseTo(20, 8)
    expect(plan.riskRewardRatio).toBeCloseTo(2, 8)
    expect(plan.estimatedLossAtStop).toBeCloseTo(5, 8)
    expect(plan.estimatedRewardAtTarget).toBeCloseTo(10, 8)
  })

  it('rejects a BUY with the stop on the wrong side', () => {
    const plan = calculateCfdRiskPlan({
      accountBalance: 100,
      accountCurrency: 'USD',
      symbol: eurUsd,
      side: 'BUY',
      entryPrice: 1.17,
      stopLossPrice: 1.171,
      takeProfitPrice: 1.172,
      riskAmount: 5,
    })
    expect(plan.valid).toBe(false)
    expect(plan.error).toContain('BUY requires')
  })

  it('rejects invalid account balances', () => {
    const plan = calculateCfdRiskPlan({
      accountBalance: 0,
      accountCurrency: 'USD',
      symbol: eurUsd,
      side: 'BUY',
      entryPrice: 1.17,
      stopLossPrice: 1.169,
      takeProfitPrice: 1.172,
      riskAmount: 5,
    })
    expect(plan.valid).toBe(false)
    expect(plan.error).toContain('Account balance')
  })
})
