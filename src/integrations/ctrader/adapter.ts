import type {
  ProviderAccountSnapshot,
  ProviderAdapter,
  ProviderCandle,
  ProviderConnection,
  ProviderInstrument,
  ProviderNormalizedError,
  ProviderOrderRequest,
  ProviderOrderResult,
  ProviderPosition,
  ProviderQuote,
  ProviderStreamHandle,
} from '../core/types'
import { validateProviderConnection } from '../core/providerConnectionGuard'
import { CTRADER_PROVIDER_DESCRIPTOR } from './descriptor'

const assertConnection = (connection: ProviderConnection): void => {
  const result = validateProviderConnection({ descriptor: CTRADER_PROVIDER_DESCRIPTOR }, connection)
  if (!result.allowed) throw new Error(result.reason || 'Invalid cTrader connection.')
}

const requireAccount = (accountId: string | undefined): string => {
  if (!accountId) throw new Error('A cTrader account is required for this operation.')
  return accountId
}

const toObject = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const toObjects = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.map(toObject) : []

const request = async (
  connection: ProviderConnection,
  accountId: string,
  action: string,
  body: Record<string, unknown> = {},
): Promise<Record<string, unknown>> => {
  const response = await fetch('/api/providers/ctrader', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      providerId: 'ctrader',
      connectionId: connection.connectionId,
      accountId,
      environment: connection.environment,
      action,
      ...body,
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload?.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'cTrader provider request failed.')
  return payload
}

const networkError = (message: string): ProviderNormalizedError => ({ code: 'NETWORK_ERROR', message, retryable: true })

const normalizeAccount = (account: unknown): ProviderAccountSnapshot => {
  const row = toObject(account)
  return {
    accountId: String(row.accountId ?? ''),
    accountLabel: String(row.accountLabel ?? row.accountId ?? ''),
    environment: row.environment === 'live' ? 'live' : 'demo',
    currency: String(row.currency ?? 'USD'),
    balance: Number(row.balance ?? 0),
    equity: row.equity == null ? undefined : Number(row.equity),
    usedMargin: row.usedMargin == null ? undefined : Number(row.usedMargin),
    freeMargin: row.freeMargin == null ? undefined : Number(row.freeMargin),
    floatingPL: row.floatingPL == null ? undefined : Number(row.floatingPL),
  }
}

const normalizePosition = (position: unknown): ProviderPosition => {
  const row = toObject(position)
  return {
    id: String(row.id ?? ''),
    symbol: String(row.symbol ?? row.symbolId ?? ''),
    side: row.side === 'SELL' ? 'SELL' : 'BUY',
    quantity: Number(row.lots ?? 0),
    entryPrice: Number(row.entryPrice ?? 0),
    currentPrice: row.currentPrice == null ? undefined : Number(row.currentPrice),
    stopLoss: row.stopLoss == null ? null : Number(row.stopLoss),
    takeProfit: row.takeProfit == null ? null : Number(row.takeProfit),
    unrealizedPL: row.unrealizedPL == null ? undefined : Number(row.unrealizedPL),
    currency: row.currency == null ? undefined : String(row.currency),
    metadata: toObject(row.metadata),
  }
}

const normalizeOrder = (order: unknown): ProviderOrderResult => {
  const row = toObject(order)
  return {
    providerOrderId: String(row.providerOrderId ?? ''),
    status: row.status === 'filled'
      ? 'filled'
      : row.status === 'accepted'
        ? 'accepted'
        : row.status === 'rejected'
          ? 'rejected'
          : row.status === 'cancelled'
            ? 'cancelled'
            : 'pending',
    clientOrderId: row.clientOrderId == null ? undefined : String(row.clientOrderId),
    symbol: row.symbol == null ? undefined : String(row.symbol),
    side: row.side === 'SELL' ? 'SELL' : row.side === 'BUY' ? 'BUY' : undefined,
    quantity: row.quantity == null ? undefined : Number(row.quantity),
    timestamp: row.timestamp == null ? undefined : String(row.timestamp),
    message: row.message == null ? undefined : String(row.message),
    raw: row.raw,
  }
}

export const CTRADER_PROVIDER_ADAPTER: ProviderAdapter = {
  descriptor: CTRADER_PROVIDER_DESCRIPTOR,

  async getAuthUrl(): Promise<string> {
    const response = await fetch('/api/providers/ctrader?op=login', { credentials: 'include', redirect: 'manual', cache: 'no-store' })
    const location = response.headers.get('Location')
    if (!location) throw new Error('Unable to start cTrader authorization.')
    return location
  },

  async getAccounts(connection): Promise<ProviderAccountSnapshot[]> {
    assertConnection(connection)
    const payload = await request(connection, requireAccount(connection.accountId), 'accounts')
    return Array.isArray(payload.accounts) ? payload.accounts.map(normalizeAccount) : []
  },

  async getAccountSnapshot(connection, accountId): Promise<ProviderAccountSnapshot> {
    assertConnection(connection)
    const payload = await request(connection, requireAccount(accountId), 'account')
    return normalizeAccount(payload.account)
  },

  async getPositions(connection, accountId): Promise<ProviderPosition[]> {
    assertConnection(connection)
    const payload = await request(connection, requireAccount(accountId), 'reconcile')
    return toObjects(payload.positions).map(normalizePosition)
  },

  async getOrders(connection, accountId): Promise<ProviderOrderResult[]> {
    assertConnection(connection)
    const payload = await request(connection, requireAccount(accountId), 'reconcile')
    return toObjects(payload.orders).map(normalizeOrder)
  },

  async getOrderByClientOrderId(connection, accountId, clientOrderId): Promise<ProviderOrderResult | null> {
    const orders = await CTRADER_PROVIDER_ADAPTER.getOrders!(connection, accountId)
    return orders.find((order) => order.clientOrderId === clientOrderId) || null
  },

  async getInstruments(connection, accountId): Promise<ProviderInstrument[]> {
    assertConnection(connection)
    const payload = await request(connection, requireAccount(accountId), 'instruments')
    return toObjects(payload.instruments)
      .map((item) => ({
        symbol: String(item.symbol ?? ''),
        providerSymbol: String(item.providerSymbol ?? ''),
        displayName: item.displayName == null ? undefined : String(item.displayName),
        assetClass: item.assetClass == null ? undefined : String(item.assetClass),
        baseCurrency: item.baseCurrency == null ? undefined : String(item.baseCurrency),
        quoteCurrency: item.quoteCurrency == null ? undefined : String(item.quoteCurrency),
        contractSize: item.contractSize == null ? undefined : Number(item.contractSize),
        pipSize: item.pipSize == null ? undefined : Number(item.pipSize),
        priceIncrement: item.priceIncrement == null ? undefined : Number(item.priceIncrement),
        quantityMin: item.quantityMin == null ? undefined : Number(item.quantityMin),
        quantityMax: item.quantityMax == null ? undefined : Number(item.quantityMax),
        quantityStep: item.quantityStep == null ? undefined : Number(item.quantityStep),
        tradable: Boolean(item.tradable),
        supportedOrderTypes: ['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT'],
        metadata: toObject(item.metadata) as Record<string, string>,
      }))
  },

  async getQuote(connection, accountId, symbol): Promise<ProviderQuote> {
    assertConnection(connection)
    const payload = await request(connection, requireAccount(accountId), 'quote', { symbol })
    const quote = toObject(payload.quote)
    return {
      symbol: String(quote.symbol ?? symbol),
      bid: quote.bid == null ? undefined : Number(quote.bid),
      ask: quote.ask == null ? undefined : Number(quote.ask),
      last: quote.last == null ? undefined : Number(quote.last),
      timestamp: String(quote.timestamp ?? new Date().toISOString()),
    }
  },

  async getHistoricalCandles(): Promise<ProviderCandle[]> {
    throw new Error('cTrader historical candles are not part of the current manual-trading release seam yet.')
  },

  async placeOrder(connection, accountId, order: ProviderOrderRequest): Promise<ProviderOrderResult> {
    assertConnection(connection)
    const payload = await request(connection, requireAccount(accountId), 'placeOrder', { order })
    return normalizeOrder(payload.order)
  },

  async cancelOrder(connection, accountId, providerOrderId): Promise<ProviderOrderResult> {
    assertConnection(connection)
    const payload = await request(connection, requireAccount(accountId), 'cancelOrder', { providerOrderId })
    return normalizeOrder(payload.order)
  },

  async modifyOrder(connection, accountId, providerOrderId, order): Promise<ProviderOrderResult> {
    assertConnection(connection)
    const payload = await request(connection, requireAccount(accountId), 'modifyOrder', { providerOrderId, order })
    return normalizeOrder(payload.order)
  },

  async closePosition(connection, accountId, positionId): Promise<ProviderOrderResult> {
    assertConnection(connection)
    const payload = await request(connection, requireAccount(accountId), 'closePosition', { positionId })
    return normalizeOrder(payload.order)
  },

  async subscribe(connection, accountId, symbols, onEvent, timeframe = 'M1'): Promise<ProviderStreamHandle> {
    assertConnection(connection)
    if (symbols.length !== 1) throw new Error('The cTrader SHAFX market stream currently accepts one symbol per stream.')
    const account = requireAccount(accountId)
    let closed = false

    const poll = async (): Promise<void> => {
      if (closed) return
      try {
        const quote = await CTRADER_PROVIDER_ADAPTER.getQuote!(connection, account, symbols[0])
        onEvent({
          type: 'market_snapshot',
          snapshot: {
            symbol: symbols[0],
            timeframe,
            candles: [],
            quote,
          },
        })
      } catch (error) {
        onEvent({ type: 'error', error: networkError(error instanceof Error ? error.message : 'cTrader quote stream failed.') })
      }
    }

    await poll()
    const timer: ReturnType<typeof setInterval> = globalThis.setInterval(() => { void poll() }, 1000)
    return {
      streamId: connection.connectionId + ':' + account + ':' + symbols[0] + ':' + Date.now(),
      close: async () => {
        closed = true
        if (timer) globalThis.clearInterval(timer)
      },
    }
  },

  async subscribeAccount(connection, accountId, onEvent): Promise<ProviderStreamHandle> {
    assertConnection(connection)
    const account = requireAccount(accountId)
    let closed = false

    const poll = async (): Promise<void> => {
      if (closed) return
      try {
        const accountSnapshot = await CTRADER_PROVIDER_ADAPTER.getAccountSnapshot!(connection, account)
        onEvent({ type: 'account', account: accountSnapshot })
        const payload = await request(connection, account, 'reconcile')
        for (const position of toObjects(payload.positions)) onEvent({ type: 'position', position: normalizePosition(position) })
        for (const order of toObjects(payload.orders)) onEvent({ type: 'order', order: normalizeOrder(order) })
      } catch (error) {
        onEvent({ type: 'error', error: networkError(error instanceof Error ? error.message : 'cTrader account stream failed.') })
      }
    }

    await poll()
    const timer: ReturnType<typeof setInterval> = globalThis.setInterval(() => { void poll() }, 5000)
    return {
      streamId: connection.connectionId + ':' + account + ':' + Date.now(),
      close: async () => {
        closed = true
        if (timer) globalThis.clearInterval(timer)
      },
    }
  },
}

export default CTRADER_PROVIDER_ADAPTER
