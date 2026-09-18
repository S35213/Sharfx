import type {
  ProviderAccountSnapshot, ProviderAdapter, ProviderCandle, ProviderConnection, ProviderInstrument,
  ProviderNormalizedError, ProviderOrderResult, ProviderPosition, ProviderQuote, ProviderStreamHandle,
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

const toObject = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const toObjects = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.map(toObject) : [];

const api = async (connection: ProviderConnection, accountId: string, action: string, extra: Record<string, string> = {}): Promise<Record<string, unknown>> => {
  const query = new URLSearchParams({ action, connectionId: connection.connectionId, accountId, ...extra })
  const response = await fetch('/api/providers/connections?providerId=oanda&' + query.toString(), { credentials: 'include', cache: 'no-store' })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload?.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'OANDA provider request failed.')
  return payload
}

const normalizeAccount = (account: unknown): ProviderAccountSnapshot => { const row = toObject(account); return {
  accountId: String(row.accountId ?? ''), accountLabel: typeof row.accountLabel === 'string' ? row.accountLabel : String(row.accountId ?? ''),
  environment: row.environment === 'demo' ? 'demo' : 'live', currency: String(row.currency ?? ''), balance: Number(row.balance ?? 0),
  equity: row.equity == null ? undefined : Number(row.equity), usedMargin: row.usedMargin == null ? undefined : Number(row.usedMargin),
  freeMargin: row.freeMargin == null ? undefined : Number(row.freeMargin), floatingPL: row.floatingPL == null ? undefined : Number(row.floatingPL),
} }

const normalizeQuote = (quote: unknown): ProviderQuote => { const row = toObject(quote); return {
  symbol: String(row.symbol ?? ''), bid: row.bid == null ? undefined : Number(row.bid), ask: row.ask == null ? undefined : Number(row.ask),
  last: row.last == null ? undefined : Number(row.last), timestamp: String(row.timestamp ?? new Date().toISOString()),
} }

const normalizeCandle = (candle: unknown): ProviderCandle => { const row = toObject(candle); return {
  symbol: String(row.symbol ?? ''), timeframe: String(row.timeframe ?? ''), openTime: String(row.openTime ?? ''),
  closeTime: row.closeTime == null ? undefined : String(row.closeTime), open: Number(row.open), high: Number(row.high),
  low: Number(row.low), close: Number(row.close), volume: row.volume == null ? undefined : Number(row.volume),
} }

const networkError = (message: string): ProviderNormalizedError => ({ code: 'NETWORK_ERROR', message, retryable: true })

export const OANDA_PROVIDER_ADAPTER: ProviderAdapter = {
  descriptor: OANDA_PROVIDER_DESCRIPTOR,
  async getAccounts(connection): Promise<ProviderAccountSnapshot[]> {
    assertConnection(connection)
    const response = await fetch('/api/providers/connections?providerId=oanda&action=accounts&connectionId=' + encodeURIComponent(connection.connectionId), { credentials: 'include', cache: 'no-store' })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload?.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'Unable to load OANDA accounts.')
    return Array.isArray(payload.accounts) ? payload.accounts.map(normalizeAccount) : []
  },
  async getAccountSnapshot(connection, accountId): Promise<ProviderAccountSnapshot> {
    assertConnection(connection); const payload = await api(connection, requireAccount(accountId), 'account'); return normalizeAccount(payload.account)
  },
  async getPositions(connection, accountId): Promise<ProviderPosition[]> {
    assertConnection(connection); const payload = await api(connection, requireAccount(accountId), 'positions')
    return toObjects(payload.positions).map((position) => ({
      id: String(position.id ?? ''), symbol: String(position.symbol ?? ''), side: position.side === 'SELL' ? 'SELL' : 'BUY', quantity: Number(position.quantity ?? 0),
      entryPrice: Number(position.entryPrice ?? 0), currentPrice: position.currentPrice == null ? undefined : Number(position.currentPrice),
      stopLoss: position.stopLoss == null ? undefined : Number(position.stopLoss), takeProfit: position.takeProfit == null ? undefined : Number(position.takeProfit),
      unrealizedPL: position.unrealizedPL == null ? undefined : Number(position.unrealizedPL), currency: position.currency == null ? undefined : String(position.currency),
    }))
  },
  async getOrders(connection, accountId): Promise<ProviderOrderResult[]> {
    assertConnection(connection); const payload = await api(connection, requireAccount(accountId), 'orders'); return toObjects(payload.orders).map((order) => ({
      providerOrderId: String(order.providerOrderId ?? ''), status: order.status === 'cancelled' ? 'cancelled' : 'pending', clientOrderId: order.clientOrderId == null ? undefined : String(order.clientOrderId),
      symbol: order.symbol == null ? undefined : String(order.symbol), side: order.side === 'SELL' ? 'SELL' : 'BUY', quantity: Number(order.quantity ?? 0), timestamp: order.timestamp == null ? undefined : String(order.timestamp), message: order.message == null ? undefined : String(order.message),
    }))
  },
  async getInstruments(connection, accountId): Promise<ProviderInstrument[]> {
    assertConnection(connection); const payload = await api(connection, requireAccount(accountId), 'instruments'); return toObjects(payload.instruments).map((instrument) => ({
      symbol: String(instrument.symbol ?? ''), providerSymbol: String(instrument.providerSymbol ?? instrument.symbol ?? ''), displayName: instrument.displayName == null ? undefined : String(instrument.displayName),
      assetClass: instrument.assetClass == null ? undefined : String(instrument.assetClass), baseCurrency: instrument.baseCurrency == null ? undefined : String(instrument.baseCurrency), quoteCurrency: instrument.quoteCurrency == null ? undefined : String(instrument.quoteCurrency),
      contractSize: instrument.contractSize == null ? undefined : Number(instrument.contractSize), pipSize: instrument.pipSize == null ? undefined : Number(instrument.pipSize), priceIncrement: instrument.priceIncrement == null ? undefined : Number(instrument.priceIncrement),
      quantityMin: instrument.quantityMin == null ? undefined : Number(instrument.quantityMin), quantityMax: instrument.quantityMax == null ? undefined : Number(instrument.quantityMax), quantityStep: instrument.quantityStep == null ? undefined : Number(instrument.quantityStep), tradable: Boolean(instrument.tradable),
    }))
  },
  async getQuote(connection, accountId, symbol): Promise<ProviderQuote> {
    assertConnection(connection); const payload = await api(connection, requireAccount(accountId), 'quote', { symbol }); return normalizeQuote(payload.quote)
  },
  async getHistoricalCandles(connection, accountId, symbol, timeframe, limit = 200): Promise<ProviderCandle[]> {
    assertConnection(connection); if (!supportedTimeframes.has(timeframe)) throw new Error('Unsupported OANDA timeframe: ' + timeframe)
    const payload = await api(connection, requireAccount(accountId), 'candles', { symbol, timeframe, limit: String(limit) })
    return toObjects(payload.candles).map(normalizeCandle)
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
