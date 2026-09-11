import { describe, expect, it } from 'vitest'
import { analyzeMultiTimeframeBias } from './multiTimeframe'
import type { OHLCV } from '../../types'

const candles = (offset: number): OHLCV[] => Array.from({ length: 12 }, (_, i) => { const close = 1 + offset + i * 0.001; return { time: i + 1, open: close - 0.0004, high: close + 0.0006, low: close - 0.0006, close } })

describe('analyzeMultiTimeframeBias', () => {
  it('returns deterministic timeframe results', () => {
    const result = analyzeMultiTimeframeBias({ H1: candles(0), H4: candles(0) })
    expect(result.biases.map((item) => item.timeframe)).toEqual(['H1', 'H4'])
    expect(result.dominantBias).toBe('Bullish')
    expect(result.aligned).toBe(true)
  })
  it('does not invent a bias when no frames are supplied', () => {
    const result = analyzeMultiTimeframeBias({})
    expect(result.dominantBias).toBeNull()
    expect(result.aligned).toBe(false)
  })
})
