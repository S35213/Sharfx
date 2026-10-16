import { describe, expect, it } from 'vitest'
import { getSymbolSpec } from '../../data/mock/symbols'
import type { OHLCV } from '../../types'
import type { TradeBotDecision } from './tradeBotDecision'
import { buildTradeBotDiagnosticSnapshot, type TradeBotDiagnosticInput } from './tradeBotDiagnostics'

const NOW = 1_800_000_000_000
const source = { providerId: 'ctrader', connectionId: 'connection-12345678', accountId: 'account-12345678', environment: 'demo' as const }
const symbolSpec = getSymbolSpec('EUR/USD')
const candles: OHLCV[] = Array.from({ length: 8 }, (_, index) => ({
  time: Math.floor(NOW / 1000) - (8 - index) * 300,
  open: 1.1,
  high: 1.102,
  low: 1.099,
  close: 1.101,
  volume: 10,
}))

const readyDecision: TradeBotDecision = {
  status: 'READY',
  reason: 'Setup and initial risk checks passed.',
  setup: {
    direction: 'BUY',
    entryPrice: 1.101,
    stopLoss: 1.1,
    takeProfit: 1.103,
    confidence: 84,
  } as unknown as TradeBotDecision['setup'],
  timeframe: 'M5',
  riskBudget: 5,
  riskPlan: {
    valid: true,
    entryPrice: 1.101,
    stopLossPrice: 1.1,
    takeProfitPrice: 1.103,
    stopDistancePips: 10,
    targetDistancePips: 20,
    riskRewardRatio: 2,
    requestedRiskAmount: 5,
    riskPercent: 0.5,
    pipValuePerLot: 10,
    lotSize: 0.05,
    notionalValue: 5500,
    estimatedLossAtStop: 5,
    estimatedRewardAtTarget: 10,
    estimatedMargin: 100,
  },
  higherTimeframeBias: 'Bullish',
}

const baseInput = (overrides: Partial<TradeBotDiagnosticInput> = {}): TradeBotDiagnosticInput => ({
  source,
  symbol: 'EUR/USD',
  timeframe: 'M5',
  frames: { M5: candles },
  marketStatus: 'ready',
  marketUpdatedAt: NOW,
  accountBalance: 1000,
  accountCurrency: 'USD',
  symbolSpec,
  decision: readyDecision,
  nowMs: NOW,
  ...overrides,
})

describe('Trade Bot diagnostics', () => {
  it('marks a fully satisfied analysis as ready for manual review only', () => {
    const result = buildTradeBotDiagnosticSnapshot(baseInput())
    expect(result.summary).toBe('READY_FOR_REVIEW')
    expect(result.sourceAllowed).toBe(true)
    expect(result.enoughCandles).toBe(true)
    expect(result.marketFresh).toBe(true)
    expect(result.brokerSpec.matchesSymbol).toBe(true)
    expect(result.riskWithinBudget).toBe(true)
    expect(result.rewardRatioPassed).toBe(true)
  })

  it('blocks live accounts and does not downgrade to another provider', () => {
    const result = buildTradeBotDiagnosticSnapshot(baseInput({
      source: { ...source, environment: 'live' },
    }))
    expect(result.summary).toBe('BLOCKED')
    expect(result.sourceAllowed).toBe(false)
    expect(result.gates.find((gate) => gate.id === 'source')?.detail).toContain('Live')
  })

  it('waits when there are too few candles or the market refresh is stale', () => {
    const tooFew = buildTradeBotDiagnosticSnapshot(baseInput({ frames: { M5: candles.slice(0, 4) } }))
    expect(tooFew.summary).toBe('WAITING')
    expect(tooFew.enoughCandles).toBe(false)

    const stale = buildTradeBotDiagnosticSnapshot(baseInput({ marketUpdatedAt: NOW - 60_000 }))
    expect(stale.summary).toBe('WAITING')
    expect(stale.marketFresh).toBe(false)
  })

  it('blocks incomplete or mismatched broker metadata rather than accepting a fallback spec', () => {
    const missing = buildTradeBotDiagnosticSnapshot(baseInput({ symbolSpec: null }))
    expect(missing.summary).toBe('BLOCKED')
    expect(missing.brokerSpec.available).toBe(false)

    const mismatch = buildTradeBotDiagnosticSnapshot(baseInput({ symbolSpec: getSymbolSpec('GBP/USD') }))
    expect(mismatch.summary).toBe('BLOCKED')
    expect(mismatch.brokerSpec.matchesSymbol).toBe(false)
  })

  it('reports the exact candle time, loaded frames, and risk values', () => {
    const result = buildTradeBotDiagnosticSnapshot(baseInput({ frames: { M5: candles, H1: candles.slice(0, 7) } }))
    expect(result.candleCount).toBe(8)
    expect(result.lastCandleAt).toBe(new Date(candles[7].time * 1000).toISOString())
    expect(result.loadedTimeframes).toEqual(['M5'])
    expect(result.riskRewardRatio).toBe(2)
    expect(result.lots).toBe(0.05)
    expect(result.gates).toHaveLength(8)
  })

  it('does not report review-ready when decision risk exceeds the cap or RR fails', () => {
    const overRisk = {
      ...readyDecision,
      riskPlan: { ...readyDecision.riskPlan!, estimatedLossAtStop: 9 },
    }
    expect(buildTradeBotDiagnosticSnapshot(baseInput({ decision: overRisk })).summary).toBe('WAITING')

    const lowRR = {
      ...readyDecision,
      riskPlan: { ...readyDecision.riskPlan!, riskRewardRatio: 1.2 },
    }
    expect(buildTradeBotDiagnosticSnapshot(baseInput({ decision: lowRR })).summary).toBe('WAITING')
  })
})
