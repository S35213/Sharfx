import { describe, expect, it } from 'vitest'
import { analyzeSetup } from './analyzeSetup'
import type { MarketStructureResult } from '../marketStructure/types'
import type { SupportResistanceResult } from '../supportResistance/types'
import type { LiquidityResult } from '../liquidity/types'

const structure = (bias: MarketStructureResult['bias']): MarketStructureResult => ({
  bias,
  structureType: bias === 'Bullish' ? 'HH/HL' : bias === 'Bearish' ? 'LH/LL' : 'Mixed',
  status: 'Intact',
  swingHighs: [],
  swingLows: [],
  recentHigh: 12,
  recentLow: 8,
})

const sr: SupportResistanceResult = {
  zones: [],
  nearestSupport: 9.5,
  nearestResistance: 11,
}

const buyLiquidity: LiquidityResult = {
  pools: [{ type: 'buy-side', priceRange: { min: 11.9, max: 12 }, referencePrice: 12, sourceSwings: [], touches: 2, strength: 'moderate', isSwept: false, association: 'equal-highs' }],
  nearestBuySide: { type: 'buy-side', priceRange: { min: 11.9, max: 12 }, referencePrice: 12, sourceSwings: [], touches: 2, strength: 'moderate', isSwept: false, association: 'equal-highs' },
  nearestSellSide: null,
}

const sellLiquidity: LiquidityResult = {
  pools: [{ type: 'sell-side', priceRange: { min: 8, max: 8.1 }, referencePrice: 8, sourceSwings: [], touches: 2, strength: 'moderate', isSwept: false, association: 'equal-lows' }],
  nearestBuySide: null,
  nearestSellSide: { type: 'sell-side', priceRange: { min: 8, max: 8.1 }, referencePrice: 8, sourceSwings: [], touches: 2, strength: 'moderate', isSwept: false, association: 'equal-lows' },
}

describe('Setup Engine', () => {
  it('creates a bullish candidate from bullish structure, support and buy-side liquidity', () => {
    const result = analyzeSetup({ currentPrice: 10, structure: structure('Bullish'), supportResistance: sr, liquidity: buyLiquidity })
    expect(result.candidates).toHaveLength(1)
    expect(result.preferredSetup?.direction).toBe('BUY')
    expect(result.preferredSetup?.stopLoss).toBeLessThan(10)
    expect(result.preferredSetup?.takeProfit).toBe(12)
    expect(result.preferredSetup?.riskRewardRatio).toBeGreaterThan(0)
  })

  it('creates a bearish candidate from bearish structure, resistance and sell-side liquidity', () => {
    const result = analyzeSetup({ currentPrice: 10, structure: structure('Bearish'), supportResistance: sr, liquidity: sellLiquidity })
    expect(result.candidates).toHaveLength(1)
    expect(result.preferredSetup?.direction).toBe('SELL')
    expect(result.preferredSetup?.stopLoss).toBeGreaterThan(10)
    expect(result.preferredSetup?.takeProfit).toBe(8)
  })

  it('does not invent a setup in neutral conditions', () => {
    const result = analyzeSetup({ currentPrice: 10, structure: structure('Sideways'), supportResistance: sr, liquidity: buyLiquidity })
    expect(result.candidates).toHaveLength(0)
    expect(result.preferredSetup).toBeNull()
  })

  it('does not create a buy when the liquidity target is not above price', () => {
    const liquidity: LiquidityResult = { ...buyLiquidity, nearestBuySide: { ...buyLiquidity.nearestBuySide!, referencePrice: 9.8 } }
    const result = analyzeSetup({ currentPrice: 10, structure: structure('Bullish'), supportResistance: sr, liquidity })
    expect(result.candidates).toHaveLength(0)
  })

  it('does not create a sell when the liquidity target is not below price', () => {
    const liquidity: LiquidityResult = { ...sellLiquidity, nearestSellSide: { ...sellLiquidity.nearestSellSide!, referencePrice: 10.2 } }
    const result = analyzeSetup({ currentPrice: 10, structure: structure('Bearish'), supportResistance: sr, liquidity })
    expect(result.candidates).toHaveLength(0)
  })

  it('does not create a setup without the required reaction boundary', () => {
    const result = analyzeSetup({ currentPrice: 10, structure: structure('Bullish'), supportResistance: { ...sr, nearestSupport: null }, liquidity: buyLiquidity })
    expect(result.candidates).toHaveLength(0)
  })

  it('returns no setup for an invalid current price', () => {
    const result = analyzeSetup({ currentPrice: NaN, structure: structure('Bullish'), supportResistance: sr, liquidity: buyLiquidity })
    expect(result.candidates).toHaveLength(0)
    expect(result.preferredSetup).toBeNull()
  })

  it('is deterministic', () => {
    const input = { currentPrice: 10, structure: structure('Bullish'), supportResistance: sr, liquidity: buyLiquidity }
    expect(analyzeSetup(input)).toEqual(analyzeSetup(input))
  })
})
