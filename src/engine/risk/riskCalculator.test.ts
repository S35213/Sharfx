import { describe, expect, it } from 'vitest'
import { calculateRisk } from './riskCalculator'
import type { RiskCalculationInputs, SymbolSpec } from '../../types'

const eurUsd: SymbolSpec = { symbol: 'EUR/USD', baseCurrency: 'EUR', quoteCurrency: 'USD', pipSize: 0.0001, contractSize: 100000, minLotSize: 0.01, maxLotSize: 100, lotStep: 0.01, pricePrecision: 5 }
const usdJpy: SymbolSpec = { symbol: 'USD/JPY', baseCurrency: 'USD', quoteCurrency: 'JPY', pipSize: 0.01, contractSize: 100000, minLotSize: 0.01, maxLotSize: 100, lotStep: 0.01, pricePrecision: 3 }
const baseInput = (overrides: Partial<RiskCalculationInputs> = {}): RiskCalculationInputs => ({ accountBalance: 10000, accountCurrency: 'USD', riskPercent: 1, side: 'BUY', entryPrice: 1.085, stopLoss: 1.082, takeProfit: 1.09, symbolSpec: eurUsd, ...overrides })

describe('calculateRisk', () => {
  it('computes EUR/USD BUY correctly', () => { const r = calculateRisk(baseInput()); expect(r.isValid).toBe(true); expect(r.riskAmount).toBe(100); expect(r.stopDistancePips).toBe(30); expect(r.rewardDistancePips).toBe(50); expect(r.riskRewardRatio).toBeCloseTo(1.67, 1); expect(r.suggestedLotSize).toBeCloseTo(0.33, 2) })
  it('computes EUR/USD SELL correctly', () => { const r = calculateRisk(baseInput({ side: 'SELL', riskPercent: 2, entryPrice: 1.085, stopLoss: 1.088, takeProfit: 1.08 })); expect(r.isValid).toBe(true); expect(r.suggestedLotSize).toBeCloseTo(0.66, 2) })
  it('handles USD/JPY with explicit conversion', () => { const r = calculateRisk({ accountBalance: 10000, accountCurrency: 'USD', riskPercent: 1, side: 'BUY', entryPrice: 149.5, stopLoss: 149.2, takeProfit: 150.1, symbolSpec: usdJpy, conversionRate: 1 / 149.85 }); expect(r.isValid).toBe(true); expect(r.stopDistancePips).toBeCloseTo(30, 5); expect(r.suggestedLotSize).toBeGreaterThan(0) })
  it('rejects invalid BUY SL/TP direction', () => { expect(calculateRisk(baseInput({ stopLoss: 1.085 })).isValid).toBe(false); expect(calculateRisk(baseInput({ takeProfit: 1.085 })).isValid).toBe(false) })
  it('rejects invalid SELL SL/TP direction', () => { expect(calculateRisk(baseInput({ side: 'SELL', stopLoss: 1.085, takeProfit: 1.08 })).isValid).toBe(false); expect(calculateRisk(baseInput({ side: 'SELL', stopLoss: 1.088, takeProfit: 1.085 })).isValid).toBe(false) })
  it('rejects invalid risk percentage', () => { expect(calculateRisk(baseInput({ riskPercent: 0 })).isValid).toBe(false); expect(calculateRisk(baseInput({ riskPercent: -1 })).isValid).toBe(false); expect(calculateRisk(baseInput({ riskPercent: 101 })).isValid).toBe(false) })
  it('rejects invalid prices and zero stop distance', () => { expect(calculateRisk(baseInput({ entryPrice: 0 })).isValid).toBe(false); expect(calculateRisk(baseInput({ stopLoss: -1 })).isValid).toBe(false); expect(calculateRisk(baseInput({ takeProfit: 0 })).isValid).toBe(false); expect(calculateRisk(baseInput({ stopLoss: 1.085 })).isValid).toBe(false) })
  it('rejects NaN and Infinity', () => { expect(calculateRisk(baseInput({ accountBalance: NaN })).isValid).toBe(false); expect(calculateRisk(baseInput({ riskPercent: Infinity })).isValid).toBe(false); expect(calculateRisk(baseInput({ entryPrice: NaN })).isValid).toBe(false) })
  it('requires conversion when quote currency differs', () => { const r = calculateRisk({ accountBalance: 10000, accountCurrency: 'USD', riskPercent: 1, side: 'BUY', entryPrice: 149.5, stopLoss: 149.2, takeProfit: 150.1, symbolSpec: usdJpy }); expect(r.isValid).toBe(false); expect(r.errorMessage).toContain('conversion rate') })
  it('rejects minimum-lot inflation when the budget is too small', () => { const r = calculateRisk(baseInput({ accountBalance: 100, riskPercent: 0.5, entryPrice: 1.085, stopLoss: 1.084, takeProfit: 1.09 })); expect(r.isValid).toBe(false); expect(r.errorMessage).toContain('below the minimum') })
  it('floors to lot step without exceeding the risk budget', () => { const r = calculateRisk(baseInput()); expect(r.isValid).toBe(true); expect(r.estimatedLossAtStop).toBeLessThanOrEqual(r.riskAmount + 1e-6) })
  it('caps above maximum lot without exceeding the budget', () => { const capped: SymbolSpec = { ...eurUsd, maxLotSize: 0.2 }; const r = calculateRisk(baseInput({ symbolSpec: capped })); expect(r.isValid).toBe(true); expect(r.suggestedLotSize).toBe(0.2); expect(r.estimatedLossAtStop).toBeLessThanOrEqual(r.riskAmount + 1e-6) })
  it('rejects invalid symbol lot configuration', () => { const r = calculateRisk(baseInput({ symbolSpec: { ...eurUsd, minLotSize: 1, maxLotSize: 0.1 } })); expect(r.isValid).toBe(false) })
  it('rejects invalid conversion rates', () => { expect(calculateRisk({ ...baseInput(), symbolSpec: usdJpy, entryPrice: 149.5, stopLoss: 149.2, takeProfit: 150.1, conversionRate: 0 }).isValid).toBe(false) })
  it('returns a finite risk/reward result', () => { const r = calculateRisk(baseInput()); expect(Number.isFinite(r.riskRewardRatio)).toBe(true); expect(Number.isFinite(r.pipValuePerLot)).toBe(true) })
})
