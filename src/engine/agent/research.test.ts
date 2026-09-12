import { describe, expect, it } from 'vitest'
import { buildAgentResearch } from './research'
import type { AITradingContext } from '../ai/types'

const context = { symbol: 'EURUSD', timeframe: 'H1', currentPrice: 1.1, marketStructure: { bias: 'Bullish', status: 'Intact', structureType: 'HH/HL', swingHighs: [], swingLows: [], recentHigh: 1.11, recentLow: 1.09 }, supportResistance: { zones: [], nearestSupport: 1.09, nearestResistance: 1.12 }, liquidity: { pools: [], nearestBuySide: null, nearestSellSide: null }, setup: { candidates: [], preferredSetup: null, currentPrice: 1.1 }, recentCandles: [], higherTimeframeBias: null, externalEvents: [], timestamp: 1, dataStatus: 'simulated' } as unknown as AITradingContext

describe('buildAgentResearch', () => {
  it('aggregates validated internal evidence', () => {
    const report = buildAgentResearch({ context })
    expect(report.evidence.length).toBeGreaterThan(0)
    expect(report.agreement).toBeGreaterThan(0)
  })

  it('flags strong higher-timeframe contradiction', () => {
    const report = buildAgentResearch({ context, multiTimeframe: { dominantBias: 'Bearish', confidence: 80, aligned: false } })
    expect(report.contradictions.length).toBe(1)
    expect(report.conclusion).toContain('waiting')
  })
})
