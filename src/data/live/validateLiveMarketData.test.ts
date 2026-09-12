import { describe, expect, it } from 'vitest'
import { validateLiveMarketData } from './validateLiveMarketData'
import type { OHLCV } from '../../types'

const candles: OHLCV[] = [
  { time: 100, open: 1, high: 2, low: 0.5, close: 1.5 },
  { time: 160, open: 1.5, high: 2.2, low: 1.2, close: 2 },
]

describe('validateLiveMarketData', () => {
  const base = { candles, symbol: 'EUR/USD', timeframe: 'M1' as const, receivedAt: 165, maxAgeSeconds: 10, now: 165 }

  it('accepts valid fresh candles', () => expect(validateLiveMarketData(base).valid).toBe(true))
  it('rejects empty data', () => expect(validateLiveMarketData({ ...base, candles: [] }).reason).toBe('EMPTY'))
  it('rejects invalid OHLC', () => expect(validateLiveMarketData({ ...base, candles: [{ ...candles[0], high: 0.2 }] }).reason).toBe('INVALID_OHLC'))
  it('rejects unsorted candles', () => expect(validateLiveMarketData({ ...base, candles: [candles[1], candles[0]] }).reason).toBe('UNSORTED'))
  it('rejects stale candles', () => expect(validateLiveMarketData({ ...base, now: 200 }).reason).toBe('STALE'))
  it('rejects a future receive clock', () => expect(validateLiveMarketData({ ...base, receivedAt: 170, now: 165 }).reason).toBe('INVALID_CLOCK'))
})
