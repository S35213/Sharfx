import type { OHLCV } from '../../types'
import { findSwingPoints } from '../marketStructure'
import type { ClassifiedSwing, SwingPoint } from '../marketStructure/types'
import type { SRZone, SupportResistanceResult, ZoneStrength, ZoneType } from './types'

interface SwingInput {
  highs: ClassifiedSwing[]
  lows: ClassifiedSwing[]
}

type AnySwing = SwingPoint | ClassifiedSwing

const isValidCandle = (candle: OHLCV): boolean =>
  Number.isFinite(candle.time) &&
  Number.isFinite(candle.open) &&
  Number.isFinite(candle.high) &&
  Number.isFinite(candle.low) &&
  Number.isFinite(candle.close) &&
  candle.high >= Math.max(candle.open, candle.close) &&
  candle.low <= Math.min(candle.open, candle.close)

const isValidSwing = (point: AnySwing, type: ZoneType): boolean =>
  Number.isInteger(point.index) &&
  point.index >= 0 &&
  Number.isFinite(point.price) &&
  Number.isFinite(point.time) &&
  ((type === 'support' && point.type === 'low') || (type === 'resistance' && point.type === 'high'))

const strengthForTouches = (touches: number): ZoneStrength => {
  if (touches >= 4) return 'strong'
  if (touches >= 3) return 'moderate'
  return 'weak'
}

const clusterPoints = (points: AnySwing[], type: ZoneType, tolerance: number): SRZone[] => {
  const sorted = points
    .filter((point) => isValidSwing(point, type))
    .sort((a, b) => a.price - b.price || a.time - b.time || a.index - b.index)

  const clusters: Array<{
    points: AnySwing[]
    center: number
    minPrice: number
    maxPrice: number
    lastTouchTime: number
  }> = []

  for (const point of sorted) {
    const existing = clusters.find((cluster) => Math.abs(point.price - cluster.center) <= tolerance)
    if (!existing) {
      clusters.push({ points: [point], center: point.price, minPrice: point.price, maxPrice: point.price, lastTouchTime: point.time })
      continue
    }

    existing.points.push(point)
    existing.minPrice = Math.min(existing.minPrice, point.price)
    existing.maxPrice = Math.max(existing.maxPrice, point.price)
    existing.lastTouchTime = Math.max(existing.lastTouchTime, point.time)
    existing.center = existing.points.reduce((sum, item) => sum + item.price, 0) / existing.points.length
  }

  return clusters
    .filter((cluster) => cluster.points.length >= 2)
    .map((cluster) => ({
      minPrice: cluster.minPrice,
      maxPrice: cluster.maxPrice,
      touches: cluster.points.length,
      lastTouchTime: cluster.lastTouchTime,
      type,
      strength: strengthForTouches(cluster.points.length),
    }))
}

export const analyzeSupportResistance = (
  candles: OHLCV[],
  tolerance: number,
  precomputedSwings?: SwingInput,
): SupportResistanceResult => {
  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw new Error('Invalid configuration: tolerance must be a positive finite number')
  }

  if (!Array.isArray(candles) || candles.length < 5 || !candles.every(isValidCandle)) {
    return { zones: [], nearestSupport: null, nearestResistance: null }
  }

  const swings = precomputedSwings ?? findSwingPoints(candles, 2)
  const supportZones = clusterPoints(swings.lows, 'support', tolerance)
  const resistanceZones = clusterPoints(swings.highs, 'resistance', tolerance)
  const zones = [...supportZones, ...resistanceZones].sort((a, b) => a.minPrice - b.minPrice || a.type.localeCompare(b.type))
  const currentPrice = candles[candles.length - 1].close
  const supportsBelowPrice = supportZones.filter((zone) => zone.maxPrice <= currentPrice)
  const resistancesAbovePrice = resistanceZones.filter((zone) => zone.minPrice >= currentPrice)

  return {
    zones,
    nearestSupport: supportsBelowPrice.length > 0 ? Math.max(...supportsBelowPrice.map((zone) => zone.maxPrice)) : null,
    nearestResistance: resistancesAbovePrice.length > 0 ? Math.min(...resistancesAbovePrice.map((zone) => zone.minPrice)) : null,
  }
}
