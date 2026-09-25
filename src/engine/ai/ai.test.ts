import { describe, expect, it } from 'vitest'
import { buildTradingContext } from './context'
import { detectMarketEvents } from './events'
import { buildTradingResponse } from './response'
import { SimulatedNewsSource } from './news'
import type { AITradingContext } from './types'
import type { MarketStructureResult } from '../marketStructure/types'
import type { SupportResistanceResult } from '../supportResistance/types'
import type { LiquidityResult } from '../liquidity/types'
import type { SetupResult } from '../setup/types'

const structure: MarketStructureResult = { bias: 'Bullish', structureType: 'HH/HL', status: 'Intact', swingHighs: [], swingLows: [], recentHigh: 1.105, recentLow: 1.095 }
const sr: SupportResistanceResult = { zones: [], nearestSupport: 1.095, nearestResistance: 1.105 }
const liquidity: LiquidityResult = { pools: [], nearestBuySide: null, nearestSellSide: null }
const noSetup: SetupResult = { candidates: [], preferredSetup: null, currentPrice: 1.1 }

const context = (overrides: Partial<AITradingContext> = {}): AITradingContext => ({ symbol: 'EUR/USD', timeframe: 'H1', currentPrice: 1.1, marketStructure: structure, supportResistance: sr, liquidity, setup: noSetup, recentCandles: [{ time: 1, close: 1.1 }], higherTimeframeBias: null, externalEvents: [], timestamp: 1, dataStatus: 'simulated', ...overrides })

describe('AI Trading Assistant', () => {
  it('builds context from the latest candle', () => {
    const result = buildTradingContext('EUR/USD', 'H1', [{ time: 10, open: 1.099, high: 1.101, low: 1.098, close: 1.1 }], structure, sr, liquidity, noSetup)
    expect(result.currentPrice).toBe(1.1)
    expect(result.timestamp).toBe(10)
    expect(result.dataStatus).toBe('live')
  })

  it('rejects an invalid current price', () => {
    expect(() => buildTradingContext('EUR/USD', 'H1', [], structure, sr, liquidity, { ...noSetup, currentPrice: Number.NaN })).toThrow()
  })

  it('detects structure changes only when a previous context exists', () => {
    const current = context({ marketStructure: { ...structure, bias: 'Bearish', structureType: 'LH/LL' } })
    expect(detectMarketEvents(current, null)).not.toContainEqual(expect.objectContaining({ type: 'STRUCTURE_CHANGED' }))
    expect(detectMarketEvents(current, context())).toContainEqual(expect.objectContaining({ type: 'STRUCTURE_CHANGED' }))
  })

  it('detects a newly swept pool once', () => {
    const pool = { type: 'buy-side' as const, priceRange: { min: 1.104, max: 1.105 }, referencePrice: 1.105, sourceSwings: [], touches: 2, strength: 'moderate' as const, isSwept: false, association: 'equal-highs' as const }
    const previous = context({ liquidity: { pools: [pool], nearestBuySide: null, nearestSellSide: null } })
    const current = context({ liquidity: { pools: [{ ...pool, isSwept: true }], nearestBuySide: null, nearestSellSide: null } })
    expect(detectMarketEvents(current, previous).filter((event) => event.type === 'LIQUIDITY_SWEEPED')).toHaveLength(1)
    expect(detectMarketEvents(current, current).filter((event) => event.type === 'LIQUIDITY_SWEEPED')).toHaveLength(0)
  })

  it('produces deterministic responses', () => {
    const first = buildTradingResponse(context(), [], 'WHAT_IS_HAPPENING')
    const second = buildTradingResponse(context(), [], 'WHAT_IS_HAPPENING')
    expect(first).toEqual(second)
  })

  it('acknowledges that live news is unavailable', () => {
    const response = buildTradingResponse(context(), [], 'WHAT_IS_HAPPENING')
    expect(response.reasoning).toContain('Live economic-news data is not available')
  })

  it('never fabricates a live news event in the simulator source', async () => {
    const news = await new SimulatedNewsSource().getUpcomingEvents('EUR/USD', 100)
    expect(news).toEqual([])
  })

  it('answers liquidity intent from engine output', () => {
    const response = buildTradingResponse(context({ liquidity: { ...liquidity, nearestBuySide: { type: 'buy-side', priceRange: { min: 1.104, max: 1.105 }, referencePrice: 1.105, sourceSwings: [], touches: 2, strength: 'moderate', isSwept: false, association: 'equal-highs' } } }), [], 'WHERE_LIQUIDITY')
    expect(response.reasoning).toContain('Buy-side liquidity')
    expect(response.reasoning).toContain('1.10500')
  })

  it('keeps simulator provenance in the response', () => {
    expect(buildTradingResponse(context({ dataStatus: 'simulated' }), [], 'WHAT_IS_HAPPENING').dataStatus).toBe('simulated')
  })
})
