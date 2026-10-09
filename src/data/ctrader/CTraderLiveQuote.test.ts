import { describe, expect, it } from 'vitest'
import {
  cTraderQuoteBucket,
  normalizeCTraderHistoricalCandles,
} from './CTraderLiveQuote'

const candle = (time: number, open = 1.1, high = 1.12, low = 1.09, close = 1.11) => ({
  time,
  open,
  high,
  low,
  close,
})

describe('cTrader chart timestamps', () => {
  it('converts cTrader historical epoch milliseconds to SHAFX epoch seconds', () => {
    const seconds = Math.floor(Date.UTC(2026, 9, 9, 11, 59) / 1000)
    const normalized = normalizeCTraderHistoricalCandles([
      candle((seconds + 60) * 1000),
      candle(seconds * 1000),
    ])

    expect(normalized.map((item) => item.time)).toEqual([seconds, seconds + 60])
    expect(normalized.every((item) => item.time < 2_000_000_000)).toBe(true)
  })

  it('accepts already-normalized seconds and keeps the latest duplicate candle', () => {
    const seconds = Math.floor(Date.UTC(2026, 9, 9, 11, 59) / 1000)
    const normalized = normalizeCTraderHistoricalCandles([
      candle(seconds, 1.1, 1.12, 1.09, 1.11),
      candle(seconds, 1.11, 1.13, 1.1, 1.12),
    ])

    expect(normalized).toHaveLength(1)
    expect(normalized[0].close).toBe(1.12)
  })

  it('buckets quotes into Unix seconds for every supported timeframe', () => {
    const timestamp = Date.UTC(2026, 9, 9, 11, 59, 32)
    const expected: Record<string, number> = {
      M1: 60,
      M5: 300,
      M15: 900,
      M30: 1800,
      H1: 3600,
      H4: 14400,
      D1: 86400,
    }

    for (const [timeframe, seconds] of Object.entries(expected)) {
      const bucket = cTraderQuoteBucket(timestamp, timeframe as keyof typeof expected)
      expect(bucket).toBe(Math.floor(timestamp / 1000 / seconds) * seconds)
      expect(bucket).toBeLessThan(2_000_000_000)
    }

    const weekly = cTraderQuoteBucket(timestamp, 'W1')
    const mondayUtc = new Date(weekly * 1000)
    expect(weekly).toBeLessThan(2_000_000_000)
    expect(mondayUtc.getUTCDay()).toBe(1)
    expect(mondayUtc.getUTCHours()).toBe(0)
    expect(mondayUtc.getUTCMinutes()).toBe(0)
  })
})
