import type { OHLCV, Timeframe } from '../../types'

export interface LiveDataValidationInput {
  candles: OHLCV[]
  symbol: string
  timeframe: Timeframe
  receivedAtMs: number
  maxAgeMs: number
  nowMs: number
}

export interface LiveDataValidationResult {
  valid: boolean
  reason: 'OK' | 'EMPTY' | 'INVALID_OHLC' | 'UNSORTED' | 'STALE' | 'INVALID_CLOCK'
  latestTimestamp?: number
}

const isFiniteNumber = (value: number) => Number.isFinite(value)

export function validateLiveMarketData(input: LiveDataValidationInput): LiveDataValidationResult {
  if (!input.symbol.trim() || !input.timeframe) return { valid: false, reason: 'INVALID_CLOCK' }
  if (!Number.isFinite(input.receivedAtMs) || !Number.isFinite(input.nowMs) || input.receivedAtMs > input.nowMs) {
    return { valid: false, reason: 'INVALID_CLOCK' }
  }
  if (!Number.isFinite(input.maxAgeMs) || input.maxAgeMs < 0) return { valid: false, reason: 'INVALID_CLOCK' }
  if (input.candles.length === 0) return { valid: false, reason: 'EMPTY' }

  for (let i = 0; i < input.candles.length; i += 1) {
    const candle = input.candles[i]
    if (!candle || !isFiniteNumber(candle.time) || !isFiniteNumber(candle.open) || !isFiniteNumber(candle.high) || !isFiniteNumber(candle.low) || !isFiniteNumber(candle.close) || candle.high < candle.low || candle.high < candle.open || candle.high < candle.close || candle.low > candle.open || candle.low > candle.close) {
      return { valid: false, reason: 'INVALID_OHLC' }
    }
    if (i > 0 && candle.time <= input.candles[i - 1].time) return { valid: false, reason: 'UNSORTED' }
  }

  const latestTimestamp = input.candles[input.candles.length - 1].time
  const latestAgeMs = input.nowMs - latestTimestamp
  if (!Number.isFinite(latestAgeMs) || latestAgeMs > input.maxAgeMs) return { valid: false, reason: 'STALE', latestTimestamp }

  return { valid: true, reason: 'OK', latestTimestamp }
}
