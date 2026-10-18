import { describe, expect, it } from 'vitest'
import { getWeekendMarketStatus } from './marketHours'

describe('weekend market session guard', () => {
  it('marks a standard FX pair closed during Sunday in New York', () => {
    // 15:00 UTC is 11:00 in New York on Sunday 18 October 2026.
    const status = getWeekendMarketStatus('EUR/USD', Date.parse('2026-10-18T15:00:00Z'))
    expect(status.kind).toBe('fx')
    expect(status.isClosed).toBe(true)
    expect(status.reason).toContain('FX market is closed')
  })

  it('recognises broker suffixes but does not classify crypto as FX', () => {
    expect(getWeekendMarketStatus('m.GBPUSD').kind).toBe('fx')
    expect(getWeekendMarketStatus('BTC/USD', Date.parse('2026-10-18T15:00:00Z')).kind).toBe('other')
  })

  it('keeps FX closed until the Sunday opening buffer has passed', () => {
    expect(getWeekendMarketStatus('EURUSD', Date.parse('2026-10-18T21:04:00Z')).isClosed).toBe(true)
    expect(getWeekendMarketStatus('EURUSD', Date.parse('2026-10-18T21:05:00Z')).isClosed).toBe(false)
  })

  it('uses the later Sunday session for spot gold and silver', () => {
    expect(getWeekendMarketStatus('XAUUSD', Date.parse('2026-10-18T21:30:00Z')).isClosed).toBe(true)
    expect(getWeekendMarketStatus('XAU/USD', Date.parse('2026-10-18T22:06:00Z')).isClosed).toBe(false)
  })

  it('marks Saturday closed and applies the Friday New York close', () => {
    expect(getWeekendMarketStatus('GBPJPY', Date.parse('2026-10-17T12:00:00Z')).isClosed).toBe(true)
    expect(getWeekendMarketStatus('GBPJPY', Date.parse('2026-10-16T20:58:00Z')).isClosed).toBe(false)
    expect(getWeekendMarketStatus('GBPJPY', Date.parse('2026-10-16T20:59:00Z')).isClosed).toBe(true)
  })

  it('does not apply the FX rule to unknown instruments or invalid timestamps', () => {
    expect(getWeekendMarketStatus('US500', Date.parse('2026-10-18T15:00:00Z')).isClosed).toBe(false)
    expect(getWeekendMarketStatus('EURUSD', Number.NaN).isClosed).toBe(false)
  })
})
