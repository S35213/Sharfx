import { DerivPublicMarketFeed } from '../../data/deriv/DerivPublicMarketFeed'
import type { Timeframe } from '../../types'
import type { ProviderAdapter, ProviderCandle, ProviderConnection, ProviderMarketSnapshot, ProviderQuote, ProviderStreamHandle } from '../core/types'
import { DERIV_PROVIDER_DESCRIPTOR } from './descriptor'

const isTimeframe = (value: string): value is Timeframe => ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'].includes(value)

const toProviderSnapshot = (symbol: string, timeframe: string, candles: ReturnType<DerivPublicMarketFeed['connect']> extends never ? never : never): never => candles

const toSnapshot = (symbol: string, timeframe: string, candles: Array<{ time: number; open: number; high: number; low: number; close: number }>, price: number, epoch: number): ProviderMarketSnapshot => ({
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

const publicConnection = (): ProviderConnection => ({
  providerId: DERIV_PROVIDER_DESCRIPTOR.id,
  connectionId: 'public-market-data',
  environment: 'demo',
  connectedAt: new Date().toISOString(),
  state: 'connected',
})

const withTimeout = async <T>(operation: Promise<T>, timeoutMs = 12000): Promise<T> => {
  let timer: number | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error('Deriv market-data request timed out.')), timeoutMs)
      }),
    ])
  } finally {
    if (timer !== undefined) window.clearTimeout(timer)
  }
}

export const DERIV_PROVIDER_ADAPTER: ProviderAdapter = {
  descriptor: DERIV_PROVIDER_DESCRIPTOR,

  async getQuote(_connection: ProviderConnection, _accountId: string | undefined, symbol: string): Promise<ProviderQuote> {
    if (!isTimeframe('M1')) throw new Error('Deriv timeframe configuration is invalid.')
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

  async getHistoricalCandles(_connection: ProviderConnection, _accountId: string | undefined, symbol: string, timeframe: string, limit = 200): Promise<ProviderCandle[]> {
    if (!isTimeframe(timeframe)) throw new Error(`Unsupported SHAFX timeframe for Deriv: ${timeframe}`)
    const feed = new DerivPublicMarketFeed()
    return withTimeout(new Promise<ProviderCandle[]>((resolve, reject) => {
      feed.connect(symbol, timeframe, {
        onUpdate: (candles) => {
          feed.disconnect()
          const sliced = candles.slice(-Math.max(1, Math.min(1000, Math.trunc(limit))))
          resolve(sliced.map((candle) => ({
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

  async subscribe(_connection: ProviderConnection, _accountId: string | undefined, symbols: string[], onEvent: (event: Parameters<NonNullable<ProviderAdapter['subscribe']>>[3]) => void): Promise<ProviderStreamHandle> {
    if (symbols.length !== 1) throw new Error('The current Deriv public adapter accepts exactly one subscribed symbol per stream.')
    const symbol = symbols[0]
    const timeframe: Timeframe = 'M5'
    const feed = new DerivPublicMarketFeed()
    let closed = false
    feed.connect(symbol, timeframe, {
      onUpdate: (candles, price, epoch) => {
        if (closed) return
        onEvent({ type: 'market_snapshot', snapshot: toSnapshot(symbol, timeframe, candles, price, epoch) })
      },
      onStatus: (status, message) => {
        if (closed || status !== 'error') return
        onEvent({
          type: 'error',
          error: {
            code: 'NETWORK_ERROR',
            message: message || 'Deriv public market-data stream failed.',
            retryable: true,
          },
        })
      },
    })

    const connection = publicConnection()
    return {
      streamId: `${connection.connectionId}:${symbol}:${Date.now()}`,
      close: async () => {
        closed = true
        feed.disconnect()
      },
    }
  },
}

export default DERIV_PROVIDER_ADAPTER
