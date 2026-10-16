import { describe, expect, it } from 'vitest'
import { calculateTradePlan } from '../tradePlanCalculator'
import type { SymbolSpec } from '../../types'

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

describe('calculateTradePlan', () => {
  const base = {
    accountBalance: 100,
    entryPrice: 1.08542,
    stake: 10,
    multiplier: 100,
    symbolSpec: eurUsd,
  }

  it('calculates visual pip distance and Deriv protection estimates for BUY', () => {
    const result = calculateTradePlan({
      ...base,
      side: 'BUY',
      slPrice: 1.082,
      tpPrice: 1.09,
    })

    expect(result.validationError).toBeNull()
    expect(result.slDistancePips).toBe(34.2)
    expect(result.tpDistancePips).toBe(45.8)
    expect(result.estimatedSlAmount).toBeCloseTo(3.15, 2)
    expect(result.estimatedTpAmount).toBeCloseTo(4.22, 2)
    expect(result.estimatedRiskPercent).toBeCloseTo(3.15, 2)
    expect(result.estimatedRiskRewardRatio).toBeCloseTo(1.34, 2)
    expect(result.estimatedMaxStakePercent).toBe(10)
  })

  it('calculates correctly for SELL', () => {
    const result = calculateTradePlan({
      ...base,
      side: 'SELL',
      entryPrice: 1.08542,
      slPrice: 1.08842,
      tpPrice: 1.08042,
    })

    expect(result.validationError).toBeNull()
    expect(result.slDistancePips).toBe(30)
    expect(result.tpDistancePips).toBe(50)
    expect(result.estimatedSlAmount).toBeCloseTo(2.76, 2)
    expect(result.estimatedTpAmount).toBeCloseTo(4.61, 2)
  })

  it('rejects an inverted BUY stop loss', () => {
    const result = calculateTradePlan({
      ...base,
      side: 'BUY',
      slPrice: 1.086,
      tpPrice: 1.09,
    })

    expect(result.validationError).toContain('Stop Loss must be below Entry')
  })

  it('rejects an inverted BUY take profit', () => {
    const result = calculateTradePlan({
      ...base,
      side: 'BUY',
      slPrice: 1.082,
      tpPrice: 1.084,
    })

    expect(result.validationError).toContain('Take Profit must be above Entry')
  })

  it('rejects protection that would exceed the stake', () => {
    const result = calculateTradePlan({
      ...base,
      side: 'BUY',
      slPrice: 0.5,
      tpPrice: null,
    })

    expect(result.validationError).toContain('exceed the stake exposure')
  })
})
