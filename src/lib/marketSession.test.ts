import { describe, expect, it } from 'vitest'
import { isForexMarketWeekendClosed, isStandardForexPair } from './marketSession'

const utc = (day: number, hour: number, minute = 0): number =>
  Date.UTC(2026, 9, day, hour, minute)

describe('standard FX weekly market session', () => {
  it('identifies conventional fiat currency pairs without treating crypto or metals as FX', () => {
    expect(isStandardForexPair('EUR/USD')).toBe(true)
    expect(isStandardForexPair('USD/JPY')).toBe(true)
    expect(isStandardForexPair('BTC/USD')).toBe(false)
    expect(isStandardForexPair('XAU/USD')).toBe(false)
    expect(isStandardForexPair('EURUSD')).toBe(false)
  })

  it('marks Saturday and Sunday before the reopening grace period as closed in New York time', () => {
    // Saturday, Oct 17 2026, 12:00 ET = 16:00 UTC (EDT).
    expect(isForexMarketWeekendClosed('EUR/USD', utc(17, 16))).toBe(true)
    // Sunday, Oct 18 2026, 10:41 ET = 14:41 UTC.
    expect(isForexMarketWeekendClosed('EUR/USD', utc(18, 14, 41))).toBe(true)
    // Sunday 17:04 ET remains closed during the short reconnect grace period.
    expect(isForexMarketWeekendClosed('EUR/USD', utc(18, 21, 4))).toBe(true)
  })

  it('reopens after the grace period and closes around Friday 5 p.m. ET', () => {
    // Sunday 17:05 ET = 21:05 UTC.
    expect(isForexMarketWeekendClosed('EUR/USD', utc(18, 21, 5))).toBe(false)
    // Friday 16:58 ET = 20:58 UTC, still before the configured close boundary.
    expect(isForexMarketWeekendClosed('EUR/USD', utc(16, 20, 58))).toBe(false)
    // Friday 16:59 ET = 20:59 UTC, conservative close boundary.
    expect(isForexMarketWeekendClosed('EUR/USD', utc(16, 20, 59))).toBe(true)
  })

  it('does not apply FX weekend hours to crypto, metals, or invalid timestamps', () => {
    expect(isForexMarketWeekendClosed('BTC/USD', utc(17, 16))).toBe(false)
    expect(isForexMarketWeekendClosed('XAU/USD', utc(17, 16))).toBe(false)
    expect(isForexMarketWeekendClosed('EUR/USD', Number.NaN)).toBe(false)
  })
})
