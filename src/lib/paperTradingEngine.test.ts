import { describe, expect, it } from 'vitest'
import type { SignalRadarResult } from '../engine/bot/signalRadar'
import type { SetupCandidate } from '../engine/setup/types'
import { getSymbolSpec } from '../data/mock/symbols'
import { calculateStandardForexPnl, assessPaperOpportunity } from './paperTradingEngine'

const setup = (overrides: Partial<SetupCandidate> = {}): SetupCandidate => ({
  direction: 'BUY',
  status: 'candidate',
  quality: 'strong',
  entryPrice: 1.17,
  stopLoss: 1.1695,
  takeProfit: 1.171,
  riskRewardRatio: 2,
  riskDistance: 0.0005,
  rewardDistance: 0.001,
  confidence: 86,
  rationale: ['test setup'],
  invalidation: 'test',
  liquidityTarget: null,
  ...overrides,
})

const radar = (candidate: SetupCandidate): SignalRadarResult => ({
  opportunities: [],
  dominantBias: 'Bullish',
  alignment: 86,
  scanned: ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'],
  missing: [],
  botPlan: {
    mode: 'FAST_ADAPTIVE',
    opportunity: {
      timeframe: 'M15',
      direction: candidate.direction,
      signalStrength: candidate.confidence,
      state: 'STRONG',
      setup: candidate,
      structure: 'BULLISH',
      liquidity: [],
      higherTimeframeAligned: true,
    },
    analysisTimeframe: 'M15',
    entryTimeframe: 'M5',
    reason: 'test',
  },
})

describe('paperTradingEngine', () => {
  it('calculates conventional EUR/USD lot P/L', () => {
    const pnl = calculateStandardForexPnl({
      direction: 'BUY',
      entryPrice: 1.17,
      currentPrice: 1.171,
      lotSize: 0.1,
      symbolSpec: getSymbolSpec('EUR/USD'),
      accountCurrency: 'USD',
    })
    expect(pnl).toBeCloseTo(10, 6)
  })

  it('accepts a setup with enough target room', () => {
    const result = assessPaperOpportunity(radar(setup()), 1.17, getSymbolSpec('EUR/USD'), {
      mode: 'SHAFX_STANDARD',
      accountCurrency: 'USD',
      lotSize: 0.1,
      stake: 50,
      multiplier: 800,
      minExpectedProfit: 5,
      minRiskReward: 1.5,
      minSignalStrength: 72,
    })
    expect(result.decision).toBe('TRADE')
    expect(result.expectedProfit).toBeCloseTo(10, 6)
    expect(result.riskReward).toBeCloseTo(2, 6)
  })

  it('rejects a tiny target even when direction is valid', () => {
    const result = assessPaperOpportunity(
      radar(setup({ takeProfit: 1.1702, rewardDistance: 0.0002 })),
      1.17,
      getSymbolSpec('EUR/USD'),
      {
        mode: 'SHAFX_STANDARD',
        accountCurrency: 'USD',
        lotSize: 0.1,
        stake: 50,
        multiplier: 800,
        minExpectedProfit: 5,
        minRiskReward: 1.5,
        minSignalStrength: 72,
      },
    )
    expect(result.decision).toBe('WAIT')
    expect(result.reasons.some((reason) => reason.includes('minimum opportunity'))).toBe(true)
  })
})