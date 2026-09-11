import type { AccountData, AIAnalysis, MarketAnalysis, MarketDataSource, MarketPair, OHLCV, SymbolSpec, Timeframe, TradeOrder } from '../../types'
import { mockWatchlist } from './watchlist'
import { mockAccountData } from './account'
import { getMockCandles } from './candles'
import { SYMBOL_SPECS } from './symbols'
import { getMockMarketAnalysis, getMockAIAnalysis } from './analysis'
import { mockOpenPositions, mockPendingOrders, mockTradeHistory } from './trades'

export class MockDataSource implements MarketDataSource {
  async getWatchlist(): Promise<MarketPair[]> { return mockWatchlist }
  async getCandles(symbol: string, timeframe: Timeframe, limit = 300): Promise<OHLCV[]> { return getMockCandles(symbol, timeframe, limit) }
  async getAccountData(): Promise<AccountData> { return mockAccountData }
  async getSymbolSpec(symbol: string): Promise<SymbolSpec> { return SYMBOL_SPECS[symbol] ?? SYMBOL_SPECS['EUR/USD'] }
  async getMarketAnalysis(symbol: string): Promise<MarketAnalysis> { return getMockMarketAnalysis(symbol) }
  async getAIAnalysis(symbol: string): Promise<AIAnalysis> { return getMockAIAnalysis(symbol) }
  async getOpenPositions(): Promise<TradeOrder[]> { return mockOpenPositions }
  async getPendingOrders(): Promise<TradeOrder[]> { return mockPendingOrders }
  async getTradeHistory(): Promise<TradeOrder[]> { return mockTradeHistory }
}

export const marketDataSource: MarketDataSource = new MockDataSource()
