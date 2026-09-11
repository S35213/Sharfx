import type { AIAnalysis, MarketAnalysis } from '../../types'

const MARKET_BY_SYMBOL: Record<string, MarketAnalysis> = {
  'EUR/USD': { bias: 'Bullish', structure: { type: 'HH/HL', status: 'Intact' }, liquidity: { previousHigh: 1.0875, previousLow: 1.0812, equalHighs: false, equalLows: true, zones: ['1.08100 - 1.08150 (Demand)', '1.08700 - 1.08800 (Supply)'] }, supportResistance: { nearestSupport: 1.0835, nearestResistance: 1.0875 } },
  'GBP/USD': { bias: 'Bearish', structure: { type: 'LH/LL', status: 'Intact' }, liquidity: { previousHigh: 1.2675, previousLow: 1.2598, equalHighs: true, equalLows: false, zones: ['1.25950 - 1.26000 (Demand)', '1.26700 - 1.26750 (Supply)'] }, supportResistance: { nearestSupport: 1.2598, nearestResistance: 1.2675 } },
  'USD/JPY': { bias: 'Neutral', structure: { type: 'Consolidation', status: 'Intact' }, liquidity: { previousHigh: 150.25, previousLow: 149.1, equalHighs: false, equalLows: false, zones: ['149.00 - 149.20 (Demand)', '150.20 - 150.40 (Supply)'] }, supportResistance: { nearestSupport: 149.1, nearestResistance: 150.25 } },
}

const AI_BY_SYMBOL: Record<string, AIAnalysis> = {
  'EUR/USD': { marketBias: 'Bullish', structure: 'Higher highs and higher lows established on H1.', liquidity: 'Buy-side liquidity resting above previous high at 1.08750.', potentialSetup: 'Pullback toward support (1.08350) with bullish rejection.', invalidation: 'Close below structural low at 1.08100.', target: 'Previous liquidity zone at 1.08750.', riskReward: '1:2.5', confidence: 78, timestamp: '2024-01-15T12:00:00Z' },
  'GBP/USD': { marketBias: 'Bearish', structure: 'Lower highs and lower lows intact on H1.', liquidity: 'Sell-side liquidity below prior low at 1.25980.', potentialSetup: 'Retest of resistance zone (1.26700) with rejection.', invalidation: 'Close above structural high at 1.26800.', target: 'Prior low liquidity at 1.25980.', riskReward: '1:2.0', confidence: 71, timestamp: '2024-01-15T12:00:00Z' },
  'USD/JPY': { marketBias: 'Neutral', structure: 'Consolidation on H1, awaiting directional break.', liquidity: 'Balanced liquidity above 150.25 and below 149.10.', potentialSetup: 'Range fade, buy 149.10, sell 150.25.', invalidation: 'Sustained break of range boundaries.', target: 'Opposite boundary of range.', riskReward: '1:1.5', confidence: 60, timestamp: '2024-01-15T12:00:00Z' },
}

const DEFAULT_MARKET = MARKET_BY_SYMBOL['EUR/USD']
const DEFAULT_AI = AI_BY_SYMBOL['EUR/USD']

export const getMockMarketAnalysis = (symbol: string): MarketAnalysis => MARKET_BY_SYMBOL[symbol] ?? DEFAULT_MARKET
export const getMockAIAnalysis = (symbol: string): AIAnalysis => AI_BY_SYMBOL[symbol] ?? DEFAULT_AI
