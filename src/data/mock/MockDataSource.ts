import type { AccountData, AIAnalysis, MarketAnalysis, MarketDataSource, MarketPair, OHLCV, SymbolSpec, Timeframe, TradeOrder } from '../../types'
import { mockWatchlist } from './watchlist'
import { mockAccountData } from './account'
import { getMockCandles } from './candles'
import { SYMBOL_SPECS } from './symbols'
import { getMockMarketAnalysis, getMockAIAnalysis } from './analysis'
import { mockOpenPositions, mockPendingOrders, mockTradeHistory } from './trades'
import { getDemoAccountData, getDemoOpenPositions, getDemoTradeHistory } from '../../engine/simulator/accountStore'

interface BrokerAccount { account_id?: string; account_type?: string; balance?: number; currency?: string }

const brokerMode = (): boolean => typeof window !== 'undefined' && window.sessionStorage.getItem('shafx-trading-mode') === 'broker'

const readSelectedBrokerAccount = async (): Promise<BrokerAccount | null> => {
  try {
    if (typeof window === 'undefined') return null
    const raw = window.sessionStorage.getItem('shafx-active-provider-selection')
    const selected = raw ? JSON.parse(raw) as { providerId?: string; connectionId?: string; accountId?: string; environment?: 'demo' | 'live' } : null
    if (!selected?.providerId || !selected.connectionId || !selected.accountId) return null

    const response = await fetch('/api/providers/connections', { credentials: 'include', cache: 'no-store' })
    if (!response.ok) return null
    const result = await response.json() as { ok?: boolean; connections?: Array<{ id?: string; providerId?: string; accounts?: BrokerAccount[] }> }
    const connection = result.connections?.find((item) => item.id === selected.connectionId && item.providerId === selected.providerId)
    return connection?.accounts?.find((item) => item.account_id === selected.accountId || (item as { providerAccountId?: string }).providerAccountId === selected.accountId) ?? null
  } catch { return null }
}

const readDerivAccountFallback = async (): Promise<BrokerAccount | null> => {
  try {
    const response = await fetch('/api/deriv/accounts', { credentials: 'include', cache: 'no-store' })
    if (!response.ok) return null
    const result = await response.json() as { connected?: boolean; data?: unknown }
    if (!result.connected) return null
    const payload = result.data as { data?: unknown } | unknown
    const accounts: BrokerAccount[] = Array.isArray(payload) ? payload as BrokerAccount[] : Array.isArray((payload as { data?: unknown })?.data) ? (payload as { data: BrokerAccount[] }).data : typeof (payload as BrokerAccount)?.account_type === 'string' ? [payload as BrokerAccount] : []
    return accounts[0] ?? null
  } catch { return null }
}

export class MockDataSource implements MarketDataSource {
  async getWatchlist(): Promise<MarketPair[]> { return mockWatchlist }
  async getCandles(symbol: string, timeframe: Timeframe, limit = 300): Promise<OHLCV[]> { return getMockCandles(symbol, timeframe, limit) }
  async getAccountData(): Promise<AccountData> {
    const demo = getDemoAccountData(mockAccountData)
    if (!brokerMode()) return demo
    const selected = await readSelectedBrokerAccount()
    const account = selected ?? await readDerivAccountFallback()
    if (!account || typeof account.balance !== 'number' || !Number.isFinite(account.balance)) return { ...demo, balance: 0, equity: 0, freeMargin: 0, floatingPL: 0, currency: account?.currency ?? 'USD' }
    const balance = Number(account.balance.toFixed(2))
    return { ...demo, balance, equity: balance, freeMargin: balance, floatingPL: 0, currency: account.currency ?? 'USD' }
  }
  async getSymbolSpec(symbol: string): Promise<SymbolSpec> { return SYMBOL_SPECS[symbol] ?? SYMBOL_SPECS['EUR/USD'] }
  async getMarketAnalysis(symbol: string): Promise<MarketAnalysis> { return getMockMarketAnalysis(symbol) }
  async getAIAnalysis(symbol: string): Promise<AIAnalysis> { return getMockAIAnalysis(symbol) }
  async getOpenPositions(): Promise<TradeOrder[]> { return brokerMode() ? [] : getDemoOpenPositions(mockOpenPositions) }
  async getPendingOrders(): Promise<TradeOrder[]> { return brokerMode() ? [] : mockPendingOrders }
  async getTradeHistory(): Promise<TradeOrder[]> { return brokerMode() ? [] : getDemoTradeHistory(mockTradeHistory) }
}

export const marketDataSource: MarketDataSource = new MockDataSource()
