import { describe, expect, it } from 'vitest'
import { getSymbolSpec } from '../../data/mock/symbols'
import type { OHLCV, Timeframe } from '../../types'
import { evaluateTradeBotStrategy } from './tradeBotStrategy'

const symbol = 'EUR/USD'
const timeframe: Timeframe = 'M5'
const symbolSpec = getSymbolSpec(symbol)

const momentumBars = (count = 90): OHLCV[] => {
  const changes = [0.00010, -0.00009, 0.00006, -0.00009, 0.00006, 0.00010]
  const candles: OHLCV[] = []
  let close = 1.1000
  for (let index = 0; index < count; index += 1) {
    const open = close
    close = open + changes[index % changes.length]
    candles.push({
      time: (index + 1) * 300,
      open,
      close,
      high: Math.max(open, close) + 0.00003,
      low: Math.min(open, close) - 0.00003,
    })
  }
  // Simulate the forming cTrader candle. The strategy must not use this bar.
  candles.push({
    time: (count + 1) * 300,
    open: close,
    close: close + 0.00001,
    high: close + 0.00003,
    low: close - 0.00003,
  })
  return candles
}

const flatBars = (count = 50): OHLCV[] => Array.from({ length: count }, (_, index) => ({
  time: (index + 1) * 300,
  open: 1.1,
  close: 1.1,
  high: 1.10005,
  low: 1.09995,
}))

describe('Trade Bot explainable strategy', () => {
  it('uses the EMA/momentum fallback when the structural setup is absent', () => {
    const candles = momentumBars()
    const result = evaluateTradeBotStrategy({
      symbol,
      timeframe,
      candles,
      symbolSpec,
      higherTimeframeBias: null,
      higherTimeframeDirectionalCount: 0,
      higherTimeframeConfidence: 0,
      higherTimeframeDetail: 'Higher timeframes have no consistent directional bias.',
    })

    expect(result.setup?.direction).toBe('BUY')
    expect(result.source).toBe('EMA_MOMENTUM')
    expect(result.score).toBeGreaterThanOrEqual(75)
    expect(result.signalCandleTime).toBe(candles[candles.length - 2]?.time)
    expect(result.checks.some((check) => check.id === 'momentum' && check.status === 'PASS')).toBe(true)
    expect(result.setup?.stopLoss).toBeLessThan(result.setup?.entryPrice ?? 0)
    expect(result.setup?.takeProfit).toBeGreaterThan(result.setup?.entryPrice ?? 0)
    expect(result.setup?.riskRewardRatio).toBe(1.8)
  })

  it('reports individual waiting checks instead of a generic no-setup message in a flat market', () => {
    const result = evaluateTradeBotStrategy({
      symbol,
      timeframe,
      candles: flatBars(),
      symbolSpec,
      higherTimeframeBias: null,
      higherTimeframeDirectionalCount: 0,
      higherTimeframeConfidence: 0,
      higherTimeframeDetail: 'Higher timeframes are mixed.',
    })

    expect(result.setup).toBeNull()
    expect(result.reason).toContain('No entry yet:')
    expect(result.checks.some((check) => check.id === 'trend')).toBe(true)
    expect(result.checks.some((check) => check.id === 'momentum')).toBe(true)
    expect(result.checks.some((check) => check.status === 'WATCH')).toBe(true)
  })

  it('blocks a locally valid momentum candidate when multiple higher timeframes strongly oppose it', () => {
    const result = evaluateTradeBotStrategy({
      symbol,
      timeframe,
      candles: momentumBars(),
      symbolSpec,
      higherTimeframeBias: 'Bearish',
      higherTimeframeDirectionalCount: 3,
      higherTimeframeConfidence: 85,
      higherTimeframeDetail: 'Three higher timeframes favor bearish direction.',
    })

    expect(result.setup).toBeNull()
    expect(result.reason).toContain('higher-timeframe conflict')
    expect(result.checks.some((check) => check.id === 'higher-timeframe' && check.status === 'BLOCK')).toBe(true)
  })

  it('does not create an executable momentum setup before the candle history is warm', () => {
    const result = evaluateTradeBotStrategy({
      symbol,
      timeframe,
      candles: flatBars(20),
      symbolSpec,
      higherTimeframeBias: null,
      higherTimeframeDirectionalCount: 0,
      higherTimeframeConfidence: 0,
      higherTimeframeDetail: 'Higher timeframes are mixed.',
    })

    expect(result.setup).toBeNull()
    expect(result.reason).toContain('30 closed candles')
    expect(result.checks.find((check) => check.id === 'history')?.status).toBe('WATCH')
  })
})
