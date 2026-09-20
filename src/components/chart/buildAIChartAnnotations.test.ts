import { describe, expect, it } from 'vitest'
import { buildAIChartAnnotations, buildStructuralChartAnnotations } from './buildAIChartAnnotations'

const candles = [
  { time: 60, open: 1.1, high: 1.102, low: 1.098, close: 1.101 },
  { time: 120, open: 1.101, high: 1.104, low: 1.099, close: 1.103 },
  { time: 180, open: 1.103, high: 1.106, low: 1.1, close: 1.105 },
  { time: 240, open: 1.105, high: 1.107, low: 1.101, close: 1.106 },
  { time: 300, open: 1.106, high: 1.108, low: 1.102, close: 1.107 },
  { time: 360, open: 1.107, high: 1.109, low: 1.103, close: 1.108 },
  { time: 420, open: 1.108, high: 1.11, low: 1.104, close: 1.107 },
  { time: 480, open: 1.107, high: 1.108, low: 1.101, close: 1.103 },
  { time: 540, open: 1.103, high: 1.104, low: 1.098, close: 1.1 },
  { time: 600, open: 1.1, high: 1.103, low: 1.097, close: 1.102 },
  { time: 660, open: 1.102, high: 1.106, low: 1.1, close: 1.105 },
  { time: 720, open: 1.105, high: 1.108, low: 1.102, close: 1.104 },
  { time: 780, open: 1.104, high: 1.105, low: 1.099, close: 1.101 },
  { time: 840, open: 1.101, high: 1.103, low: 1.097, close: 1.099 },
  { time: 900, open: 1.099, high: 1.101, low: 1.095, close: 1.098 },
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

describe('buildStructuralChartAnnotations', () => {
  it('does not let the forming candle move structural levels', () => {
    const changedFormingCandle = candles.map((item, index) =>
      index === candles.length - 1 ? { ...item, high: 1.2, low: 1.0, close: 1.15 } : item,
    )

    const a = buildStructuralChartAnnotations('EUR/USD', candles, 'M5')
    const b = buildStructuralChartAnnotations('EUR/USD', changedFormingCandle, 'M5')

    expect(a).toEqual(b)
  })

  it('returns structural annotations with valid price coordinates', () => {
    const annotations = buildStructuralChartAnnotations('EUR/USD', candles, 'M5')
    expect(annotations.every((item) => Number.isFinite(item.price) && item.price > 0)).toBe(true)
    expect(annotations.every((item) => item.id.includes('support') || item.id.includes('resistance') || item.id.includes('liquidity'))).toBe(true)
  })
})
