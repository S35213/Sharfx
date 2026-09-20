import { describe, expect, it } from 'vitest'
import { SimulatorRealtimeMarketEngine } from './realtimeMarketEngine'
import type { OHLCV, SymbolSpec } from '../../types'

const spec: SymbolSpec = {
  symbol: 'EUR/USD',
  baseCurrency: 'EUR',
  quoteCurrency: 'USD',
  pipSize: 0.0001,
  contractSize: 100000,
  minLotSize: 0.01,
  maxLotSize: 100,
  lotStep: 0.01,
  pricePrecision: 5,
}

const seed: OHLCV[] = Array.from({ length: 1200 }, (_, index) => {
  const time = 1_760_000_000 + index * 60
  const price = 1.085 + Math.sin(index * 0.13) * 0.001
  return { time, open: price, high: price + 0.0003, low: price - 0.0003, close: price, volume: 100 + index }
})

describe('SimulatorRealtimeMarketEngine', () => {
  it('updates the currently forming M1 candle on every tick', () => {
    const engine = new SimulatorRealtimeMarketEngine(spec, 'M1', seed)
    const before = engine.snapshot()
    const first = engine.tickOnce(1)
    const second = engine.tickOnce(1)
    const current = first.candles[first.candles.length - 1]
    const current2 = second.candles[second.candles.length - 1]

    expect(current.time).toBe(before.candles[before.candles.length - 1].time)
    expect(current2.time).toBe(current.time)
    expect(current2.close).toBe(second.bid)
    expect(current2.high).toBeGreaterThanOrEqual(Math.max(current2.open, current2.close))
    expect(current2.low).toBeLessThanOrEqual(Math.min(current2.open, current2.close))
  })

  it('rolls a 5-minute candle from the underlying M1 ticks', () => {
    const engine = new SimulatorRealtimeMarketEngine(spec, 'M5', seed)
    const before = engine.snapshot()
    const start = before.candles[before.candles.length - 1]
    let snapshot = before
    const secondsToBoundary = 300 - (before.timestamp % 300)

    for (let index = 0; index < Math.max(0, secondsToBoundary - 1); index += 1) snapshot = engine.tickOnce(1)

    expect(snapshot.candles[snapshot.candles.length - 1].time).toBe(start.time)
    expect(snapshot.candles[snapshot.candles.length - 1].close).toBe(snapshot.bid)

    snapshot = engine.tickOnce(1)
    expect(snapshot.candles[snapshot.candles.length - 1].time).toBe(start.time + 300)
    expect(snapshot.candles.length).toBeGreaterThanOrEqual(2)
  })

  it('updates higher-timeframe candle bodies on a slower cadence than M1', () => {
    const engine = new SimulatorRealtimeMarketEngine(spec, 'H1', seed)
    let snapshot = engine.snapshot()
    const initial = snapshot.candles[snapshot.candles.length - 1]

    const colors: number[] = []
    for (let index = 0; index < 600; index += 1) {
      snapshot = engine.tickOnce(1)
      const current = snapshot.candles[snapshot.candles.length - 1]
      colors.push(Math.sign(current.close - current.open))
      expect(current.high).toBeGreaterThanOrEqual(Math.max(current.open, current.close))
      expect(current.low).toBeLessThanOrEqual(Math.min(current.open, current.close))
    }

    const changes = colors.filter((direction, index) =>
      index > 0 &&
      direction !== 0 &&
      colors[index - 1] !== 0 &&
      direction !== colors[index - 1],
    ).length

    expect(changes).toBeLessThan(10)
    expect(initial.time).toBe(snapshot.candles[snapshot.candles.length - 1].time)
  })

  it('does not make M5 react to every one-second tick', () => {
    const engine = new SimulatorRealtimeMarketEngine(spec, 'M5', seed)
    let snapshot = engine.snapshot()
    const initial = snapshot.candles[snapshot.candles.length - 1]
    const initialClose = initial.close

    for (let index = 0; index < 30; index += 1) {
      snapshot = engine.tickOnce(1)
      expect(snapshot.candles[snapshot.candles.length - 1].close).toBe(initialClose)
    }
  })
})
