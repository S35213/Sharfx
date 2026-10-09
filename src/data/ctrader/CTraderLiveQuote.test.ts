import { describe, expect, it } from 'vitest'
import type { Timeframe } from '../../types'
import {
  applyCTraderQuoteToCandles,
  cTraderQuoteBucket,
  isCTraderQuoteBucketCurrent,
  normalizeCTraderHistoricalCandles,
} from './CTraderLiveQuote'

const candle = (time: number, open = 1.1, high = 1.12, low = 1.09, close = 1.11) => ({
  time,
  open,
  high,
  low,
  close,
})

describe('cTrader live candle updates', () => {
  it('updates the forming candle close/high/low while preserving its open', () => {
    const initial = [candle(1_791_547_200, 1.10000, 1.10030, 1.09970, 1.10010)]
    const next = applyCTraderQuoteToCandles(initial, 1_791_547_200, 1.10040)
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({
      time: 1_791_547_200,
      open: 1.10000,
      high: 1.10040,
      low: 1.09970,
      close: 1.10040,
    })
    expect(next[0].close).toBeGreaterThan(next[0].open)
  })

  it('flips candle direction when live bid crosses its unchanged open', () => {
    const initial = [candle(1_791_547_200, 1.10000, 1.10020, 1.09980, 1.10010)]
    const bearish = applyCTraderQuoteToCandles(initial, 1_791_547_200, 1.09990)
    expect(bearish[0].open).toBe(1.10000)
    expect(bearish[0].close).toBeLessThan(bearish[0].open)

    const bullish = applyCTraderQuoteToCandles(bearish, 1_791_547_200, 1.10030)
    expect(bullish[0].open).toBe(1.10000)
    expect(bullish[0].high).toBe(1.10030)
    expect(bullish[0].low).toBe(1.09980)
    expect(bullish[0].close).toBeGreaterThan(bullish[0].open)
  })

  it('opens a new live candle at the first bid tick of its timeframe', () => {
    const initial = [candle(1_791_547_200, 1.10000, 1.10020, 1.09980, 1.10010)]
    const next = applyCTraderQuoteToCandles(initial, 1_791_547_260, 1.10050)
    expect(next).toHaveLength(2)
    expect(next[1]).toEqual({
      time: 1_791_547_260,
      open: 1.10050,
      high: 1.10050,
      low: 1.10050,
      close: 1.10050,
    })
  })

  it('does not alter the chart for stale or invalid quote data', () => {
    const initial = [candle(1_791_547_260, 1.10000, 1.10020, 1.09980, 1.10010)]
    expect(applyCTraderQuoteToCandles(initial, 1_791_547_200, 1.10100)).toEqual(initial)
    expect(applyCTraderQuoteToCandles(initial, 1_791_547_260, Number.NaN)).toEqual(initial)
  })
})

describe('cTrader chart timestamps', () => {
  it('rejects a stale quote before it can move BUY/SELL markers beyond the chart candles', () => {
    expect(isCTraderQuoteBucketCurrent(1_791_547_200, 1_791_547_260)).toBe(false)
  })

  it('accepts quotes in the current/newer candle bucket and when candle history is not ready', () => {
    expect(isCTraderQuoteBucketCurrent(1_791_547_260, 1_791_547_260)).toBe(true)
    expect(isCTraderQuoteBucketCurrent(1_791_547_320, 1_791_547_260)).toBe(true)
    expect(isCTraderQuoteBucketCurrent(1_791_547_260, null)).toBe(true)
  })

  it('rejects invalid quote buckets', () => {
    expect(isCTraderQuoteBucketCurrent(Number.NaN, 1_791_547_260)).toBe(false)
    expect(isCTraderQuoteBucketCurrent(0, 1_791_547_260)).toBe(false)
  })

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
