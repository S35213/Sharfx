import { describe, expect, it } from 'vitest'
import type { OHLCV } from '../../types'
import type { SwingPoint } from '../marketStructure/types'
import { analyzeLiquidity } from './analyzeLiquidity'

const candle = (time: number, open: number, high: number, low: number, close: number): OHLCV => ({ time, open, high, low, close })
const swing = (index: number, price: number, type: 'high' | 'low'): SwingPoint => ({ index, price, time: index, type })
const baseCandles = (lastClose = 10): OHLCV[] => [
  candle(1, 10, 11, 9, 10), candle(2, 10, 11, 9, 10), candle(3, 10, 11, 9, 10),
  candle(4, 10, 11, 9, 10), candle(5, 10, 11, 9, lastClose),
]

describe('Liquidity Engine', () => {
  it('detects equal highs as buy-side liquidity', () => {
    const result = analyzeLiquidity(baseCandles(), { highs: [swing(1, 11.0005, 'high'), swing(3, 11.0008, 'high')], lows: [] }, 0.001)
    expect(result.pools).toHaveLength(1)
    expect(result.pools[0].association).toBe('equal-highs')
    expect(result.pools[0].type).toBe('buy-side')
    expect(result.pools[0].touches).toBe(2)
  })

  it('detects equal lows as sell-side liquidity', () => {
    const result = analyzeLiquidity(baseCandles(), { highs: [], lows: [swing(1, 8.9995, 'low'), swing(3, 8.9998, 'low')] }, 0.001)
    expect(result.pools).toHaveLength(1)
    expect(result.pools[0].association).toBe('equal-lows')
    expect(result.pools[0].type).toBe('sell-side')
  })

  it('clusters nearby same-side swings and assigns strong strength at four touches', () => {
    const result = analyzeLiquidity(baseCandles(), { highs: [swing(1, 11.0001, 'high'), swing(2, 11.0002, 'high'), swing(3, 11.0003, 'high'), swing(4, 11.0004, 'high')], lows: [] }, 0.001)
    expect(result.pools).toHaveLength(1)
    expect(result.pools[0].touches).toBe(4)
    expect(result.pools[0].strength).toBe('strong')
  })

  it('keeps clearly separated pools separate', () => {
    const result = analyzeLiquidity(baseCandles(), { highs: [swing(1, 11, 'high'), swing(3, 13, 'high')], lows: [] }, 0.001)
    expect(result.pools).toHaveLength(2)
  })

  it('finds the nearest unswept buy-side target above price', () => {
    const result = analyzeLiquidity(baseCandles(10.5), { highs: [swing(1, 11.5, 'high'), swing(2, 12, 'high')], lows: [] }, 0.001)
    expect(result.nearestBuySide?.referencePrice).toBe(11.5)
  })

  it('finds the nearest unswept sell-side target below price', () => {
    const result = analyzeLiquidity(baseCandles(10.5), { highs: [], lows: [swing(1, 8.5, 'low'), swing(2, 8, 'low')] }, 0.001)
    expect(result.nearestSellSide?.referencePrice).toBe(8.5)
  })

  it('detects a buy-side sweep as a wick through the level followed by a close back below', () => {
    const candles = [...baseCandles(10), candle(6, 10, 12, 9.5, 10.5)]
    const result = analyzeLiquidity(candles, { highs: [swing(4, 11, 'high')], lows: [] }, 0.001)
    expect(result.pools[0].isSwept).toBe(true)
    expect(result.nearestBuySide).toBeNull()
  })

  it('does not classify a clean close above a level as a sweep', () => {
    const candles = [...baseCandles(10), candle(6, 10, 12, 9.5, 11.5)]
    const result = analyzeLiquidity(candles, { highs: [swing(4, 11, 'high')], lows: [] }, 0.001)
    expect(result.pools[0].isSwept).toBe(false)
  })

  it('detects a sell-side sweep as a wick through the level followed by a close back above', () => {
    const candles = [...baseCandles(10), candle(6, 8.8, 9, 7.5, 8.9)]
    const result = analyzeLiquidity(candles, { highs: [], lows: [swing(4, 8.5, 'low')] }, 0.001)
    expect(result.pools[0].isSwept).toBe(true)
    expect(result.nearestSellSide).toBeNull()
  })

  it('ignores malformed candles safely', () => {
    const result = analyzeLiquidity([candle(1, 10, 9, 8, 10)], { highs: [swing(1, 11, 'high')], lows: [] }, 0.001)
    expect(result).toEqual({ pools: [], nearestBuySide: null, nearestSellSide: null })
  })

  it('returns no pools for insufficient candle data', () => {
    const result = analyzeLiquidity(baseCandles().slice(0, 2), { highs: [], lows: [] }, 0.001)
    expect(result.pools).toHaveLength(0)
  })

  it('rejects invalid tolerance', () => {
    expect(() => analyzeLiquidity(baseCandles(), { highs: [], lows: [] }, 0)).toThrow('Invalid configuration')
    expect(() => analyzeLiquidity(baseCandles(), { highs: [], lows: [] }, -1)).toThrow('Invalid configuration')
  })

  it('is deterministic', () => {
    const input = { highs: [swing(1, 11, 'high')], lows: [swing(2, 9, 'low')] }
    expect(analyzeLiquidity(baseCandles(10), input, 0.001)).toEqual(analyzeLiquidity(baseCandles(10), input, 0.001))
  })

  it('keeps buy-side and sell-side pools conceptually separate', () => {
    const result = analyzeLiquidity(baseCandles(), { highs: [swing(1, 11, 'high')], lows: [swing(2, 9, 'low')] }, 0.001)
    expect(result.pools).toHaveLength(2)
    expect(result.pools.map((pool) => pool.type).sort()).toEqual(['buy-side', 'sell-side'])
  })
})
