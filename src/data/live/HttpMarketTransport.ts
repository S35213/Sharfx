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
  timeoutMs?: number
  maxRetries?: number
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

const assertPositiveInteger = (value: number, name: string): number => {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`)
  return value
}

const isRetryableStatus = (status: number): boolean => status >= 500 && status <= 599

export class HttpMarketTransport implements LiveMarketTransport {
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly maxRetries: number

  constructor(options: HttpMarketTransportOptions) {
    this.baseUrl = assertBaseUrl(options.baseUrl)
    this.fetchImpl = options.fetchImpl ?? fetch
    this.timeoutMs = assertPositiveInteger(options.timeoutMs ?? 10_000, 'Request timeout')
    if (!Number.isInteger(options.maxRetries ?? 2) || (options.maxRetries ?? 2) < 0) throw new Error('Maximum retries must be a non-negative integer.')
    this.maxRetries = options.maxRetries ?? 2
  }

  private async request<T>(path: string): Promise<T> {
    let lastError: unknown
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)
      try {
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        })
        if (!response.ok) {
          const error = new Error(`Market API request failed (${response.status}).`)
          if (!isRetryableStatus(response.status)) throw error
          throw Object.assign(error, { retryable: true })
        }
        return await response.json() as T
      } catch (error) {
        lastError = error
        const retryable = error instanceof Error && (error.name === 'AbortError' || 'retryable' in error)
        if (!retryable || attempt === this.maxRetries) break
      } finally {
        clearTimeout(timer)
      }
    }
    if (lastError instanceof Error && lastError.name === 'AbortError') throw new Error(`Market API request timed out after ${this.timeoutMs}ms.`)
    throw lastError instanceof Error ? lastError : new Error('Market API request failed.')
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
