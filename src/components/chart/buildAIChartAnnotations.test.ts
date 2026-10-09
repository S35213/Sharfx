import { describe, expect, it } from 'vitest'
import { buildAIChartAnnotations, buildStructuralChartAnnotations, mergeNearbyStructuralAnnotations } from './buildAIChartAnnotations'

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

describe('mergeNearbyStructuralAnnotations', () => {
  it('retains both structure and liquidity labels when nearby levels cluster', () => {
    const merged = mergeNearbyStructuralAnnotations(
      { id: 'support', price: 1.102, label: 'Support', color: '#22D3A5', lineWidth: 2 },
      { id: 'liquidity-buy', price: 1.10202, label: 'Buy-side liquidity', color: '#5CA8FF', lineWidth: 1 },
    )

    expect(merged.id).toBe('support+liquidity-buy')
    expect(merged.label).toBe('Support / Buy-side liquidity')
    expect(merged.price).toBe(1.102)
  })

  it('keeps buy-side and sell-side liquidity distinct when they share a level', () => {
    const merged = mergeNearbyStructuralAnnotations(
      { id: 'liquidity-buy', price: 1.102, label: 'Buy-side liquidity', color: '#5CA8FF', lineWidth: 1 },
      { id: 'liquidity-sell', price: 1.102, label: 'Sell-side liquidity', color: '#5CA8FF', lineWidth: 1 },
    )

    expect(merged.id).toBe('liquidity-buy+liquidity-sell')
    expect(merged.label).toBe('Buy-side liquidity / Sell-side liquidity')
    expect(merged.color).toBe('#5CA8FF')
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

  it('keeps a single confirmed swing high visible when no repeated-touch resistance cluster exists', () => {
    const sparseSwings = [
      [1.03, 0.94], [1.04, 0.95], [1.10, 0.96], [1.04, 0.95],
      [1.03, 0.96], [1.20, 0.94], [1.04, 0.95], [1.05, 0.96],
      [1.13, 0.97], [1.04, 0.95], [1.03, 0.94], [1.25, 0.93],
    ].map(([high, low], index) => ({
      time: (index + 1) * 60,
      open: 1.00,
      high,
      low,
      close: 1.00,
    }))

    const annotations = buildStructuralChartAnnotations('EUR/USD', sparseSwings, 'W1')
    expect(annotations.some((item) => item.id.includes('resistance'))).toBe(true)
    expect(annotations.some((item) => item.id.includes('liquidity-buy'))).toBe(true)
  })

  it('keeps range references visible when a timeframe has no confirmed pivot swings', () => {
    const oneWayMove = Array.from({ length: 12 }, (_, index) => {
      const close = 1.1000 + index * 0.0003
      return {
        time: (index + 1) * 86400,
        open: close - 0.0001,
        high: close + 0.00015,
        low: close - 0.0002,
        close,
      }
    })
    const annotations = buildStructuralChartAnnotations('EUR/USD', oneWayMove, 'D1')
    expect(annotations.some((item) => item.id.includes('support'))).toBe(true)
    expect(annotations.some((item) => item.id.includes('resistance'))).toBe(true)
    expect(annotations.some((item) => item.id.includes('liquidity-buy'))).toBe(true)
    expect(annotations.some((item) => item.id.includes('liquidity-sell'))).toBe(true)
  })
})
