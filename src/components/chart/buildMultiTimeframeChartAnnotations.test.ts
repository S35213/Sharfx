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

describe('buildMultiTimeframeStructuralAnnotations', () => {
  it('uses the selected timeframe and relevant higher-timeframe context', () => {
    const annotations = buildMultiTimeframeStructuralAnnotations('EUR/USD', 'M5', historyByTimeframe)
    const ids = annotations.map((item) => item.id)

    expect(ids.some((id) => id.startsWith('mtf-M5-'))).toBe(true)
    expect(ids.some((id) => id.startsWith('mtf-H1-'))).toBe(true)
    expect(ids.some((id) => id.startsWith('mtf-H4-'))).toBe(true)
    expect(ids.some((id) => id.startsWith('mtf-M1-'))).toBe(false)
    expect(ids.some((id) => id.startsWith('mtf-D1-'))).toBe(false)
    expect(annotations.some((item) => item.label.startsWith('H1 '))).toBe(true)
    expect(annotations.some((item) => item.label.startsWith('H4 '))).toBe(true)
  })

  it('never paints lower-timeframe levels onto H4 or W1 charts', () => {
    const h4Ids = buildMultiTimeframeStructuralAnnotations('EUR/USD', 'H4', historyByTimeframe).map((item) => item.id)
    const weeklyIds = buildMultiTimeframeStructuralAnnotations('EUR/USD', 'W1', historyByTimeframe).map((item) => item.id)

    expect(h4Ids.some((id) => id.startsWith('mtf-H4-'))).toBe(true)
    expect(h4Ids.some((id) => id.startsWith('mtf-D1-'))).toBe(true)
    expect(h4Ids.some((id) => id.startsWith('mtf-W1-'))).toBe(true)
    expect(h4Ids.some((id) => /^mtf-(M1|M5|M15|M30|H1)-/.test(id))).toBe(false)
    expect(weeklyIds.length).toBeGreaterThan(0)
    expect(weeklyIds.every((id) => id.startsWith('mtf-W1-'))).toBe(true)
  })

  it('skips timeframes whose candle history has not loaded yet', () => {
    const annotations = buildMultiTimeframeStructuralAnnotations('EUR/USD', 'M5', {
      M5: historyByTimeframe.M5,
      H1: [{ time: 1, open: 1.1, high: 1.2, low: 1.0, close: 1.1 }],
    })

    expect(annotations.length).toBeGreaterThan(0)
    expect(annotations.every((item) => item.id.startsWith('mtf-M5-'))).toBe(true)
  })

  it('defines an explicit source-timeframe hierarchy for every chart interval', () => {
    expect(STRUCTURAL_TIMEFRAME_CONTEXTS.H4).toEqual(['H4', 'D1', 'W1'])
    expect(STRUCTURAL_TIMEFRAME_CONTEXTS.D1).toEqual(['D1', 'W1'])
    expect(STRUCTURAL_TIMEFRAME_CONTEXTS.W1).toEqual(['W1'])
  })
})
