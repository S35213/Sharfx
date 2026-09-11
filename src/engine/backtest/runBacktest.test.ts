import { describe, expect, it } from 'vitest'
import type { OHLCV, SymbolSpec } from '../../types'
import { runBacktest } from './runBacktest'

const spec: SymbolSpec = {
  symbol: 'EURUSD',
  baseCurrency: 'EUR',
  quoteCurrency: 'USD',
  pipSize: 0.0001,
  contractSize: 100000,
  minLotSize: 0.01,
  maxLotSize: 10,
  lotStep: 0.01,
  pricePrecision: 5,
}

const candles: OHLCV[] = [
  { time: 1, open: 1.1000, high: 1.1010, low: 1.0990, close: 1.1005 },
  { time: 2, open: 1.1005, high: 1.1020, low: 1.1000, close: 1.1010 },
  { time: 3, open: 1.1010, high: 1.1030, low: 1.1008, close: 1.1025 },
  { time: 4, open: 1.1025, high: 1.1030, low: 1.1000, close: 1.1010 },
]

describe('runBacktest', () => {
  it('enters on the next candle open and exits at take profit', () => {
    const result = runBacktest(candles, { initialBalance: 1000, accountCurrency: 'USD', symbolSpec: spec }, () => ({ side: 'BUY', stopLoss: 1.0995, takeProfit: 1.1020, lotSize: 0.01 }))
    expect(result.totalTrades).toBe(1)
    expect(result.trades[0].entryPrice).toBe(1.1005)
    expect(result.trades[0].exitPrice).toBe(1.102)
    expect(result.trades[0].exitReason).toBe('take-profit')
    expect(result.trades[0].profit).toBe(1.5)
    expect(result.finalBalance).toBe(1001.5)
  })

  it('uses the conservative stop when stop and target occur in one candle', () => {
    const result = runBacktest(candles, { initialBalance: 1000, accountCurrency: 'USD', symbolSpec: spec }, () => ({ side: 'BUY', stopLoss: 1.1008, takeProfit: 1.1020, lotSize: 0.01 }))
    expect(result.trades[0].exitReason).toBe('stop-loss')
    expect(result.trades[0].profit).toBe(-0)
  })

  it('does not leak future candles to the signal provider', () => {
    let observedLength = -1
    runBacktest(candles, { initialBalance: 1000, accountCurrency: 'USD', symbolSpec: spec }, (history) => {
      observedLength = Math.max(observedLength, history.length)
      return null
    })
    expect(observedLength).toBe(candles.length - 1)
  })

  it('rejects missing conversion for a non-account quote currency', () => {
    const gbpSpec = { ...spec, symbol: 'GBPJPY', baseCurrency: 'GBP', quoteCurrency: 'JPY', pipSize: 0.01 }
    expect(() => runBacktest(candles, { initialBalance: 1000, accountCurrency: 'USD', symbolSpec: gbpSpec }, () => null)).toThrow(/conversion rate/i)
  })

  it('rejects invalid chronological or OHLC data', () => {
    expect(() => runBacktest([{ time: 2, open: 1, high: 1, low: 1, close: 1 }, { time: 1, open: 1, high: 1, low: 1, close: 1 }], { initialBalance: 1000, accountCurrency: 'USD', symbolSpec: spec }, () => null)).toThrow(/chronological/i)
    expect(() => runBacktest([{ time: 1, open: 1, high: 0.9, low: 0.8, close: 0.85 }], { initialBalance: 1000, accountCurrency: 'USD', symbolSpec: spec }, () => null)).toThrow(/invalid OHLC/i)
  })
})
