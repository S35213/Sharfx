import { describe, expect, it } from 'vitest'
import { buildAIChartAnnotations } from './buildAIChartAnnotations'

const candles = [
  { time: 1, open: 1.1, high: 1.102, low: 1.098, close: 1.101 },
  { time: 2, open: 1.101, high: 1.104, low: 1.099, close: 1.103 },
  { time: 3, open: 1.103, high: 1.106, low: 1.1, close: 1.105 },
  { time: 4, open: 1.105, high: 1.107, low: 1.101, close: 1.106 },
  { time: 5, open: 1.106, high: 1.108, low: 1.102, close: 1.107 },
]

describe('buildAIChartAnnotations', () => {
  it('returns finite sorted annotations for valid candles', () => {
    const annotations = buildAIChartAnnotations('EURUSD', candles)
    expect(annotations.every((item) => Number.isFinite(item.price) && item.price > 0)).toBe(true)
    expect(annotations.map((item) => item.price)).toEqual([...annotations].sort((a, b) => a.price - b.price).map((item) => item.price))
  })

  it('returns no annotations for empty data', () => {
    expect(buildAIChartAnnotations('EURUSD', [])).toEqual([])
  })
})
