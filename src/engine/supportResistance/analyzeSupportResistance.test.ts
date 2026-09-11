import { describe, expect, it } from 'vitest'
import type { OHLCV } from '../../types'
import { analyzeSupportResistance } from './analyzeSupportResistance'
import type { ClassifiedSwing } from '../marketStructure/types'

const candle = (time: number, open: number, high: number, low: number, close: number): OHLCV => ({
  time, open, high, low, close,
})

const baseCandles: OHLCV[] = [
  candle(1, 10, 11, 9, 10),
  candle(2, 10, 12, 8, 10),
  candle(3, 10, 11, 9, 10),
  candle(4, 10, 13, 7, 10),
  candle(5, 10, 11, 9, 10),
]

const swing = (index: number, price: number, time: number, type: 'high' | 'low'): ClassifiedSwing => ({
  index, price, time, type, label: null,
})

describe('Support & Resistance Engine', () => {
  it('detects clear support and resistance from market-structure swings', () => {
    const result = analyzeSupportResistance(baseCandles, 0.25, {
      lows: [swing(1, 8, 2, 'low'), swing(3, 7.9, 4, 'low')],
      highs: [swing(1, 12, 2, 'high'), swing(3, 12.1, 4, 'high')],
    })

    expect(result.nearestSupport).toBeCloseTo(8, 6)
    expect(result.nearestResistance).toBeCloseTo(12, 6)
    expect(result.zones).toHaveLength(2)
  })

  it('never merges support and resistance into the same zone', () => {
    const result = analyzeSupportResistance(baseCandles, 0.5, {
      lows: [swing(1, 10, 2, 'low'), swing(3, 10.2, 4, 'low')],
      highs: [swing(1, 10.1, 2, 'high'), swing(3, 10.3, 4, 'high')],
    })

    expect(result.zones).toHaveLength(2)
    expect(result.zones.map((zone) => zone.type).sort()).toEqual(['resistance', 'support'])
  })

  it('increases zone strength with repeated touches', () => {
    const result = analyzeSupportResistance(baseCandles, 0.05, {
      lows: [
        swing(0, 9, 1, 'low'),
        swing(1, 9.01, 2, 'low'),
        swing(2, 8.99, 3, 'low'),
        swing(3, 9.02, 4, 'low'),
      ],
      highs: [],
    })

    expect(result.zones[0]?.touches).toBe(4)
    expect(result.zones[0]?.strength).toBe('strong')
  })

  it('clusters nearby levels into one zone', () => {
    const result = analyzeSupportResistance(baseCandles, 0.01, {
      lows: [swing(0, 9, 1, 'low'), swing(1, 9.005, 2, 'low'), swing(2, 8.995, 3, 'low')],
      highs: [],
    })

    expect(result.zones).toHaveLength(1)
    expect(result.zones[0]?.minPrice).toBeCloseTo(8.995, 6)
    expect(result.zones[0]?.maxPrice).toBeCloseTo(9.005, 6)
    expect(result.zones[0]?.touches).toBe(3)
  })

  it('keeps distant levels separate', () => {
    const result = analyzeSupportResistance(baseCandles, 0.5, {
      lows: [swing(0, 5, 1, 'low'), swing(1, 5.1, 2, 'low'), swing(2, 9, 3, 'low'), swing(3, 9.1, 4, 'low')],
      highs: [],
    })

    expect(result.zones).toHaveLength(2)
  })

  it('uses the nearest valid support below price and resistance above price', () => {
    const candles = [...baseCandles.slice(0, 4), candle(5, 11, 12, 10, 11)]
    const result = analyzeSupportResistance(candles, 0.1, {
      lows: [swing(0, 8, 1, 'low'), swing(1, 8.02, 2, 'low'), swing(2, 10, 3, 'low'), swing(3, 10.02, 4, 'low')],
      highs: [swing(0, 12, 1, 'high'), swing(1, 12.02, 2, 'high'), swing(2, 14, 3, 'high'), swing(3, 14.02, 4, 'high')],
    })

    expect(result.nearestSupport).toBeCloseTo(10.02, 6)
    expect(result.nearestResistance).toBeCloseTo(12, 6)
  })

  it('returns empty output for insufficient or malformed candles', () => {
    expect(analyzeSupportResistance(baseCandles.slice(0, 4), 0.1).zones).toHaveLength(0)
    expect(analyzeSupportResistance([
      ...baseCandles.slice(0, 4),
      candle(5, 10, Number.NaN, 9, 10),
    ], 0.1).zones).toHaveLength(0)
  })

  it('rejects invalid tolerance configuration', () => {
    expect(() => analyzeSupportResistance(baseCandles, 0)).toThrow('Invalid configuration')
    expect(() => analyzeSupportResistance(baseCandles, -0.1)).toThrow('Invalid configuration')
    expect(() => analyzeSupportResistance(baseCandles, Number.NaN)).toThrow('Invalid configuration')
  })

  it('produces deterministic results and records the latest touch', () => {
    const swings = {
      lows: [swing(1, 9, 2, 'low'), swing(3, 9.01, 8, 'low')],
      highs: [swing(1, 12, 2, 'high'), swing(3, 12.01, 8, 'high')],
    }
    const result1 = analyzeSupportResistance(baseCandles, 0.05, swings)
    const result2 = analyzeSupportResistance(baseCandles, 0.05, swings)

    expect(result1).toEqual(result2)
    expect(result1.zones.every((zone) => zone.lastTouchTime === 8)).toBe(true)
  })
})
