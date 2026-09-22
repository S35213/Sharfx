export type TradeSide = 'BUY' | 'SELL'
export type Timeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1' | 'W1'
export const TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1']

export interface OHLCV {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export interface MarketPair {
  symbol: string
  price: number
  change: number
  changePercent: number
  status: 'open' | 'closed'
}

export interface AccountData {
  balance: number
  equity: number
  usedMargin: number
  freeMargin: number
  floatingPL: number
  currency: string
}

export interface SymbolSpec {
  symbol: string
  baseCurrency: string
  quoteCurrency: string
  pipSize: number
  contractSize: number
  minLotSize: number
  maxLotSize: number
  lotStep: number
  pricePrecision: number
}

export interface RiskCalculationInputs {
  accountBalance: number
  accountCurrency: string
  riskPercent: number
  side: TradeSide
  entryPrice: number
  stopLoss: number
  takeProfit: number
  symbolSpec: SymbolSpec
  conversionRate?: number
}

export interface RiskCalculationResult {
  isValid: boolean
  errorMessage?: string
  riskAmount: number
  stopDistancePips: number
  rewardDistancePips: number
  riskRewardRatio: number
  suggestedLotSize: number
  pipValuePerLot: number
  estimatedLossAtStop: number
}

export interface TradeOrder {
  id: string
  symbol: string
  type: TradeSide
  lotSize: number
  entryPrice: number
  stopLoss: number | null
  takeProfit: number | null
  riskPercent: number
  riskAmount: number
  rewardAmount: number
  riskRewardRatio: number
  status: 'open' | 'pending' | 'closed'
  openTime: string
  closeTime?: string
  exitPrice?: number
  profit?: number
}

export type SimulatedOrderDraft = Omit<TradeOrder, 'id' | 'openTime' | 'status'>

export interface MarketAnalysis {
  bias: 'Bullish' | 'Bearish' | 'Neutral'
  structure: { type: string; status: 'Intact' | 'Broken' | 'Developing' }
  liquidity: {
    previousHigh: number | null
    previousLow: number | null
    equalHighs: boolean
    equalLows: boolean
    zones: string[]
  }
  supportResistance: { nearestSupport: number | null; nearestResistance: number | null }
}

export interface AIAnalysis {
  marketBias: string
  structure: string
  liquidity: string
  potentialSetup: string
  invalidation: string
  target: string
  riskReward: string
  confidence: number
  timestamp: string
}

export interface MarketDataSource {
  getWatchlist(): Promise<MarketPair[]>
  getCandles(symbol: string, timeframe: Timeframe, limit?: number): Promise<OHLCV[]>
  getAccountData(): Promise<AccountData>
  getSymbolSpec(symbol: string): Promise<SymbolSpec>
  getMarketAnalysis(symbol: string): Promise<MarketAnalysis>
  getAIAnalysis(symbol: string): Promise<AIAnalysis>
  getOpenPositions(): Promise<TradeOrder[]>
  getPendingOrders(): Promise<TradeOrder[]>
  getTradeHistory(): Promise<TradeOrder[]>
}
