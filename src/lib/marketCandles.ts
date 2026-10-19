import type { OHLCV } from '../types'

/**
 * Normalize a broker snapshot before it enters the chart cache.
 * If a provider repeats the currently forming candle's timestamp, keep its
 * most recent valid value.
 */
export const normalizeMarketCandles = (candles: readonly OHLCV[]): OHLCV[] => {
  const ordered = candles
    .filter((candle) =>
      Number.isFinite(candle.time) &&
      Number.isFinite(candle.open) &&
      Number.isFinite(candle.high) &&
      Number.isFinite(candle.low) &&
      Number.isFinite(candle.close) &&
      candle.high >= Math.max(candle.open, candle.close) &&
      candle.low <= Math.min(candle.open, candle.close)
    )
    .map((candle) => ({ ...candle }))
    .sort((a, b) => a.time - b.time)

  const latestByTime = new Map<number, OHLCV>()
  for (const candle of ordered) latestByTime.set(candle.time, candle)
  return [...latestByTime.values()]
}
