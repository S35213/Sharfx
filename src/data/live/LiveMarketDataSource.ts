import type { AccountData, AIAnalysis, MarketAnalysis, MarketDataSource, MarketPair, OHLCV, SymbolSpec, Timeframe, TradeOrder } from '../../types'

export interface LiveMarketTransport {
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

const assertNonEmpty = (value: unknown, name: string): void => {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${name} returned no usable data.`)
}

const validateCandles = (candles: OHLCV[]): OHLCV[] => {
  if (!Array.isArray(candles) || candles.length === 0) throw new Error('Live market provider returned no candles.')
  for (let i = 0; i < candles.length; i += 1) {
    const candle = candles[i]
    if (![candle.time, candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)) throw new Error('Live market provider returned invalid candle data.')
    if (candle.high < Math.max(candle.open, candle.close) || candle.low > Math.min(candle.open, candle.close) || candle.low > candle.high) throw new Error('Live market provider returned malformed OHLC data.')
    if (i > 0 && candle.time <= candles[i - 1].time) throw new Error('Live market provider returned candles out of chronological order.')
  }
  return candles
}

export class LiveMarketDataSource implements MarketDataSource {
  constructor(private readonly transport: LiveMarketTransport) {}

  async getWatchlist(): Promise<MarketPair[]> {
    const result = await this.transport.getWatchlist()
    if (!Array.isArray(result)) throw new Error('Live market provider returned an invalid watchlist.')
    result.forEach((pair) => assertNonEmpty(pair.symbol, 'Watchlist symbol'))
    return result
  }

  async getCandles(symbol: string, timeframe: Timeframe, limit = 300): Promise<OHLCV[]> {
    assertNonEmpty(symbol, 'Symbol')
    if (!Number.isInteger(limit) || limit < 2) throw new Error('Candle limit must be at least 2.')
    return validateCandles(await this.transport.getCandles(symbol, timeframe, limit))
  }

  async getAccountData(): Promise<AccountData> { return this.transport.getAccountData() }
  async getSymbolSpec(symbol: string): Promise<SymbolSpec> { assertNonEmpty(symbol, 'Symbol'); return this.transport.getSymbolSpec(symbol) }
  async getMarketAnalysis(symbol: string): Promise<MarketAnalysis> { assertNonEmpty(symbol, 'Symbol'); return this.transport.getMarketAnalysis(symbol) }
  async getAIAnalysis(symbol: string): Promise<AIAnalysis> { assertNonEmpty(symbol, 'Symbol'); return this.transport.getAIAnalysis(symbol) }
  async getOpenPositions(): Promise<TradeOrder[]> { return this.transport.getOpenPositions() }
  async getPendingOrders(): Promise<TradeOrder[]> { return this.transport.getPendingOrders() }
  async getTradeHistory(): Promise<TradeOrder[]> { return this.transport.getTradeHistory() }
}
