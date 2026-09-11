import type { OHLCV } from '../../types'
import type { SwingPoint } from '../marketStructure/types'
import type { LiquidityAssociation, LiquidityPool, LiquidityResult, LiquidityStrength, LiquidityType } from './types'

const isValidCandle = (candle: OHLCV): boolean =>
  Number.isFinite(candle.time) &&
  Number.isFinite(candle.open) &&
  Number.isFinite(candle.high) &&
  Number.isFinite(candle.low) &&
  Number.isFinite(candle.close) &&
  candle.high >= Math.max(candle.open, candle.close) &&
  candle.low <= Math.min(candle.open, candle.close)

const isValidSwing = (point: SwingPoint, expectedType: 'high' | 'low'): boolean =>
  Number.isInteger(point.index) &&
  point.index >= 0 &&
  point.index < Number.MAX_SAFE_INTEGER &&
  Number.isFinite(point.price) &&
  Number.isFinite(point.time) &&
  point.type === expectedType

const strengthForTouches = (touches: number): LiquidityStrength => {
  if (touches >= 4) return 'strong'
  if (touches >= 2) return 'moderate'
  return 'weak'
}

const clusterSwings = (
  points: SwingPoint[],
  type: LiquidityType,
  tolerance: number,
): LiquidityPool[] => {
  const expectedType = type === 'buy-side' ? 'high' : 'low'
  const sorted = points
    .filter((point) => isValidSwing(point, expectedType))
    .slice()
    .sort((a, b) => a.price - b.price || a.time - b.time || a.index - b.index)

  const pools: LiquidityPool[] = []
  for (const point of sorted) {
    const existing = pools.find((pool) =>
      Math.abs(point.price - pool.referencePrice) <= tolerance,
    )

    if (!existing) {
      pools.push({
        type,
        priceRange: { min: point.price, max: point.price },
        referencePrice: point.price,
        sourceSwings: [point],
        touches: 1,
        strength: 'weak',
        isSwept: false,
        association: type === 'buy-side' ? 'swing-high' : 'swing-low',
      })
      continue
    }

    existing.sourceSwings.push(point)
    existing.touches = existing.sourceSwings.length
    existing.priceRange.min = Math.min(existing.priceRange.min, point.price)
    existing.priceRange.max = Math.max(existing.priceRange.max, point.price)
    existing.referencePrice = type === 'buy-side'
      ? existing.priceRange.max
      : existing.priceRange.min
    existing.strength = strengthForTouches(existing.touches)
    existing.association = type === 'buy-side' ? 'equal-highs' : 'equal-lows'
  }

  return pools
}

const hasHistoricalSweep = (
  candles: OHLCV[],
  pool: LiquidityPool,
): boolean => {
  const latestSourceIndex = Math.max(...pool.sourceSwings.map((swing) => swing.index))
  const reference = pool.referencePrice

  for (let i = latestSourceIndex + 1; i < candles.length; i += 1) {
    const candle = candles[i]
    if (pool.type === 'buy-side') {
      // A basic liquidity sweep requires a wick through the high followed by a
      // close back at or below the reference level.
      if (candle.high > reference && candle.close <= reference) return true
    } else if (candle.low < reference && candle.close >= reference) {
      return true
    }
  }

  return false
}

export const analyzeLiquidity = (
  candles: OHLCV[],
  swings: { highs: SwingPoint[]; lows: SwingPoint[] },
  tolerance: number,
): LiquidityResult => {
  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw new Error('Invalid configuration: tolerance must be a positive finite number')
  }

  if (!Array.isArray(candles) || candles.length < 5 || !candles.every(isValidCandle)) {
    return { pools: [], nearestBuySide: null, nearestSellSide: null }
  }

  const currentPrice = candles[candles.length - 1].close
  if (!Number.isFinite(currentPrice)) {
    return { pools: [], nearestBuySide: null, nearestSellSide: null }
  }

  const pools = [
    ...clusterSwings(swings.highs, 'buy-side', tolerance),
    ...clusterSwings(swings.lows, 'sell-side', tolerance),
  ]
    .map((pool) => ({ ...pool, isSwept: hasHistoricalSweep(candles, pool) }))
    .sort((a, b) => a.referencePrice - b.referencePrice || a.type.localeCompare(b.type))

  const buySidePools = pools.filter(
    (pool) => !pool.isSwept && pool.type === 'buy-side' && pool.referencePrice > currentPrice,
  )
  const sellSidePools = pools.filter(
    (pool) => !pool.isSwept && pool.type === 'sell-side' && pool.referencePrice < currentPrice,
  )

  const nearestBuySide = buySidePools.reduce<LiquidityPool | null>(
    (nearest, pool) => nearest === null || pool.referencePrice < nearest.referencePrice ? pool : nearest,
    null,
  )
  const nearestSellSide = sellSidePools.reduce<LiquidityPool | null>(
    (nearest, pool) => nearest === null || pool.referencePrice > nearest.referencePrice ? pool : nearest,
    null,
  )

  return { pools, nearestBuySide, nearestSellSide }
}
