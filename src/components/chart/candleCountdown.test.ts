import { describe, expect, it } from 'vitest'
import { getCandleCloseCountdown, isMarketTimestampFresh } from './candleCountdown'

describe('getCandleCloseCountdown', () => {
  it('ticks down by one second between M5 timer readings', () => {
    const boundary = Math.floor(1_800_000_000 / 300) * 300
    expect(getCandleCloseCountdown(boundary + 100, 'M5')).toBe(200)
    expect(getCandleCloseCountdown(boundary + 101, 'M5')).toBe(199)
    expect(getCandleCloseCountdown(boundary + 102, 'M5')).toBe(198)
  })

  it('starts a full interval at an exact candle boundary', () => {
    const boundary = Math.floor(1_800_000_000 / 300) * 300
    expect(getCandleCloseCountdown(boundary, 'M5')).toBe(300)
    expect(getCandleCloseCountdown(boundary, 'M1')).toBe(60)
  })

  it('counts W1 candles to the next Monday UTC boundary', () => {
    const monday = Math.floor(Date.UTC(2026, 9, 12) / 1000)
    expect(getCandleCloseCountdown(monday, 'W1')).toBe(604800)
    expect(getCandleCloseCountdown(monday + 10, 'W1')).toBe(604790)
  })

  it('rejects invalid clock values', () => {
    expect(getCandleCloseCountdown(0, 'M5')).toBeNull()
    expect(getCandleCloseCountdown(Number.NaN, 'M5')).toBeNull()
  })
})

describe('isMarketTimestampFresh', () => {
  const now = Math.floor(Date.UTC(2026, 9, 18, 11, 47, 0) / 1000)

  it('accepts a quote updated within the live freshness window', () => {
    expect(isMarketTimestampFresh(now - 20, now)).toBe(true)
    expect(isMarketTimestampFresh(now + 2, now)).toBe(true)
  })

  it('rejects stale weekend quotes so the wall-clock cannot imply a candle is forming', () => {
    const fridayClose = Math.floor(Date.UTC(2026, 9, 16, 20, 0, 0) / 1000)
    expect(isMarketTimestampFresh(fridayClose, now)).toBe(false)
  })

  it('accepts millisecond timestamps and rejects absent or invalid timestamps', () => {
    expect(isMarketTimestampFresh((now - 5) * 1000, now)).toBe(true)
    expect(isMarketTimestampFresh(0, now)).toBe(false)
    expect(isMarketTimestampFresh(Number.NaN, now)).toBe(false)
  })
})
