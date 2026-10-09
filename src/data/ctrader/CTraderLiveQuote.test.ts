import { describe, expect, it } from 'vitest'
import type { Timeframe } from '../../types'
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
    const expected: Array<{ timeframe: Timeframe; seconds: number }> = [
      { timeframe: 'M1', seconds: 60 },
      { timeframe: 'M5', seconds: 300 },
      { timeframe: 'M15', seconds: 900 },
      { timeframe: 'M30', seconds: 1800 },
      { timeframe: 'H1', seconds: 3600 },
      { timeframe: 'H4', seconds: 14400 },
      { timeframe: 'D1', seconds: 86400 },
    ]

    for (const { timeframe, seconds } of expected) {
      const bucket = cTraderQuoteBucket(timestamp, timeframe)
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
