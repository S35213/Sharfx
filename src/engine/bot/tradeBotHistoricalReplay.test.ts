import { describe, expect, it } from 'vitest'
import type { OHLCV, SymbolSpec } from '../../types'
import { calculateTradeBotReplayPerformance, runTradeBotHistoricalReplay } from './tradeBotHistoricalReplay'
import type { TradeBotShadowRecord } from './tradeBotShadowEvaluation'

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
  it('reports cost-adjusted R metrics without hiding stops or ambiguous outcomes', () => {
    const record = (id: string, status: TradeBotShadowRecord['status'], time: number): TradeBotShadowRecord => ({
      id,
      scopeKey: 'scope',
      symbol: 'EUR/USD',
      timeframe: 'M5',
      direction: 'BUY',
      signalCandleTime: time,
      entryPrice: 1.1,
      stopLoss: 1.099,
      takeProfit: 1.102,
      riskBudget: 5,
      estimatedLoss: 1,
      estimatedReward: 2,
      status,
      resolvedAt: time + 300,
      resolutionNote: 'test fixture',
    })
    const metrics = calculateTradeBotReplayPerformance([
      record('target', 'TARGET', 100),
      record('stop', 'STOP', 200),
      record('ambiguous', 'AMBIGUOUS', 300),
      record('pending', 'PENDING', 400),
    ], new Map([['target', 0.2], ['stop', 0.2]]))

    expect(metrics.candidateCount).toBe(4)
    expect(metrics.target).toBe(1)
    expect(metrics.stop).toBe(1)
    expect(metrics.ambiguous).toBe(1)
    expect(metrics.pending).toBe(1)
    expect(metrics.resolvedSampleCount).toBe(2)
    expect(metrics.targetHitRatePercent).toBe(50)
    expect(metrics.netWinRatePercent).toBe(50)
    expect(metrics.netTotalR).toBe(0.6)
    expect(metrics.netExpectancyR).toBe(0.3)
    expect(metrics.netProfitFactor).toBe(1.5)
    expect(metrics.maxDrawdownR).toBe(1.2)
  })

  it('splits a sufficiently long history into a separate chronological holdout', () => {
    const frame = bars(40)
    const result = runTradeBotHistoricalReplay({
      scopeKey: 'scope', symbol: 'EUR/USD', timeframe: 'M5', frames: { M5: frame },
      accountBalance: 1000, accountCurrency: 'USD', symbolSpec: spec,
      estimatedRoundTripCostPips: 1.5,
    })
    expect(result.assumedRoundTripCostPips).toBe(1.5)
    expect(result.outOfSampleStartTime).toBe(frame[28].time)
    expect(result.outOfSample.candidateCount).toBeLessThanOrEqual(result.readyCandidates)
    expect(result.notes.join(' ')).toContain('historical spread or commission')
  })

  it('does not pretend a short history has a separate out-of-sample sample', () => {
    const result = runTradeBotHistoricalReplay({
      scopeKey: 'scope', symbol: 'EUR/USD', timeframe: 'M5', frames: { M5: bars(12) },
      accountBalance: 1000, accountCurrency: 'USD', symbolSpec: spec,
    })
    expect(result.outOfSampleStartTime).toBeNull()
    expect(result.outOfSample.resolvedSampleCount).toBe(0)
  })
})
