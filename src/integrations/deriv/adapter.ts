import { DerivPublicMarketFeed } from '../../data/deriv/DerivPublicMarketFeed'
import type { Timeframe } from '../../types'
import type { ProviderAdapter, ProviderCandle, ProviderConnection, ProviderMarketSnapshot, ProviderNormalizedError, ProviderQuote, ProviderStreamEvent, ProviderStreamHandle } from '../core/types'
import { validateProviderConnection } from '../core/providerConnectionGuard'
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

export const DERIV_PROVIDER_ADAPTER: ProviderAdapter = {
  descriptor: DERIV_PROVIDER_DESCRIPTOR,

  async getQuote(connection: ProviderConnection, _accountId: string | undefined, symbol: string): Promise<ProviderQuote> {
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

  async getHistoricalCandles(connection: ProviderConnection, _accountId: string | undefined, symbol: string, timeframe: string, limit = 200): Promise<ProviderCandle[]> {
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
        onEvent({ type: 'error', error: asNetworkError(message || 'Deriv public market-data stream failed.') })
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
}

export default DERIV_PROVIDER_ADAPTER
