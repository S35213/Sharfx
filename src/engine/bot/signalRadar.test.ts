import { describe, expect, it } from 'vitest'
import { buildSignalRadar } from './signalRadar'
import type { OHLCV } from '../../types'

const candles = (direction: 1 | -1): OHLCV[] => Array.from({ length: 20 }, (_, index) => {
  const base = 1.1 + direction * index * 0.0005
  return { time: index + 1, open: base, high: base + 0.0002, low: base - 0.0001, close: base + direction * 0.0001 }
})

describe('Signal Radar', () => {
  it('returns at most three strongest timeframe opportunities', () => {
    const frames = {
      M1: candles(1),
      M5: candles(1),
      M15: candles(1),
      M30: candles(-1),
      H1: candles(1),
      H4: candles(1),
      D1: candles(1),
      W1: candles(1),
    }
    const result = buildSignalRadar(frames, 'EUR/USD', 1.11)
    expect(result.opportunities.length).toBeLessThanOrEqual(3)
    expect(new Set(result.opportunities.map((item) => item.timeframe)).size).toBe(result.opportunities.length)
    expect(result.botPlan.mode).toBe('FAST_ADAPTIVE')
    if (result.botPlan.opportunity) {
      expect(result.botPlan.entryTimeframe).toBeTruthy()
    }
  })

  it('does not force M1 as the signal timeframe when a qualified higher-timeframe setup exists', () => {
    const frames = {
      M1: candles(-1),
      M5: candles(1),
      M15: candles(1),
      M30: candles(1),
      H1: candles(1),
      H4: candles(1),
      D1: candles(1),
      W1: candles(1),
    }
    const result = buildSignalRadar(frames, 'EUR/USD', 1.11)
    expect(result.botPlan.analysisTimeframe).not.toBe('M1')
  })
})
