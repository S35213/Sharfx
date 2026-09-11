import type { MarketStructureResult } from '../marketStructure/types'
import type { LiquidityResult } from '../liquidity/types'
import type { SupportResistanceResult } from '../supportResistance/types'
import type { SetupResult } from '../setup/types'

export type MarketEventType =
  | 'STRUCTURE_CHANGED'
  | 'NEW_HIGHER_HIGH'
  | 'NEW_LOWER_LOW'
  | 'SUPPORT_APPROACHED'
  | 'RESISTANCE_APPROACHED'
  | 'LIQUIDITY_FORMED'
  | 'LIQUIDITY_SWEEPED'
  | 'BULLISH_SETUP_APPEARED'
  | 'BEARISH_SETUP_APPEARED'
  | 'SETUP_INVALIDATED'
  | 'PRICE_REACHED_TARGET'
  | 'PRICE_REACHED_INVALIDATION'

export interface MarketEvent {
  type: MarketEventType
  description: string
  timestamp: number
  severity: 'info' | 'warning' | 'critical'
}

export interface ExternalEvent {
  id: string
  title: string
  impact: 'low' | 'medium' | 'high'
  timestamp: number
  affectedSymbols: string[]
  isSimulated: boolean
  provider: string
}

export interface MarketEventSource {
  getUpcomingEvents(symbol: string, now?: number): Promise<ExternalEvent[]>
}

export interface AITradingContext {
  symbol: string
  timeframe: string
  currentPrice: number
  marketStructure: MarketStructureResult
  supportResistance: SupportResistanceResult
  liquidity: LiquidityResult
  setup: SetupResult
  recentCandles: Array<{ time: number; close: number }>
  higherTimeframeBias: string | null
  externalEvents: ExternalEvent[]
  timestamp: number
  dataStatus: 'simulated' | 'live'
}

export type UserIntent =
  | 'WHAT_IS_HAPPENING'
  | 'WHY_BULLISH'
  | 'WHY_BEARISH'
  | 'WHERE_LIQUIDITY'
  | 'WHAT_INVALIDATES'
  | 'WHERE_ENTER'
  | 'IS_SETUP'
  | 'WHY_NO_ENTRY'
  | 'WHAT_WATCHING'
  | 'WHAT_CHANGED'
  | 'WHAT_IF_SUPPORT_BREAKS'
  | 'WHAT_IF_RESISTANCE_BREAKS'

export interface AITradingResponse {
  marketState: string
  reasoning: string
  watching: string
  invalidation: string
  setupDetails: string | null
  confidence: number
  riskReward: string | null
  recentEvent: MarketEvent | null
  intent: UserIntent
  dataStatus: 'simulated' | 'live'
}
