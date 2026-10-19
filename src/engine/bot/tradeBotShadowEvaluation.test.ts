import { describe, expect, it } from 'vitest'
import type { OHLCV } from '../../types'
import type { SetupCandidate } from '../setup/types'
import {
  advanceTradeBotShadowRecords,
  appendTradeBotShadowRecord,
  createTradeBotShadowRecord,
} from './tradeBotShadowEvaluation'

const setup: SetupCandidate = {
  direction: 'BUY',
  status: 'candidate',
  quality: 'strong',
  entryPrice: 1.1,
  stopLoss: 1.09,
  takeProfit: 1.12,
  riskRewardRatio: 2,
  riskDistance: 0.01,
  rewardDistance: 0.02,
  confidence: 80,
  rationale: ['test fixture'],
  invalidation: 'close below stop',
  liquidityTarget: null,
}

const makeRecord = (overrides: Partial<Parameters<typeof createTradeBotShadowRecord>[0]> = {}) => {
  const record = createTradeBotShadowRecord({
    scopeKey: 'ctrader|connection-a|account-a|demo|EURUSD|M5',
    symbol: 'EUR/USD',
    timeframe: 'M5',
    signalCandleTime: 1_800_000_000_000,
    setup,
    riskBudget: 5,
    estimatedLoss: 4.5,
    estimatedReward: 9,
    ...overrides,
  })
  if (!record) throw new Error('Expected valid shadow record.')
  return record
}

const bar = (time: number, high: number, low: number): OHLCV => ({
  time, open: 1.1, high, low, close: 1.1,
})

describe('Trade Bot shadow evaluation', () => {
  it('rejects invalid source/time/price plans and does not create live orders', () => {
    expect(createTradeBotShadowRecord({
      scopeKey: '', symbol: 'EUR/USD', timeframe: 'M5', signalCandleTime: 1,
      setup, riskBudget: 5, estimatedLoss: 5, estimatedReward: 10,
    })).toBeNull()
    expect(createTradeBotShadowRecord({
      scopeKey: 'scope', symbol: 'EUR/USD', timeframe: 'M5', signalCandleTime: null,
      setup, riskBudget: 5, estimatedLoss: 5, estimatedReward: 10,
    })).toBeNull()
    expect(makeRecord().status).toBe('PENDING')
  })

  it('deduplicates polling for the same account, symbol, timeframe and candle', () => {
    const first = makeRecord()
    const changedSetup = { ...setup, entryPrice: 1.101 }
    const second = makeRecord({ setup: changedSetup })
    expect(second.id).toBe(first.id)
    expect(appendTradeBotShadowRecord([first], second)).toBeInstanceOf(Array)
    expect(appendTradeBotShadowRecord([first], second)).toHaveLength(1)
  })

  it('waits until a candle after the signal candle and resolves a target', () => {
    const record = makeRecord()
    expect(advanceTradeBotShadowRecords([record], { M5: [bar(record.signalCandleTime, 1.13, 1.095), bar(record.signalCandleTime + 300_000, 1.121, 1.095)] })[0].status).toBe('PENDING')
    const result = advanceTradeBotShadowRecords([record], { M5: [
      bar(record.signalCandleTime, 1.13, 1.095),
      bar(record.signalCandleTime + 300_000, 1.121, 1.095),
      bar(record.signalCandleTime + 600_000, 1.115, 1.105),
    ] })
    expect(result[0]).toMatchObject({ status: 'TARGET', resolvedAt: record.signalCandleTime + 300_000 })
  })

  it('resolves a stop for BUY and SELL candidates', () => {
    const buy = makeRecord()
    const buyStop = advanceTradeBotShadowRecords([buy], { M5: [
      bar(buy.signalCandleTime + 300_000, 1.105, 1.089),
      bar(buy.signalCandleTime + 600_000, 1.105, 1.095),
    ] })
    expect(buyStop[0].status).toBe('STOP')

    const sellSetup: SetupCandidate = {
      ...setup, direction: 'SELL', entryPrice: 1.1, stopLoss: 1.11, takeProfit: 1.08,
    }
    const sell = makeRecord({ setup: sellSetup })
    const sellStop = advanceTradeBotShadowRecords([sell], { M5: [
      bar(sell.signalCandleTime + 300_000, 1.111, 1.095),
      bar(sell.signalCandleTime + 600_000, 1.105, 1.095),
    ] })
    expect(sellStop[0].status).toBe('STOP')
  })

  it('marks same-candle stop and target touches ambiguous rather than assuming a win', () => {
    const record = makeRecord()
    const result = advanceTradeBotShadowRecords([record], {
      M5: [
        bar(record.signalCandleTime + 300_000, 1.125, 1.085),
        bar(record.signalCandleTime + 600_000, 1.105, 1.095),
      ],
    })
    expect(result[0].status).toBe('AMBIGUOUS')
    expect(result[0].resolutionNote).toContain('intrabar order is unknown')
  })

  it('keeps resolved records stable and bounds the history', () => {
    const records = [makeRecord()]
    const resolved = advanceTradeBotShadowRecords(records, {
      M5: [bar(records[0].signalCandleTime + 300_000, 1.121, 1.095)],
    })
    const unchanged = advanceTradeBotShadowRecords(resolved, { M5: [bar(records[0].signalCandleTime + 600_000, 1.121, 1.095)] })
    expect(unchanged).toEqual(resolved)

    let bounded = [] as typeof records
    for (let i = 1; i <= 30; i += 1) {
      bounded = appendTradeBotShadowRecord(bounded, makeRecord({
        scopeKey: 'scope-' + i,
        signalCandleTime: 1_800_000_000_000 + i * 300_000,
      }), 8)
    }
    expect(bounded).toHaveLength(8)
  })
})
