import type { OHLCV } from '../../types'
import type { ClassifiedSwing, MarketBias, MarketStructureResult, StructureStatus, SwingLabel, SwingPoint } from './types'

const isFiniteCandle = (candle: OHLCV): boolean =>
  Number.isFinite(candle.time) && Number.isFinite(candle.open) && Number.isFinite(candle.high) && Number.isFinite(candle.low) && Number.isFinite(candle.close) &&
  candle.high >= Math.max(candle.open, candle.close) && candle.low <= Math.min(candle.open, candle.close)

const last = <T,>(items: T[]): T | undefined => items[items.length - 1]

export const findSwingPoints = (candles: OHLCV[], lookback = 2): { highs: SwingPoint[]; lows: SwingPoint[] } => {
  const highs: SwingPoint[] = []
  const lows: SwingPoint[] = []
  if (!Number.isInteger(lookback) || lookback < 1 || candles.length < lookback * 2 + 1) return { highs, lows }

  for (let i = lookback; i < candles.length - lookback; i += 1) {
    const current = candles[i]
    if (!isFiniteCandle(current)) continue
    let isHigh = true
    let isLow = true
    for (let j = 1; j <= lookback; j += 1) {
      const left = candles[i - j]
      const right = candles[i + j]
      if (!isFiniteCandle(left) || !isFiniteCandle(right)) { isHigh = false; isLow = false; break }
      if (left.high >= current.high || right.high >= current.high) isHigh = false
      if (left.low <= current.low || right.low <= current.low) isLow = false
    }
    if (isHigh) highs.push({ index: i, price: current.high, time: current.time, type: 'high' })
    if (isLow) lows.push({ index: i, price: current.low, time: current.time, type: 'low' })
  }
  return { highs, lows }
}

const classify = (points: SwingPoint[]): ClassifiedSwing[] => points.map((point, index) => {
  if (index === 0) return { ...point, label: null }
  const previous = points[index - 1]
  let label: SwingLabel
  if (point.type === 'high') label = point.price > previous.price ? 'HH' : 'LH'
  else label = point.price > previous.price ? 'HL' : 'LL'
  return { ...point, label }
})

const determineBias = (highs: ClassifiedSwing[], lows: ClassifiedSwing[]): { bias: MarketBias; type: string; status: StructureStatus } => {
  const latestHigh = last(highs)?.label
  const latestLow = last(lows)?.label
  if (latestHigh === 'HH' && latestLow === 'HL') return { bias: 'Bullish', type: 'HH/HL', status: 'Intact' }
  if (latestHigh === 'LH' && latestLow === 'LL') return { bias: 'Bearish', type: 'LH/LL', status: 'Intact' }
  if (latestHigh === 'HH' && latestLow === 'LL') return { bias: 'Sideways', type: 'Expanding', status: 'Developing' }
  if (latestHigh === 'LH' && latestLow === 'HL') return { bias: 'Sideways', type: 'Contracting', status: 'Developing' }
  if (latestHigh || latestLow) return { bias: 'Unclear', type: 'Mixed', status: 'Developing' }
  return { bias: 'Unclear', type: 'Insufficient Structure', status: 'Developing' }
}

export const analyzeMarketStructure = (candles: OHLCV[], lookback = 2): MarketStructureResult => {
  if (!Number.isInteger(lookback) || lookback < 1 || candles.length < lookback * 2 + 3) {
    return { bias: 'Unclear', structureType: 'Insufficient Data', status: 'Developing', swingHighs: [], swingLows: [], recentHigh: null, recentLow: null }
  }
  const { highs, lows } = findSwingPoints(candles, lookback)
  const swingHighs = classify(highs)
  const swingLows = classify(lows)
  const result = determineBias(swingHighs, swingLows)
  return {
    bias: result.bias,
    structureType: result.type,
    status: result.status,
    swingHighs,
    swingLows,
    recentHigh: last(swingHighs)?.price ?? null,
    recentLow: last(swingLows)?.price ?? null,
  }
}
