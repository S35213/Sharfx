import { describe, expect, it } from 'vitest'
import { analyzeMultiTimeframeBias } from './multiTimeframe'
import type { OHLCV } from '../../types'

const candles = (direction: 'up' | 'down', offset = 0): OHLCV[] => Array.from({ length: 12 }, (_, i) => {
  const signed = direction === 'up' ? i * 0.001 : -i * 0.001
  const close = 1 + offset + signed
  return { time: i + 1, open: close - (direction === 'up' ? 0.0004 : -0.0004), high: close + 0.0006, low: close - 0.0006, close }
})

describe('analyzeMultiTimeframeBias', () => {
  it('returns deterministic weighted timeframe results', () => {
    const result = analyzeMultiTimeframeBias({ H1: candles('up'), H4: candles('up') })
    expect(result.biases.map((item) => item.timeframe)).toEqual(['H1', 'H4'])
    expect(result.biases.map((item) => item.weight)).toEqual([3, 4])
    expect(result.dominantBias).toBe('Bullish')
    expect(result.aligned).toBe(true)
    expect(result.confidence).toBe(100)
  })

  it('lets a higher timeframe outweigh more lower-timeframe evidence', () => {
    const result = analyzeMultiTimeframeBias({ M1: candles('down'), M5: candles('down'), H4: candles('up') })
    expect(result.dominantBias).toBe('Bullish')
    expect(result.aligned).toBe(false)
    expect(result.confidence).toBe(57)
  })

  it('does not invent a bias when no frames are supplied', () => {
    const result = analyzeMultiTimeframeBias({})
    expect(result.dominantBias).toBeNull()
    expect(result.aligned).toBe(false)
    expect(result.confidence).toBe(0)
  })
})
