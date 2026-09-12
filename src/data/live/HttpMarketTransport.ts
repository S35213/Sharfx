import type { AccountData, AIAnalysis, MarketAnalysis, MarketPair, OHLCV, SymbolSpec, Timeframe, TradeOrder } from '../../types'
import type { LiveMarketTransport } from './LiveMarketDataSource'

export interface MarketApiResponse {
  watchlist: MarketPair[]
  candles: OHLCV[]
  account: AccountData
  symbolSpec: SymbolSpec
  marketAnalysis: MarketAnalysis
  aiAnalysis: AIAnalysis
  openPositions: TradeOrder[]
  pendingOrders: TradeOrder[]
  tradeHistory: TradeOrder[]
}

export interface HttpMarketTransportOptions {
  baseUrl: string
  fetchImpl?: typeof fetch
}

const cleanBaseUrl = (value: string): string => value.replace(/\/$/, '')

const assertBaseUrl = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('A market API base URL is required.')
  const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
  const url = new URL(trimmed, origin)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Market API base URL must use HTTP or HTTPS.')
  return cleanBaseUrl(url.toString())
}

export class HttpMarketTransport implements LiveMarketTransport {
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(options: HttpMarketTransportOptions) {
    this.baseUrl = assertBaseUrl(options.baseUrl)
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
    })
    if (!response.ok) throw new Error(`Market API request failed (${response.status}).`)
    return response.json() as Promise<T>
  }

  async getWatchlist(): Promise<MarketPair[]> { return this.request('/watchlist') }
  async getCandles(symbol: string, timeframe: Timeframe, limit = 300): Promise<OHLCV[]> {
    return this.request(`/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=${limit}`)
  }
  async getAccountData(): Promise<AccountData> { return this.request('/account') }
  async getSymbolSpec(symbol: string): Promise<SymbolSpec> { return this.request(`/symbols/${encodeURIComponent(symbol)}`) }
  async getMarketAnalysis(symbol: string): Promise<MarketAnalysis> { return this.request(`/analysis/${encodeURIComponent(symbol)}`) }
  async getAIAnalysis(symbol: string): Promise<AIAnalysis> { return this.request(`/ai-analysis/${encodeURIComponent(symbol)}`) }
  async getOpenPositions(): Promise<TradeOrder[]> { return this.request('/positions/open') }
  async getPendingOrders(): Promise<TradeOrder[]> { return this.request('/orders/pending') }
  async getTradeHistory(): Promise<TradeOrder[]> { return this.request('/trades/history') }
}
