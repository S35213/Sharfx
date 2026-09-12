import type { OHLCV, Timeframe } from '../../types'

export type MarketDataHealthStatus = 'FRESH' | 'STALE' | 'INVALID'

export interface MarketDataHealth {
  status: MarketDataHealthStatus
  ageSeconds: number | null
  latestCandleTime: number | null
  expectedIntervalSeconds: number
  message: string
}

const INTERVAL_SECONDS: Record<Timeframe, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  M30: 1800,
  H1: 3600,
  H4: 14400,
  D1: 86400,
}

export const getExpectedIntervalSeconds = (timeframe: Timeframe): number => INTERVAL_SECONDS[timeframe]

export const evaluateMarketDataHealth = (
  candles: OHLCV[],
  timeframe: Timeframe,
  nowSeconds: number,
  staleAfterIntervals = 3,
): MarketDataHealth => {
  const expectedIntervalSeconds = getExpectedIntervalSeconds(timeframe)
  if (!Number.isFinite(nowSeconds) || nowSeconds <= 0 || !Number.isFinite(staleAfterIntervals) || staleAfterIntervals <= 0) {
    return { status: 'INVALID', ageSeconds: null, latestCandleTime: null, expectedIntervalSeconds, message: 'Market-data clock configuration is invalid.' }
  }
  if (!Array.isArray(candles) || candles.length === 0) {
    return { status: 'INVALID', ageSeconds: null, latestCandleTime: null, expectedIntervalSeconds, message: 'No market candles are available.' }
  }
  const latestCandleTime = candles[candles.length - 1]?.time
  if (!Number.isFinite(latestCandleTime) || latestCandleTime <= 0) {
    return { status: 'INVALID', ageSeconds: null, latestCandleTime: null, expectedIntervalSeconds, message: 'Latest candle timestamp is invalid.' }
  }
  const ageSeconds = nowSeconds - latestCandleTime
  if (ageSeconds < -expectedIntervalSeconds) {
    return { status: 'INVALID', ageSeconds, latestCandleTime, expectedIntervalSeconds, message: 'Market data is ahead of the local clock.' }
  }
  if (ageSeconds > expectedIntervalSeconds * staleAfterIntervals) {
    return { status: 'STALE', ageSeconds, latestCandleTime, expectedIntervalSeconds, message: 'Market data is stale; new prices are required before live decisions.' }
  }
  return { status: 'FRESH', ageSeconds: Math.max(0, ageSeconds), latestCandleTime, expectedIntervalSeconds, message: 'Market data is fresh enough for analysis.' }
}
