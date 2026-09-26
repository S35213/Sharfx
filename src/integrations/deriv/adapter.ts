import { DerivPublicMarketFeed } from '../../data/deriv/DerivPublicMarketFeed'
import type { Timeframe } from '../../types'
import type { ProviderAccountSnapshot, ProviderAdapter, ProviderCandle, ProviderConnection, ProviderMarketSnapshot, ProviderNormalizedError, ProviderQuote, ProviderStreamEvent, ProviderStreamHandle } from '../core/types'
import { validateProviderConnection } from '../core/providerConnectionGuard'
import { DerivAccountStreamTransport } from './accountStream'
import { DERIV_PROVIDER_DESCRIPTOR } from './descriptor'

const supportedTimeframes: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1']
const isTimeframe = (value: string): value is Timeframe => supportedTimeframes.includes(value as Timeframe)

const assertConnection = (connection: ProviderConnection): void => {
  const result = validateProviderConnection({ descriptor: DERIV_PROVIDER_DESCRIPTOR }, connection)
  if (!result.allowed) throw new Error(result.reason || 'Invalid Deriv connection.')
}

const toSnapshot = (
  symbol: string,
  timeframe: string,
  candles: Array<{ time: number; open: number; high: number; low: number; close: number }>,
  price: number,
  epoch: number,
): ProviderMarketSnapshot => ({
  symbol,
  timeframe,
  candles: candles.map<ProviderCandle>((candle) => ({
    symbol,
    timeframe,
    openTime: new Date(candle.time).toISOString(),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  })),
  quote: {
    symbol,
    last: price,
    timestamp: new Date(epoch).toISOString(),
  },
})

const withTimeout = async <T>(operation: Promise<T>, timeoutMs = 12000): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = globalThis.setTimeout(() => reject(new Error('Deriv market-data request timed out.')), timeoutMs)
      }),
    ])
  } finally {
    if (timer !== undefined) globalThis.clearTimeout(timer)
  }
}

const asNetworkError = (message: string): ProviderNormalizedError => ({
  code: 'NETWORK_ERROR',
  message,
  retryable: true,
})

interface DerivAccountApiRow {
  account_id?: unknown
  balance?: unknown
  currency?: unknown
  account_type?: unknown
  status?: unknown
  group?: unknown
}

const normalizeAccountRows = (payload: unknown): ProviderAccountSnapshot[] => {
  const data = (payload as { data?: unknown } | null)?.data ?? payload
  const rows = Array.isArray(data) ? data : Array.isArray((data as { accounts?: unknown } | null)?.accounts) ? (data as { accounts: unknown[] }).accounts : data ? [data] : []
  return rows.flatMap((row) => {
    const item = row as DerivAccountApiRow
    const accountId = typeof item.account_id === 'string' ? item.account_id.trim() : ''
    const currency = typeof item.currency === 'string' ? item.currency.trim() : ''
    const balance = Number(item.balance)
    if (!accountId || !currency || !Number.isFinite(balance)) return []
    const environment = item.account_type === 'demo' ? 'demo' : 'live'
    const labelParts = [environment === 'demo' ? 'Demo' : 'Live', typeof item.group === 'string' ? item.group : undefined, typeof item.status === 'string' ? item.status : undefined].filter(Boolean)
    return [{
      accountId,
      accountLabel: labelParts.join(' • '),
      environment,
      currency,
      balance,
    }]
  })
}

export const DERIV_PROVIDER_ADAPTER: ProviderAdapter = {
  descriptor: DERIV_PROVIDER_DESCRIPTOR,

  async getAccounts(connection: ProviderConnection): Promise<ProviderAccountSnapshot[]> {
    assertConnection(connection)
    const persistedConnection = !connection.connectionId.startsWith('account:')
    const endpoint = persistedConnection ? '/api/deriv/accounts?connectionId=' + encodeURIComponent(connection.connectionId) : '/api/deriv/accounts'
    const response = await fetch(endpoint, { credentials: 'include', cache: 'no-store' })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'Unable to load Deriv accounts.')
    return normalizeAccountRows(payload)
  },

  async getQuote(connection: ProviderConnection, accountId: string | undefined, symbol: string): Promise<ProviderQuote> {
    assertConnection(connection)
    const feed = new DerivPublicMarketFeed()
    return withTimeout(new Promise<ProviderQuote>((resolve, reject) => {
      feed.connect(symbol, 'M1', {
        onUpdate: (_candles, price, epoch) => {
          feed.disconnect()
          resolve({ symbol, last: price, timestamp: new Date(epoch).toISOString() })
        },
        onStatus: (status, message) => {
          if (status === 'error') {
            feed.disconnect()
            reject(new Error(message || 'Deriv quote stream failed.'))
          }
        },
      })
    }))
  },

  async getHistoricalCandles(connection: ProviderConnection, accountId: string | undefined, symbol: string, timeframe: string, limit = 200): Promise<ProviderCandle[]> {
    assertConnection(connection)
    if (!isTimeframe(timeframe)) throw new Error(`Unsupported SHAFX timeframe for Deriv: ${timeframe}`)
    const feed = new DerivPublicMarketFeed()
    return withTimeout(new Promise<ProviderCandle[]>((resolve, reject) => {
      feed.connect(symbol, timeframe, {
        onUpdate: (candles) => {
          feed.disconnect()
          const count = Math.max(1, Math.min(1000, Math.trunc(limit)))
          resolve(candles.slice(-count).map((candle) => ({
            symbol,
            timeframe,
            openTime: new Date(candle.time).toISOString(),
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
          })))
        },
        onStatus: (status, message) => {
          if (status === 'error') {
            feed.disconnect()
            reject(new Error(message || 'Deriv historical market-data request failed.'))
          }
        },
      })
    }))
  },

  async subscribe(connection: ProviderConnection, _accountId: string | undefined, symbols: string[], onEvent: (event: ProviderStreamEvent) => void, timeframe = 'M5'): Promise<ProviderStreamHandle> {
    assertConnection(connection)
    if (symbols.length !== 1) throw new Error('The current Deriv public adapter accepts exactly one subscribed symbol per stream.')
    if (!isTimeframe(timeframe)) throw new Error(`Unsupported SHAFX timeframe for Deriv: ${timeframe}`)

    const symbol = symbols[0]
    const feed = new DerivPublicMarketFeed()
    let closed = false

    feed.connect(symbol, timeframe, {
      onUpdate: (candles, price, epoch) => {
        if (closed) return
        onEvent({ type: 'market_snapshot', snapshot: toSnapshot(symbol, timeframe, candles, price, epoch) })
      },
      onStatus: (status, message) => {
        if (closed || status !== 'error') return
        onEvent({ type: 'error', error: asNetworkError(message || 'Deriv market-data stream failed.') })
      },
    })

    return {
      streamId: `${connection.connectionId}:${symbol}:${timeframe}:${Date.now()}`,
      close: async () => {
        closed = true
        feed.disconnect()
      },
    }
  },

  async placeOrder(connection: ProviderConnection, accountId: string, order): Promise<import('../core/types').ProviderOrderResult> {
    assertConnection(connection)
    const response = await fetch('/api/deriv/order', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'place',
        connectionId: connection.connectionId,
        accountId,
        order: { ...order, durationSeconds: order.durationSeconds ?? 30, stake: order.stake ?? order.quantity },
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload?.ok || !payload?.order) throw new Error(typeof payload?.error === 'string' ? payload.error : 'Unable to place the Deriv order.')
    return payload.order
  },

  async closePosition(connection: ProviderConnection, accountId: string, positionId: string): Promise<import('../core/types').ProviderOrderResult> {
    assertConnection(connection)
    const response = await fetch('/api/deriv/order', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sell', connectionId: connection.connectionId, accountId, providerOrderId: positionId }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload?.ok || !payload?.order) throw new Error(typeof payload?.error === 'string' ? payload.error : 'Unable to close the Deriv contract.')
    return payload.order
  },

  async getDepositInstructions(): Promise<import('../core/types').ProviderFundingInstruction> {
    return {
      mode: 'redirect',
      providerUrl: 'https://app.deriv.com/cashier/deposit',
      message: 'Use Deriv Cashier to deposit funds, then return to SHAFX and refresh the account balance.',
    }
  },

  async getWithdrawalInstructions(): Promise<import('../core/types').ProviderFundingInstruction> {
    return {
      mode: 'redirect',
      providerUrl: 'https://app.deriv.com/cashier/withdraw',
      message: 'Use Deriv Cashier to withdraw funds.',
    }
  },

  async subscribeAccount(connection: ProviderConnection, _accountId: string | undefined, onEvent: (event: ProviderStreamEvent) => void): Promise<ProviderStreamHandle> {
    assertConnection(connection)
    const persistedConnection = !connection.connectionId.startsWith('account:')
    const transport = new DerivAccountStreamTransport({
      connectionId: persistedConnection ? connection.connectionId : undefined,
      accountId: persistedConnection ? connection.accountId : undefined,
      accountType: connection.environment === 'demo' ? 'demo' : 'real',
      onSnapshot: (snapshot) => onEvent({
        type: 'account',
        account: {
          accountId: snapshot.accountId,
          accountLabel: snapshot.accountType === 'demo' ? 'Demo' : 'Live',
          environment: connection.environment,
          currency: snapshot.currency,
          balance: snapshot.balance,
        },
      }),
      onStatus: (status) => {
        if (status === 'error') onEvent({ type: 'error', error: asNetworkError('Deriv account stream failed.') })
      },
    })
    await transport.start()
    return {
      streamId: `${connection.connectionId}:${connection.accountId ?? connection.environment}:${Date.now()}`,
      close: async () => transport.stop(),
    }
  },
}

export default DERIV_PROVIDER_ADAPTER
