import { describe, expect, it } from 'vitest'
import { toOHLCV } from './ProviderLiveControl'

describe('ProviderLiveControl candle timestamps', () => {
  it('normalizes provider ISO timestamps to Unix seconds for the chart', () => {
    expect(toOHLCV('2026-09-27T12:34:00.000Z', 1.1, 1.2, 1.0, 1.15)).toEqual({
      time: 1790512440,
      open: 1.1,
      high: 1.2,
      low: 1.0,
      close: 1.15,
    })
  })

  it('rejects invalid candle data', () => {
    expect(toOHLCV('not-a-date', 1.1, 1.2, 1.0, 1.15)).toBeNull()
    expect(toOHLCV('2026-09-27T12:34:00.000Z', 1.1, 1.0, 1.2, 1.15)).toBeNull()
  })
})
