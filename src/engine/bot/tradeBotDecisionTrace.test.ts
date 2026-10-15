import { describe, expect, it } from 'vitest'
import {
  appendTradeBotDecisionTrace,
  createTradeBotDecisionTraceEntry,
  type TradeBotDecisionTraceEntry,
} from './tradeBotDecisionTrace'

const diagnostics = {
  decisionStatus: 'READY' as const,
  decisionReason: 'Setup and initial risk checks passed.',
  higherTimeframeBias: 'Bullish' as const,
  candleCount: 8,
  lastCandleAt: '2026-10-15T14:30:00.000Z',
  marketAgeSeconds: 1,
  riskBudget: 5,
  lots: 0.05,
  estimatedLoss: 4.9,
  riskRewardRatio: 2,
  brokerSpec: {
    available: true,
    matchesSymbol: true,
    contractSize: 100000,
    pipSize: 0.0001,
    pricePrecision: 5,
    minLotSize: 0.01,
    maxLotSize: 100,
    lotStep: 0.01,
  },
}

const makeEntry = (
  observedAt: number,
  overrides: Partial<Parameters<typeof createTradeBotDecisionTraceEntry>[0]> = {},
): TradeBotDecisionTraceEntry => {
  const entry = createTradeBotDecisionTraceEntry({
    scopeKey: 'ctrader|connection-a|account-a|demo|EURUSD|M5',
    symbol: 'EUR/USD',
    timeframe: 'M5',
    marketUpdatedAt: observedAt,
    candleTime: 1_800_000_000,
    diagnostics,
    ...overrides,
  })
  if (!entry) throw new Error('Expected the valid market observation to produce a trace entry.')
  return entry
}

describe('Trade Bot decision trace', () => {
  it('captures decision reason, candle timing, bias and risk values', () => {
    const entry = makeEntry(1_800_000_000_000)
    expect(entry.status).toBe('READY')
    expect(entry.reason).toContain('risk checks')
    expect(entry.candleAt).toBe(diagnostics.lastCandleAt)
    expect(entry.riskBudget).toBe(5)
    expect(entry.estimatedLoss).toBe(4.9)
    expect(entry.brokerSpecIdentity).toContain('100000')
  })

  it('refuses entries without a successful refresh timestamp or source scope', () => {
    expect(createTradeBotDecisionTraceEntry({
      scopeKey: 'scope',
      symbol: 'EUR/USD',
      timeframe: 'M5',
      marketUpdatedAt: null,
      candleTime: null,
      diagnostics,
    })).toBeNull()
    expect(createTradeBotDecisionTraceEntry({
      scopeKey: ' ',
      symbol: 'EUR/USD',
      timeframe: 'M5',
      marketUpdatedAt: 1_800_000_000_000,
      candleTime: null,
      diagnostics,
    })).toBeNull()
  })

  it('deduplicates repeated effect runs for the same source/cycle identity', () => {
    const first = makeEntry(1_800_000_000_000)
    const repeated = makeEntry(1_800_000_000_000)
    const once = appendTradeBotDecisionTrace([], first)
    const twice = appendTradeBotDecisionTrace(once, repeated)
    expect(twice).toBe(once)
    expect(twice).toHaveLength(1)
  })

  it('keeps observations from another account or timeframe separately scoped', () => {
    const first = makeEntry(1_800_000_000_000)
    const second = makeEntry(1_800_000_000_000, {
      scopeKey: 'ctrader|connection-b|account-b|demo|EURUSD|M5',
    })
    const third = makeEntry(1_800_000_000_000, {
      scopeKey: 'ctrader|connection-a|account-a|demo|EURUSD|H1',
      timeframe: 'H1',
    })
    expect(first.id).not.toBe(second.id)
    expect(first.id).not.toBe(third.id)
    expect(appendTradeBotDecisionTrace([first], second)).toHaveLength(2)
    expect(appendTradeBotDecisionTrace([first], third)).toHaveLength(2)
  })

  it('keeps newest observations first and enforces the bounded history size', () => {
    const entries: TradeBotDecisionTraceEntry[] = []
    for (let i = 1; i <= 5; i += 1) {
      const next = makeEntry(1_800_000_000_000 + i * 15_000, {
        candleTime: 1_800_000_000 + i * 300,
      })
      entries.splice(0, entries.length, ...appendTradeBotDecisionTrace(entries, next, 3))
    }
    expect(entries).toHaveLength(3)
    expect(entries[0].observedAt).toBe(1_800_000_000_000 + 5 * 15_000)
    expect(entries[2].observedAt).toBe(1_800_000_000_000 + 3 * 15_000)
  })
})
