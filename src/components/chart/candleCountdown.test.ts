import { describe, expect, it } from 'vitest'
import { getCandleCloseCountdown } from './candleCountdown'

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
