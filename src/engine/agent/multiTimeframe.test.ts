import { describe, expect, it } from 'vitest'
import { analyzeMultiTimeframeBias } from './multiTimeframe'
import type { OHLCV } from '../../types'

const candle = (time: number, high: number, low: number, close = (high + low) / 2): OHLCV => ({ time, open: close, high, low, close })
const bullishCandles: OHLCV[] = [candle(1, 10, 9), candle(2, 11, 10), candle(3, 12, 8), candle(4, 11, 10), candle(5, 13, 9), candle(6, 12, 11), candle(7, 14, 10)]
const bearishCandles: OHLCV[] = [candle(1, 14, 11), candle(2, 13, 10.5), candle(3, 12, 9), candle(4, 13, 9.5), candle(5, 11, 8), candle(6, 12, 8.5), candle(7, 10, 7)]

describe('analyzeMultiTimeframeBias', () => {
  it('returns deterministic weighted timeframe results', () => {
    const result = analyzeMultiTimeframeBias({ H1: bullishCandles, H4: bullishCandles })
    expect(result.biases.map((item) => item.timeframe)).toEqual(['H1', 'H4'])
    expect(result.biases.map((item) => item.weight)).toEqual([3, 4])
    expect(result.dominantBias).toBe('Bullish')
    expect(result.aligned).toBe(true)
    expect(result.confidence).toBe(100)
  })

  it('lets a higher timeframe outweigh multiple lower-timeframe signals', () => {
    const result = analyzeMultiTimeframeBias({ M1: bearishCandles, M5: bearishCandles, H4: bullishCandles })
    expect(result.dominantBias).toBe('Bullish')
    expect(result.aligned).toBe(false)
    expect(result.confidence).toBe(67)
  })

  it('does not invent a bias when no frames are supplied', () => {
    const result = analyzeMultiTimeframeBias({})
    expect(result.dominantBias).toBeNull()
    expect(result.aligned).toBe(false)
    expect(result.confidence).toBe(0)
  })
})
