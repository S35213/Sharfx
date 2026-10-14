import { describe, expect, it } from 'vitest'
import type { OHLCV, Timeframe } from '../../types'
import { buildMultiTimeframeStructuralAnnotations, STRUCTURAL_TIMEFRAME_CONTEXTS } from './buildMultiTimeframeChartAnnotations'

const makeHistory = (base: number, intervalSeconds: number): OHLCV[] =>
  Array.from({ length: 40 }, (_, index) => {
    const open = base + Math.sin(index * 0.73) * 0.002
    const close = base + Math.sin((index + 1) * 0.73) * 0.002
    return {
      time: (index + 1) * intervalSeconds,
      open,
      high: Math.max(open, close) + 0.0005,
      low: Math.min(open, close) - 0.0005,
      close,
    }
  })

const historyByTimeframe: Partial<Record<Timeframe, OHLCV[]>> = {
  M1: makeHistory(1.1000, 60),
  M5: makeHistory(1.1010, 300),
  M15: makeHistory(1.1020, 900),
  M30: makeHistory(1.1030, 1800),
  H1: makeHistory(1.1040, 3600),
  H4: makeHistory(1.1050, 14400),
  D1: makeHistory(1.1060, 86400),
  W1: makeHistory(1.1070, 604800),
}

const alignedHistoryByTimeframe: Partial<Record<Timeframe, OHLCV[]>> = {
  M1: makeHistory(1.1, 60),
  M5: makeHistory(1.1, 300),
  M15: makeHistory(1.1, 900),
  M30: makeHistory(1.1, 1800),
  H1: makeHistory(1.1, 3600),
  H4: makeHistory(1.1, 14400),
  D1: makeHistory(1.1, 86400),
  W1: makeHistory(1.1, 604800),
}

const SOURCE_PATTERN = /\b(M1|M5|M15|M30|H1|H4|D1|W1)\b/

describe('buildMultiTimeframeStructuralAnnotations', () => {
  it('combines selected-timeframe and higher-timeframe confluence in one compact zone', () => {
    const annotations = buildMultiTimeframeStructuralAnnotations('EUR/USD', 'M5', alignedHistoryByTimeframe)

    expect(annotations.length).toBeGreaterThan(0)
    expect(annotations.length).toBeLessThanOrEqual(4)
    expect(annotations.some((item) => item.label.includes('H1') && item.label.includes('H4'))).toBe(true)
    expect(annotations.some((item) => item.label.includes('M5'))).toBe(true)
  })

  it('never paints lower-timeframe levels onto H4 or W1 charts', () => {
    const h4 = buildMultiTimeframeStructuralAnnotations('EUR/USD', 'H4', historyByTimeframe)
    const weekly = buildMultiTimeframeStructuralAnnotations('EUR/USD', 'W1', historyByTimeframe)

    expect(h4.length).toBeLessThanOrEqual(4)
    expect(weekly.length).toBeLessThanOrEqual(4)
    expect(h4.every((item) => !/\b(M1|M5|M15|M30)\b/.test(item.label))).toBe(true)
    expect(weekly.every((item) => !/\b(M1|M5|M15|M30|H1|H4|D1)\b/.test(item.label))).toBe(true)
    expect(weekly.every((item) => SOURCE_PATTERN.test(item.label))).toBe(true)
  })

  it('caps the chart at two zones above and two below price to keep it readable', () => {
    for (const timeframe of Object.keys(STRUCTURAL_TIMEFRAME_CONTEXTS) as Timeframe[]) {
      const annotations = buildMultiTimeframeStructuralAnnotations('EUR/USD', timeframe, historyByTimeframe)
      expect(annotations.length, timeframe).toBeLessThanOrEqual(4)
    }
  })

  it('skips timeframes whose candle history has not loaded yet', () => {
    const annotations = buildMultiTimeframeStructuralAnnotations('EUR/USD', 'M5', {
      M5: historyByTimeframe.M5,
      H1: [{ time: 1, open: 1.1, high: 1.2, low: 1.0, close: 1.1 }],
    })

    expect(annotations.length).toBeGreaterThan(0)
    expect(annotations.every((item) => /^M5\s/.test(item.label))).toBe(true)
  })

  it('defines an explicit source-timeframe hierarchy for every chart interval', () => {
    expect(STRUCTURAL_TIMEFRAME_CONTEXTS.M1).toEqual(['M1', 'M5', 'H1'])
    expect(STRUCTURAL_TIMEFRAME_CONTEXTS.M5).toEqual(['M5', 'H1', 'H4'])
    expect(STRUCTURAL_TIMEFRAME_CONTEXTS.H4).toEqual(['H4', 'D1', 'W1'])
    expect(STRUCTURAL_TIMEFRAME_CONTEXTS.D1).toEqual(['D1', 'W1'])
    expect(STRUCTURAL_TIMEFRAME_CONTEXTS.W1).toEqual(['W1'])
  })
})
