import { describe, expect, it } from 'vitest'
import type { OHLCV } from '../../types'
import { analyzeMarketStructure, findSwingPoints } from './analyzeMarketStructure'

const candle = (time: number, high: number, low: number, close = (high + low) / 2): OHLCV => ({ time, open: close, high, low, close })

const bullishCandles: OHLCV[] = [
  candle(1, 10, 8), candle(2, 11, 8.5), candle(3, 12, 9), candle(4, 11, 9.5), candle(5, 13, 10), candle(6, 12, 10.5), candle(7, 14, 11),
]
const bearishCandles: OHLCV[] = [
  candle(1, 14, 11), candle(2, 13, 10.5), candle(3, 12, 9), candle(4, 13, 9.5), candle(5, 11, 8), candle(6, 12, 8.5), candle(7, 10, 7),
]
const expandingCandles: OHLCV[] = [
  candle(1, 10, 8), candle(2, 11, 7), candle(3, 12, 6), candle(4, 11, 7), candle(5, 13, 5), candle(6, 12, 6), candle(7, 14, 4),
]
const contractingCandles: OHLCV[] = [
  candle(1, 14, 4), candle(2, 13, 5), candle(3, 12, 6), candle(4, 13, 7), candle(5, 11, 7), candle(6, 12, 8), candle(7, 10, 9),
]

describe('Market Structure Engine', () => {
  it('detects swing highs and lows', () => {
    const result = findSwingPoints(bullishCandles, 1)
    expect(result.highs.map((point) => point.price)).toEqual([12, 13])
    expect(result.lows.map((point) => point.price)).toEqual([9.5, 10.5])
  })

  it('detects bullish HH/HL structure', () => {
    const result = analyzeMarketStructure(bullishCandles, 1)
    expect(result.bias).toBe('Bullish')
    expect(result.structureType).toBe('HH/HL')
    expect(result.swingHighs.at(-1)?.label).toBe('HH')
    expect(result.swingLows.at(-1)?.label).toBe('HL')
  })

  it('detects bearish LH/LL structure', () => {
    const result = analyzeMarketStructure(bearishCandles, 1)
    expect(result.bias).toBe('Bearish')
    expect(result.structureType).toBe('LH/LL')
    expect(result.swingHighs.at(-1)?.label).toBe('LH')
    expect(result.swingLows.at(-1)?.label).toBe('LL')
  })

  it('detects expanding sideways structure', () => {
    const result = analyzeMarketStructure(expandingCandles, 1)
    expect(result.bias).toBe('Sideways')
    expect(result.structureType).toBe('Expanding')
  })

  it('detects contracting sideways structure', () => {
    const result = analyzeMarketStructure(contractingCandles, 1)
    expect(result.bias).toBe('Sideways')
    expect(result.structureType).toBe('Contracting')
  })

  it('returns insufficient data safely', () => {
    const result = analyzeMarketStructure([candle(1, 2, 1), candle(2, 3, 1.5), candle(3, 2.5, 1.2)], 2)
    expect(result.bias).toBe('Unclear')
    expect(result.structureType).toBe('Insufficient Data')
    expect(result.swingHighs).toHaveLength(0)
  })

  it('rejects invalid lookback values safely', () => {
    const result = analyzeMarketStructure(bullishCandles, 0)
    expect(result.structureType).toBe('Insufficient Data')
    expect(findSwingPoints(bullishCandles, -1).highs).toHaveLength(0)
  })

  it('ignores malformed candles instead of producing invalid swing points', () => {
    const malformed: OHLCV[] = [...bullishCandles]
    malformed[3] = { ...malformed[3], high: Number.NaN }
    const result = analyzeMarketStructure(malformed, 1)
    expect(result.swingHighs.every((point) => Number.isFinite(point.price))).toBe(true)
    expect(result.swingLows.every((point) => Number.isFinite(point.price))).toBe(true)
  })
})
