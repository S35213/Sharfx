import type {
  ProviderAccountSnapshot, ProviderAdapter, ProviderCandle, ProviderConnection, ProviderInstrument,
  ProviderOrderResult, ProviderPosition, ProviderQuote, ProviderStreamHandle,
} from '../core/types'
import { validateProviderConnection } from '../core/providerConnectionGuard'
import { createProviderRateLimiter } from '../core/providerRateLimiter'
import { symbolMappingRegistry } from '../core/symbolMapping'
import { BINANCE_PROVIDER_DESCRIPTOR } from './descriptor'

const timeframeMap: Record<string, string> = {
  M1: '1m', M5: '5m', M15: '15m', M30: '30m', H1: '1h', H4: '4h', D1: '1d',
}

const assertConnection = (connection: ProviderConnection): void => {
  const result = validateProviderConnection({ descriptor: BINANCE_PROVIDER_DESCRIPTOR }, connection)
  if (!result.allowed) throw new Error(result.reason || 'Invalid Binance connection.')
}

const api = async (connection: ProviderConnection, accountId: string | undefined, action: string, extra: Record<string, string> = {}): Promise<Record<string, unknown>> => {
  const query = new URLSearchParams({ action, connectionId: connection.connectionId, ...(accountId ? { accountId } : {}), ...extra })
  await requestLimiter.acquire('binance:' + connection.connectionId)
  const response = await fetch('/api/providers/connections?providerId=binance&' + query.toString(), { credentials: 'include', cache: 'no-store' })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload?.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'Binance provider request failed.')
  return payload
}

const normalizeInputSymbol = (symbol: string): string => {
  const mapped = symbolMappingRegistry.mapToProvider('binance', symbol)
  if (mapped) return mapped.providerSymbol
  return symbol.trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

const normalizeQuote = (value: unknown, fallback: string): ProviderQuote => {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    symbol: String(row.symbol || fallback),
    bid: row.bid == null ? undefined : Number(row.bid),
    ask: row.ask == null ? undefined : Number(row.ask),
    last: row.last == null ? undefined : Number(row.last),
    timestamp: String(row.timestamp || new Date().toISOString()),
  }
}

const normalizeCandle = (value: unknown): ProviderCandle => {
  const row = value as Record<string, unknown>
  return {
    symbol: String(row.symbol || ''),
    timeframe: String(row.timeframe || ''),
    openTime: String(row.openTime || ''),
    closeTime: row.closeTime == null ? undefined : String(row.closeTime),
    open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close),
    volume: row.volume == null ? undefined : Number(row.volume),
  }
}

const requestLimiter = createProviderRateLimiter({ requestsPerSecond: BINANCE_PROVIDER_DESCRIPTOR.rateLimit?.requestsPerSecond || 10 })

export const BINANCE_PROVIDER_ADAPTER: ProviderAdapter = {
  descriptor: BINANCE_PROVIDER_DESCRIPTOR,
  async getAccounts(connection): Promise<ProviderAccountSnapshot[]> {
    assertConnection(connection)
    const payload = await api(connection, undefined, 'accounts')
    return Array.isArray(payload.accounts) ? payload.accounts as ProviderAccountSnapshot[] : []
  },
  async getAccountSnapshot(connection, accountId): Promise<ProviderAccountSnapshot> {
    assertConnection(connection)
    const payload = await api(connection, accountId, 'account')
    return payload.account as ProviderAccountSnapshot
  },
  async getOrders(connection, accountId): Promise<ProviderOrderResult[]> {
    assertConnection(connection)
    const payload = await api(connection, accountId, 'orders')
    return Array.isArray(payload.orders) ? payload.orders as ProviderOrderResult[] : []
  },
  async getPositions(_connection, _accountId): Promise<ProviderPosition[]> { return [] },
  async getInstruments(connection): Promise<ProviderInstrument[]> {
    assertConnection(connection)
    const payload = await api(connection, undefined, 'instruments')
    return Array.isArray(payload.instruments) ? payload.instruments as ProviderInstrument[] : []
  },
  async getQuote(connection, accountId, symbol): Promise<ProviderQuote> {
    assertConnection(connection)
    const providerSymbol = normalizeInputSymbol(symbol)
    const payload = await api(connection, accountId, 'quote', { symbol: providerSymbol })
    return normalizeQuote(payload.quote, symbol)
  },
  async getHistoricalCandles(connection, accountId, symbol, timeframe, limit = 200): Promise<ProviderCandle[]> {
    assertConnection(connection)
    const interval = timeframeMap[timeframe]
    if (!interval) throw new Error('Unsupported Binance timeframe: ' + timeframe)
    const providerSymbol = normalizeInputSymbol(symbol)
    const payload = await api(connection, accountId, 'candles', { symbol: providerSymbol, timeframe, interval, limit: String(limit) })
    return Array.isArray(payload.candles) ? payload.candles.map(normalizeCandle) : []
  },
  async subscribe(connection, accountId, symbols, onEvent, timeframe = 'M5'): Promise<ProviderStreamHandle> {
    assertConnection(connection)
    if (symbols.length !== 1) throw new Error('The current Binance market adapter accepts exactly one symbol per stream.')
    const interval = timeframeMap[timeframe]
    if (!interval) throw new Error('Unsupported Binance timeframe: ' + timeframe)
    const symbol = symbols[0]
    const providerSymbol = normalizeInputSymbol(symbol).toLowerCase()
    const candles = await BINANCE_PROVIDER_ADAPTER.getHistoricalCandles!(connection, accountId, symbol, timeframe, 200)
    const initialQuote = await BINANCE_PROVIDER_ADAPTER.getQuote!(connection, accountId, symbol)
    let closed = false
    let currentCandles = [...candles]
    onEvent({ type: 'market_snapshot', snapshot: { symbol, timeframe, candles: currentCandles, quote: initialQuote } })

    if (typeof WebSocket !== 'undefined') {
      const ws = new WebSocket('wss://stream.binance.com:9443/ws/' + providerSymbol + '@ticker')
      ws.onmessage = (event) => {
        if (closed) return
        try {
          const row = JSON.parse(String(event.data)) as Record<string, unknown>
          const last = Number(row.c), bid = Number(row.b), ask = Number(row.a), eventTime = Number(row.E)
          if (![last, bid, ask, eventTime].every(Number.isFinite)) return
          const bucketMs = ({ M1: 60000, M5: 300000, M15: 900000, M30: 1800000, H1: 3600000, H4: 14400000, D1: 86400000 } as Record<string, number>)[timeframe]
          const bucket = Math.floor(eventTime / bucketMs) * bucketMs
          const current = currentCandles[currentCandles.length - 1]
          const quote = { symbol, bid, ask, last, timestamp: new Date(eventTime).toISOString() }
          if (!current || Date.parse(current.openTime) !== bucket) {
            currentCandles = [...currentCandles, { symbol, timeframe, openTime: new Date(bucket).toISOString(), open: last, high: last, low: last, close: last }].slice(-300)
          } else {
            currentCandles = [...currentCandles.slice(0, -1), { ...current, high: Math.max(current.high, last), low: Math.min(current.low, last), close: last }]
          }
          onEvent({ type: 'market_snapshot', snapshot: { symbol, timeframe, candles: currentCandles, quote } })
        } catch {
          onEvent({ type: 'error', error: { code: 'UNKNOWN', message: 'Binance market stream message was invalid.', retryable: true } })
        }
      }
      ws.onerror = () => onEvent({ type: 'error', error: { code: 'NETWORK_ERROR', message: 'Binance market stream failed.', retryable: true } })
      return {
        streamId: connection.connectionId + ':' + symbol + ':' + timeframe + ':' + Date.now(),
        close: async () => { closed = true; ws.close() },
      }
    }

    const timer = globalThis.setInterval(async () => {
      if (closed) return
      try {
        const quote = await BINANCE_PROVIDER_ADAPTER.getQuote!(connection, accountId, symbol)
        onEvent({ type: 'market_snapshot', snapshot: { symbol, timeframe, candles: currentCandles, quote } })
      } catch (error) {
        onEvent({ type: 'error', error: { code: 'NETWORK_ERROR', message: error instanceof Error ? error.message : 'Binance market stream failed.', retryable: true } })
      }
    }, 1000)
    return { streamId: connection.connectionId + ':' + symbol + ':' + timeframe + ':' + Date.now(), close: async () => { closed = true; globalThis.clearInterval(timer) } }
  },
  async subscribeAccount(connection, accountId, onEvent): Promise<ProviderStreamHandle> {
    void connection
    void accountId
    assertConnection(connection)
    const account = accountId || ''
    if (!account) throw new Error('A Binance account is required for account streaming.')
    let closed = false
    const poll = async () => {
      if (closed) return
      try {
        const snapshot = await BINANCE_PROVIDER_ADAPTER.getAccountSnapshot!(connection, account)
        onEvent({ type: 'account', account: snapshot })
      } catch (error) {
        onEvent({ type: 'error', error: { code: 'NETWORK_ERROR', message: error instanceof Error ? error.message : 'Binance account polling failed.', retryable: true } })
      }
    }
    await poll()
    const timer = globalThis.setInterval(() => { void poll() }, 10000)
    return { streamId: connection.connectionId + ':' + account + ':' + Date.now(), close: async () => { closed = true; globalThis.clearInterval(timer) } }
  },
}

export default BINANCE_PROVIDER_ADAPTER