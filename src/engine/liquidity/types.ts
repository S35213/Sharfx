import type { SwingPoint } from '../marketStructure/types'

export type LiquidityType = 'buy-side' | 'sell-side'
export type LiquidityAssociation = 'equal-highs' | 'equal-lows' | 'swing-high' | 'swing-low'
export type LiquidityStrength = 'weak' | 'moderate' | 'strong'

export interface LiquidityPool {
  type: LiquidityType
  priceRange: { min: number; max: number }
  referencePrice: number
  sourceSwings: SwingPoint[]
  touches: number
  strength: LiquidityStrength
  isSwept: boolean
  association: LiquidityAssociation
}

export interface LiquidityResult {
  pools: LiquidityPool[]
  nearestBuySide: LiquidityPool | null
  nearestSellSide: LiquidityPool | null
}
