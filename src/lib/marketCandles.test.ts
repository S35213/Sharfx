import { describe, expect, it } from 'vitest'
import type { OHLCV } from '../types'
import { normalizeMarketCandles } from './marketCandles'

const candle = (time: number, open: number, high: number, low: number, close: number): OHLCV => ({
  time,
  open,
  high,
  low,
  close,
})

describe('normalizeMarketCandles', () => {
  it('sorts provider candles chronologically and keeps the latest duplicate timestamp', () => {
    const older = candle(60, 1.1, 1.3, 1.0, 1.2)
    const staleForming = candle(120, 1.2, 1.4, 1.1, 1.25)
    const latestForming = candle(120, 1.2, 1.45, 1.1, 1.4)

    expect(normalizeMarketCandles([staleForming, older, latestForming])).toEqual([
      older,
      latestForming,
    ])
  })

  it('drops non-finite timestamps and malformed OHLC candles', () => {
    const valid = candle(60, 1.1, 1.3, 1.0, 1.2)
    const invalidTime = candle(Number.NaN, 1.1, 1.3, 1.0, 1.2)
    const invalidHigh = candle(120, 1.2, 1.1, 1.0, 1.15)
    const invalidLow = candle(180, 1.2, 1.3, 1.25, 1.22)

    expect(normalizeMarketCandles([invalidLow, valid, invalidTime, invalidHigh])).toEqual([valid])
  })
})
