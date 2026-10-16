import { describe, expect, it } from 'vitest'
import type { OHLCV, SymbolSpec } from '../../types'
import { runTradeBotHistoricalReplay } from './tradeBotHistoricalReplay'

const spec: SymbolSpec = {
  symbol: 'EUR/USD', baseCurrency: 'EUR', quoteCurrency: 'USD',
  pipSize: 0.0001, contractSize: 100000, minLotSize: 0.01,
  maxLotSize: 100, lotStep: 0.01, pricePrecision: 5,
}
const bars = (count: number): OHLCV[] => Array.from({ length: count }, (_, index) => {
  const close = 1.1 + Math.sin(index / 3) * 0.003
  return { time: 1_800_000_000 + index * 300, open: close, high: close + 0.001, low: close - 0.001, close }
})

describe('Trade Bot historical replay', () => {
  it('is deterministic, uses the current decision function and never creates broker actions', () => {
    const frames = { M5: bars(40) }
    const input = {
      scopeKey: 'ctrader|demo|account-1|EUR/USD|M5',
      symbol: 'EUR/USD', timeframe: 'M5' as const, frames,
      accountBalance: 1000, accountCurrency: 'USD', symbolSpec: spec,
    }
    const first = runTradeBotHistoricalReplay(input)
    const second = runTradeBotHistoricalReplay(input)
    expect(first).toEqual(second)
    expect(first.candlesReviewed).toBeGreaterThan(0)
    expect(first.records.length).toBeLessThanOrEqual(100)
    expect(first.notes.join(' ')).toContain('no broker orders')
  })

  it('does not count the newest potentially-forming candle as a signal', () => {
    const frame = bars(8)
    const result = runTradeBotHistoricalReplay({
      scopeKey: 'scope', symbol: 'EUR/USD', timeframe: 'M5', frames: { M5: frame },
      accountBalance: 1000, accountCurrency: 'USD', symbolSpec: spec,
    })
    expect(result.candlesReviewed).toBe(0)
  })

  it('blocks all risk sizing when instrument metadata is missing', () => {
    const result = runTradeBotHistoricalReplay({
      scopeKey: 'scope', symbol: 'EUR/USD', timeframe: 'M5', frames: { M5: bars(20) },
      accountBalance: 1000, accountCurrency: 'USD', symbolSpec: null,
    })
    expect(result.blockedDecisions).toBeGreaterThan(0)
    expect(result.readyCandidates).toBe(0)
    expect(result.records).toHaveLength(0)
  })
})
