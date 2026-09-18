import type {
  ProviderAccountSnapshot, ProviderAdapter, ProviderCandle, ProviderConnection, ProviderInstrument,
  ProviderNormalizedError, ProviderOrderResult, ProviderPosition, ProviderQuote, ProviderStreamEvent, ProviderStreamHandle,
} from '../core/types'
import { validateProviderConnection } from '../core/providerConnectionGuard'
import { OANDA_PROVIDER_DESCRIPTOR } from './descriptor'

const supportedTimeframes = new Set(['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'])

const assertConnection = (connection: ProviderConnection): void => {
  const result = validateProviderConnection({ descriptor: OANDA_PROVIDER_DESCRIPTOR }, connection)
  if (!result.allowed) throw new Error(result.reason || 'Invalid OANDA connection.')
}

const requireAccount = (accountId: string | undefined): string => {
  if (!accountId) throw new Error('An OANDA account is required for this operation.')
  return accountId
}

const api = async (connection: ProviderConnection, accountId: string, action: string, extra: Record<string, string> = {}): Promise<any> => {
  const query = new URLSearchParams({ action, connectionId: connection.connectionId, accountId, ...extra })
  const response = await fetch('/api/oanda/data?' + query.toString(), { credentials: 'include', cache: 'no-store' })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload?.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'OANDA provider request failed.')
  return payload
}

const normalizeAccount = (account: any): ProviderAccountSnapshot => ({
  accountId: String(account.accountId), accountLabel: typeof account.accountLabel === 'string' ? account.accountLabel : String(account.accountId),
  environment: account.environment === 'demo' ? 'demo' : 'live', currency: String(account.currency || ''), balance: Number(account.balance || 0),
  equity: account.equity == null ? undefined : Number(account.equity), usedMargin: account.usedMargin == null ? undefined : Number(account.usedMargin),
  freeMargin: account.freeMargin == null ? undefined : Number(account.freeMargin), floatingPL: account.floatingPL == null ? undefined : Number(account.floatingPL),
})

const normalizeQuote = (quote: any): ProviderQuote => ({
  symbol: String(quote.symbol), bid: quote.bid == null ? undefined : Number(quote.bid), ask: quote.ask == null ? undefined : Number(quote.ask),
  last: quote.last == null ? undefined : Number(quote.last), timestamp: String(quote.timestamp),
})

const normalizeCandle = (candle: any): ProviderCandle => ({
  symbol: String(candle.symbol), timeframe: String(candle.timeframe), openTime: String(candle.openTime),
  closeTime: candle.closeTime == null ? undefined : String(candle.closeTime), open: Number(candle.open), high: Number(candle.high),
  low: Number(candle.low), close: Number(candle.close), volume: candle.volume == null ? undefined : Number(candle.volume),
})

const networkError = (message: string): ProviderNormalizedError => ({ code: 'NETWORK_ERROR', message, retryable: true })

export const OANDA_PROVIDER_ADAPTER: ProviderAdapter = {
  descriptor: OANDA_PROVIDER_DESCRIPTOR,
  async getAccounts(connection): Promise<ProviderAccountSnapshot[]> {
    assertConnection(connection)
    const response = await fetch('/api/oanda/data?action=accounts&connectionId=' + encodeURIComponent(connection.connectionId), { credentials: 'include', cache: 'no-store' })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload?.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'Unable to load OANDA accounts.')
    return Array.isArray(payload.accounts) ? payload.accounts.map(normalizeAccount) : []
  },
  async getAccountSnapshot(connection, accountId): Promise<ProviderAccountSnapshot> {
    assertConnection(connection); const payload = await api(connection, requireAccount(accountId), 'account'); return normalizeAccount(payload.account)
  },
  async getPositions(connection, accountId): Promise<ProviderPosition[]> {
    assertConnection(connection); const payload = await api(connection, requireAccount(accountId), 'positions')
    return Array.isArray(payload.positions) ? payload.positions.map((position: any) => ({ ...position, quantity: Number(position.quantity), entryPrice: Number(position.entryPrice), unrealizedPL: position.unrealizedPL == null ? undefined : Number(position.unrealizedPL) })) : []
  },
  async getOrders(connection, accountId): Promise<ProviderOrderResult[]> {
    assertConnection(connection); const payload = await api(connection, requireAccount(accountId), 'orders'); return Array.isArray(payload.orders) ? payload.orders : []
  },
  async getInstruments(connection, accountId): Promise<ProviderInstrument[]> {
    assertConnection(connection); const payload = await api(connection, requireAccount(accountId), 'instruments'); return Array.isArray(payload.instruments) ? payload.instruments : []
  },
  async getQuote(connection, accountId, symbol): Promise<ProviderQuote> {
    assertConnection(connection); const payload = await api(connection, requireAccount(accountId), 'quote', { symbol }); return normalizeQuote(payload.quote)
  },
  async getHistoricalCandles(connection, accountId, symbol, timeframe, limit = 200): Promise<ProviderCandle[]> {
    assertConnection(connection); if (!supportedTimeframes.has(timeframe)) throw new Error('Unsupported OANDA timeframe: ' + timeframe)
    const payload = await api(connection, requireAccount(accountId), 'candles', { symbol, timeframe, limit: String(limit) })
    return Array.isArray(payload.candles) ? payload.candles.map(normalizeCandle) : []
  },
  async subscribe(connection, accountId, symbols, onEvent, timeframe = 'M5'): Promise<ProviderStreamHandle> {
    assertConnection(connection); if (symbols.length !== 1) throw new Error('The current OANDA market adapter accepts exactly one symbol per stream.')
    if (!supportedTimeframes.has(timeframe)) throw new Error('Unsupported OANDA timeframe: ' + timeframe)
    const symbol = symbols[0]; const account = requireAccount(accountId); let closed = false; let candles: ProviderCandle[] = []
    try {
      candles = await OANDA_PROVIDER_ADAPTER.getHistoricalCandles!(connection, account, symbol, timeframe, 200)
      const quote = await OANDA_PROVIDER_ADAPTER.getQuote!(connection, account, symbol)
      onEvent({ type: 'market_snapshot', snapshot: { symbol, timeframe, candles, quote } })
    } catch (error) {
      onEvent({ type: 'error', error: networkError(error instanceof Error ? error.message : 'OANDA market-data request failed.') })
    }
    const bucketMsMap: Record<string, number> = { M1: 60000, M5: 300000, M15: 900000, M30: 1800000, H1: 3600000, H4: 14400000, D1: 86400000 }
    const bucketMs = bucketMsMap[timeframe]
    const timer = globalThis.setInterval(async () => {
      if (closed) return
      try {
        const quote = await OANDA_PROVIDER_ADAPTER.getQuote!(connection, account, symbol); const last = quote.last ?? quote.ask ?? quote.bid; if (last === undefined) return
        const bucket = Math.floor(Date.now() / bucketMs) * bucketMs; const current = candles[candles.length - 1]
        if (!current || Date.parse(current.openTime) !== bucket) candles = [...candles, { symbol, timeframe, openTime: new Date(bucket).toISOString(), open: last, high: last, low: last, close: last }].slice(-300)
        else candles = [...candles.slice(0, -1), { ...current, high: Math.max(current.high, last), low: Math.min(current.low, last), close: last }]
        onEvent({ type: 'market_snapshot', snapshot: { symbol, timeframe, candles, quote } })
      } catch (error) {
        onEvent({ type: 'error', error: networkError(error instanceof Error ? error.message : 'OANDA market stream failed.') })
      }
    }, 1000)
    return {
      streamId: connection.connectionId + ':' + account + ':' + symbol + ':' + timeframe + ':' + Date.now(),
      close: async () => { closed = true; globalThis.clearInterval(timer) },
    }
  },
  async subscribeAccount(connection, accountId, onEvent): Promise<ProviderStreamHandle> {
    assertConnection(connection); const account = requireAccount(accountId); let closed = false
    const poll = async (): Promise<void> => {
      if (closed) return
      try { const snapshot = await OANDA_PROVIDER_ADAPTER.getAccountSnapshot!(connection, account); onEvent({ type: 'account', account: snapshot }) }
      catch (error) { onEvent({ type: 'error', error: networkError(error instanceof Error ? error.message : 'OANDA account update failed.') }) }
    }
    await poll(); const timer = globalThis.setInterval(() => { void poll() }, 5000)
    return { streamId: connection.connectionId + ':' + account + ':' + Date.now(), close: async () => { closed = true; globalThis.clearInterval(timer) } }
  },
}

export default OANDA_PROVIDER_ADAPTER
