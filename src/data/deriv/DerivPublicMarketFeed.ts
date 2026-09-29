import type { OHLCV, Timeframe } from '../../types'

export const DERIV_PUBLIC_WS_URL = 'wss://api.derivws.com/trading/v1/options/ws/public'
const DEFAULT_SHAFX_MARKET_PROXY_WS_URL = 'wss://sharfx.150sharingan2.workers.dev/api/deriv/public-market'
export const SHAFX_MARKET_PROXY_WS_URL = import.meta.env.VITE_SHAFX_MARKET_WS_URL?.trim() || DEFAULT_SHAFX_MARKET_PROXY_WS_URL

export const getDerivMarketWebSocketUrl = (): string => {
  if (typeof window === 'undefined') return DERIV_PUBLIC_WS_URL

  // SHAFX production is served by the Cloudflare Worker. The public market
  // WebSocket is proxied there so the deployed app has one controlled market-data
  // entry point. Local development keeps the direct Deriv endpoint.
  const hostname = window.location.hostname
  if (hostname === 'localhost' || hostname === '127.0.0.1') return DERIV_PUBLIC_WS_URL
  return SHAFX_MARKET_PROXY_WS_URL
}

const timeframeSeconds: Record<Timeframe, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  M30: 1800,
  H1: 3600,
  H4: 14400,
  D1: 86400,
  W1: 604800,
}

const historyGranularitySeconds = (timeframe: Timeframe): number => timeframe === 'W1' ? 86400 : timeframeSeconds[timeframe]
const historyDefaultCount = (timeframe: Timeframe): number => timeframe === 'W1' ? 2100 : 300

export const createDerivCandleHistoryRequest = (
  symbol: string,
  timeframe: Timeframe,
  options: { end?: 'latest' | number; count?: number; reqId?: number } = {},
) => ({
  ticks_history: symbol,
  end: options.end ?? 'latest',
  count: options.count ?? historyDefaultCount(timeframe),
  style: 'candles' as const,
  granularity: historyGranularitySeconds(timeframe),
  req_id: options.reqId ?? 1,
})

export const toDerivSymbol = (symbol: string): string => {
  const normalized = symbol.replace('/', '').toUpperCase()
  return normalized.length === 6 ? `frx${normalized}` : symbol
}

export interface DerivActiveSymbol {
  symbol: string
  displayName: string
  market: string
  pipSize?: number
}

export const formatForexSymbol = (symbol: string): string => {
  const normalized = symbol.replace('/', '').toUpperCase().replace(/^FRX/, '')
  return /^[A-Z]{6}$/.test(normalized) ? normalized.slice(0, 3) + '/' + normalized.slice(3) : symbol
}

const openPublicMarketSocket = (timeoutMs = 5000): Promise<WebSocket> => new Promise((resolve, reject) => {
  const socket = new WebSocket(getDerivMarketWebSocketUrl())
  const timer = globalThis.setTimeout(() => {
    try { socket.close() } catch (error) { void error }
    reject(new Error('Deriv public market socket timed out.'))
  }, timeoutMs)
  socket.onopen = () => {
    globalThis.clearTimeout(timer)
    resolve(socket)
  }
  socket.onerror = () => {
    globalThis.clearTimeout(timer)
    reject(new Error('Deriv public market socket failed.'))
  }
})

export const fetchDerivActiveForexSymbols = async (): Promise<DerivActiveSymbol[]> => {
  const socket = await openPublicMarketSocket()
  return await new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      try { socket.close() } catch (error) { void error }
      reject(new Error('Deriv active-symbol request timed out.'))
    }, 5000)
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as DerivTickResponse
        if (!Array.isArray(payload.active_symbols)) return
        globalThis.clearTimeout(timer)
        const rows = payload.active_symbols.flatMap((row) => {
          const raw = typeof row.underlying_symbol === 'string' ? row.underlying_symbol : typeof row.symbol === 'string' ? row.symbol : ''
          const market = typeof row.market === 'string' ? row.market : typeof row.underlying_symbol_type === 'string' ? row.underlying_symbol_type : ''
          const normalized = raw.replace(/^frx/i, '').replace('/', '').toUpperCase()
          if (!/^[A-Z]{6}$/.test(normalized) || (market && !/forex/i.test(market))) return []
          const displayName = typeof row.underlying_symbol_name === 'string'
            ? row.underlying_symbol_name
            : typeof row.display_name === 'string'
              ? row.display_name
              : formatForexSymbol(normalized)
          const pipSize = Number(row.pip_size ?? row.pip)
          return [{ symbol: formatForexSymbol(normalized), displayName, market: 'forex', ...(Number.isFinite(pipSize) ? { pipSize } : {}) }]
        })
        try { socket.close() } catch (error) { void error }
        resolve(Array.from(new Map(rows.map((row) => [row.symbol, row])).values()))
      } catch (error) {
        globalThis.clearTimeout(timer)
        reject(error)
      }
    }
  })
}

export const subscribeDerivForexQuotes = async (
  symbols: string[],
  onQuote: (symbol: string, quote: number, epoch: number) => void,
): Promise<() => void> => {
  if (!symbols.length) return () => undefined
  const socket = await openPublicMarketSocket()
  let stopped = false
  const normalizedSymbols = symbols.map(toDerivSymbol)
  socket.send(JSON.stringify({ ticks: normalizedSymbols, subscribe: 1, req_id: 7101 }))
  socket.onmessage = (event) => {
    if (stopped) return
    try {
      const payload = JSON.parse(String(event.data)) as DerivTickResponse
      if (payload.msg_type !== 'tick' || typeof payload.tick?.symbol !== 'string') return
      const quote = Number(payload.tick.quote)
      const epoch = Number(payload.tick.epoch)
      if (!Number.isFinite(quote) || quote <= 0 || !Number.isFinite(epoch)) return
      onQuote(formatForexSymbol(payload.tick.symbol), quote, epoch)
    } catch {
      // Ignore malformed catalog messages without interrupting the quote watch.
    }
  }
  return () => {
    stopped = true
    try { socket.close() } catch (error) { void error }
  }
}

interface DerivTickResponse {
  msg_type?: string
  req_id?: number
  tick?: { epoch?: number; quote?: number; symbol?: string }
  subscription?: { id?: string }
  active_symbols?: Array<Record<string, unknown>>
  candles?: Array<{ epoch?: number; open?: number; high?: number; low?: number; close?: number }>
  history?: { times?: number[]; prices?: number[] }
  error?: { message?: string }
  errors?: Array<{ message?: string }>
}

const toCandles = (items: DerivTickResponse['candles']): OHLCV[] => (items ?? []).flatMap((item) => {
  const { epoch, open, high, low, close } = item
  if (![epoch, open, high, low, close].every((value) => typeof value === 'number' && Number.isFinite(value))) return []
  if (high! < Math.max(open!, close!) || low! > Math.min(open!, close!) || low! > high!) return []
  return [{ time: Math.trunc(epoch! * 1000), open: open!, high: high!, low: low!, close: close! }]
})

const weekStartMs = (epochSeconds: number): number => {
  const date = new Date(epochSeconds * 1000)
  const dayOffset = (date.getUTCDay() + 6) % 7
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - dayOffset)
}

export const aggregateWeeklyCandles = (candles: OHLCV[]): OHLCV[] => {
  const buckets = new Map<number, OHLCV>()
  for (const candle of candles) {
    const bucket = weekStartMs(Math.floor(candle.time / 1000))
    const existing = buckets.get(bucket)
    if (!existing) {
      buckets.set(bucket, { time: bucket, open: candle.open, high: candle.high, low: candle.low, close: candle.close })
    } else {
      buckets.set(bucket, {
        ...existing,
        high: Math.max(existing.high, candle.high),
        low: Math.min(existing.low, candle.low),
        close: candle.close,
      })
    }
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time).slice(-300)
}

const candleBucketMs = (epochSeconds: number, timeframe: Timeframe): number => (
  timeframe === 'W1'
    ? weekStartMs(epochSeconds)
    : Math.floor(epochSeconds / timeframeSeconds[timeframe]) * timeframeSeconds[timeframe] * 1000
)

const toTickCandles = (times: number[] | undefined, prices: number[] | undefined, timeframe: Timeframe): OHLCV[] => {
  if (!Array.isArray(times) || !Array.isArray(prices)) return []
  const buckets = new Map<number, OHLCV>()
  const length = Math.min(times.length, prices.length)
  for (let index = 0; index < length; index += 1) {
    const epoch = Number(times[index])
    const price = Number(prices[index])
    if (!Number.isFinite(epoch) || !Number.isFinite(price) || price <= 0) continue
    const bucket = candleBucketMs(epoch, timeframe)
    const existing = buckets.get(bucket)
    if (!existing) {
      buckets.set(bucket, { time: bucket, open: price, high: price, low: price, close: price })
    } else {
      buckets.set(bucket, { ...existing, high: Math.max(existing.high, price), low: Math.min(existing.low, price), close: price })
    }
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time).slice(-300)
}

export class DerivPublicMarketFeed {
  private socket: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private stopped = true
  private reconnectAttempt = 0
  private connectionGeneration = 0
  private symbol = ''
  private timeframe: Timeframe = 'M5'
  private candles: OHLCV[] = []
  private onUpdate?: (candles: OHLCV[], price: number, epoch: number) => void
  private onStatus?: (status: 'connecting' | 'connected' | 'disconnected' | 'error', message?: string) => void
  private webSocketUrlProvider?: () => Promise<string>
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private firstDataTimer: ReturnType<typeof setTimeout> | null = null
  private forceDirectFallback = false
  private historyRequestId = 0
  private nextRequestId = 10
  private historyRequestMode: 'latest' | 'fallback' = 'latest'
  private tickSubscriptionId: string | null = null

  connect(
    symbol: string,
    timeframe: Timeframe,
    callbacks: {
      onUpdate: (candles: OHLCV[], price: number, epoch: number) => void
      onStatus: (status: 'connecting' | 'connected' | 'disconnected' | 'error', message?: string) => void
      getWebSocketUrl?: () => Promise<string>
    },
  ): void {
    this.disconnect()
    this.symbol = toDerivSymbol(symbol)
    this.timeframe = timeframe
    this.onUpdate = callbacks.onUpdate
    this.onStatus = callbacks.onStatus
    this.webSocketUrlProvider = callbacks.getWebSocketUrl
    this.candles = []
    this.historyRequestId = 1
    this.nextRequestId = 10
    this.historyRequestMode = 'latest'
    this.tickSubscriptionId = null
    this.reconnectAttempt = 0
    this.forceDirectFallback = false
    this.stopped = false
    this.connectionGeneration += 1
    this.openSocket(this.connectionGeneration)
  }

  /**
   * Change the chart timeframe without tearing down the live market WebSocket.
   * The existing tick subscription stays active; only candle history is reloaded
   * at the newly selected granularity.
   */
  setTimeframe(timeframe: Timeframe): void {
    this.timeframe = timeframe
    this.candles = []
    this.historyRequestMode = 'latest'
    const socket = this.socket
    if (!this.stopped && socket && socket.readyState === WebSocket.OPEN) {
      this.requestHistory(socket, 'latest')
    }
  }

  setSymbol(symbol: string): void {
    const nextSymbol = toDerivSymbol(symbol)
    if (nextSymbol === this.symbol) return
    this.symbol = nextSymbol
    this.candles = []
    this.historyRequestMode = 'latest'
    const socket = this.socket
    if (!this.stopped && socket && socket.readyState === WebSocket.OPEN) {
      if (this.tickSubscriptionId) {
        socket.send(JSON.stringify({ forget: this.tickSubscriptionId, req_id: this.nextRequestId++ }))
        this.tickSubscriptionId = null
      }
      this.requestHistory(socket, 'latest')
      socket.send(JSON.stringify({ ticks: this.symbol, subscribe: 1, req_id: this.nextRequestId++ }))
    }
  }

  private requestHistory(socket: WebSocket, end: 'latest' | number, reqId?: number): void {
    const id = reqId ?? this.nextRequestId++
    this.historyRequestId = id
    this.historyRequestMode = end === 'latest' ? 'latest' : 'fallback'
    socket.send(JSON.stringify(createDerivCandleHistoryRequest(this.symbol, this.timeframe, {
      end,
      count: 300,
      reqId: id,
    })))
  }

  private async openSocket(generation: number): Promise<void> {
    if (this.stopped || generation !== this.connectionGeneration) return
    this.onStatus?.('connecting')

    let wsUrl = this.forceDirectFallback ? DERIV_PUBLIC_WS_URL : getDerivMarketWebSocketUrl()
    if (this.webSocketUrlProvider && !this.forceDirectFallback) {
      try {
        wsUrl = await this.webSocketUrlProvider()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to obtain the authenticated Deriv market stream.'
        this.onStatus?.('error', message)
        wsUrl = getDerivMarketWebSocketUrl()
      }
    }

    if (this.stopped || generation !== this.connectionGeneration) return

    let socket: WebSocket
    try {
      socket = new WebSocket(wsUrl)
    } catch (error) {
      this.onStatus?.('error', error instanceof Error ? error.message : 'Unable to open the Deriv WebSocket.')
      this.scheduleReconnect(generation)
      return
    }
    this.socket = socket
    const usingDirectFallback = wsUrl === DERIV_PUBLIC_WS_URL
    let receivedMarketData = false
    const clearFirstDataTimer = (): void => {
      if (this.firstDataTimer !== null) globalThis.clearTimeout(this.firstDataTimer)
      this.firstDataTimer = null
    }
    const requestFallbackCandles = (): void => {
      this.requestHistory(socket, Math.floor(Date.now() / 1000) - 172800)
    }

    socket.onopen = () => {
      if (this.stopped || generation !== this.connectionGeneration) return
      this.reconnectAttempt = 0
      this.onStatus?.('connected')
      if (this.pingTimer !== null) globalThis.clearInterval(this.pingTimer)
      this.pingTimer = globalThis.setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ ping: 1, req_id: Date.now() }))
        }
      }, 30000)
      clearFirstDataTimer()
      if (!usingDirectFallback) {
        this.firstDataTimer = globalThis.setTimeout(() => {
          if (this.stopped || generation !== this.connectionGeneration || receivedMarketData) return
          this.forceDirectFallback = true
          this.onStatus?.('connecting')
          try { socket.close(1012, 'No market data from proxy') } catch (error) { void error }
        }, 2500)
      }
      this.requestHistory(socket, 'latest', 1)
      socket.send(JSON.stringify({ ticks: this.symbol, subscribe: 1, req_id: 2 }))
    }

    socket.onmessage = (event) => {
      if (this.stopped || generation !== this.connectionGeneration) return
      try {
        const response = JSON.parse(String(event.data)) as DerivTickResponse
        const responseError = response.error?.message ?? response.errors?.find((item) => typeof item?.message === 'string')?.message
        if (responseError) {
          const marketClosed = /market(?:\s+is)?\s+presently\s+closed/i.test(responseError)
          if (response.req_id === this.historyRequestId && this.historyRequestMode === 'latest') {
            // Candle history may reject "latest" while a market is closed. Retry
            // against a known historical point so the chart can still render the
            // latest completed session instead of going blank for the weekend.
            requestFallbackCandles()
            return
          }
          if (marketClosed && response.req_id === 2) {
            // FX ticks are unavailable while the market is closed. Keep the
            // historical candles and connection alive; live ticks will resume
            // automatically the next time the socket is opened.
            return
          }
          // A history request can fail for one timeframe without meaning the
          // shared live socket is broken. Keep the socket alive so another
          // timeframe can immediately request its own history.
          if (response.req_id === this.historyRequestId) return
          this.onStatus?.('error', responseError)
          socket.close()
          return
        }
        if (response.subscription?.id && typeof response.subscription.id === 'string') {
          this.tickSubscriptionId = response.subscription.id
        }
        if (response.msg_type === 'candles') {
          if (response.req_id !== this.historyRequestId) return
          const rawCandles = toCandles(response.candles).sort((a, b) => a.time - b.time)
          const receivedCandles = this.timeframe === 'W1' ? aggregateWeeklyCandles(rawCandles) : rawCandles
          if (this.historyRequestMode === 'latest' && receivedCandles.length === 0) {
            // A closed market can validly return an empty "latest" history response.
            // Retry with a recent completed session so the chart still gets real candles.
            requestFallbackCandles()
            return
          }
          receivedMarketData = receivedCandles.length > 0 || receivedMarketData
          clearFirstDataTimer()
          if (usingDirectFallback) this.forceDirectFallback = false
          this.candles = receivedCandles.slice(-300)
          const lastCandle = this.candles[this.candles.length - 1]
          if (lastCandle) this.onUpdate?.(this.candles, lastCandle.close, Math.trunc(lastCandle.time))
          return
        }
        if (response.msg_type === 'history' && response.history) {
          if (response.req_id !== this.historyRequestId) return
          const candles = toTickCandles(response.history.times, response.history.prices, this.timeframe)
          if (candles.length) {
            receivedMarketData = true
            clearFirstDataTimer()
            if (usingDirectFallback) this.forceDirectFallback = false
            this.candles = candles
            const lastCandle = this.candles[this.candles.length - 1]
            this.onUpdate?.(this.candles, lastCandle.close, Math.trunc(lastCandle.time))
          }
          return
        }
        if (response.msg_type === 'tick' && response.tick?.quote !== undefined && response.tick.epoch !== undefined) {
          receivedMarketData = true
          clearFirstDataTimer()
          if (usingDirectFallback) this.forceDirectFallback = false
          const price = Number(response.tick.quote)
          const epoch = Number(response.tick.epoch)
          if (!Number.isFinite(price) || !Number.isFinite(epoch) || price <= 0) {
            this.onStatus?.('error', 'Deriv returned an invalid live price.')
            return
          }
          const epochMs = epoch * 1000
          const bucket = candleBucketMs(epoch, this.timeframe)
          const last = this.candles[this.candles.length - 1]
          if (!last || last.time !== bucket) this.candles = [...this.candles, { time: bucket, open: price, high: price, low: price, close: price }]
          else this.candles = [...this.candles.slice(0, -1), { ...last, high: Math.max(last.high, price), low: Math.min(last.low, price), close: price }]
          this.candles = this.candles.slice(-300)
          this.onUpdate?.(this.candles, price, epochMs)
        }
      } catch {
        this.onStatus?.('error', 'Received invalid market-data message.')
        socket.close()
      }
    }

    socket.onerror = () => {
      if (this.stopped || generation !== this.connectionGeneration) return
      this.onStatus?.('connecting')
    }

    socket.onclose = (event) => {
      clearFirstDataTimer()
      if (this.pingTimer !== null) {
        globalThis.clearInterval(this.pingTimer)
        this.pingTimer = null
      }
      if (this.stopped || generation !== this.connectionGeneration) return
      this.socket = null
      if (!receivedMarketData && !usingDirectFallback) this.forceDirectFallback = true
      const switchingToDirectFallback = this.forceDirectFallback && !receivedMarketData
      if (switchingToDirectFallback) {
        this.onStatus?.('connecting')
        this.reconnectAttempt = 0
      } else {
        this.onStatus?.('connecting')
      }
      this.scheduleReconnect(generation)
    }
  }

  private scheduleReconnect(generation: number): void {
    if (this.stopped || generation !== this.connectionGeneration || this.reconnectTimer !== null) return
    const baseDelay = Math.min(30000, 1000 * (2 ** Math.min(this.reconnectAttempt, 5)))
    const jitter = Math.floor(Math.random() * Math.min(5000, Math.max(250, baseDelay * 0.2)))
    this.reconnectAttempt += 1
    this.reconnectTimer = globalThis.setTimeout(() => {
      this.reconnectTimer = null
      this.openSocket(generation)
    }, baseDelay + jitter)
  }

  disconnect(): void {
    this.stopped = true
    this.connectionGeneration += 1
    if (this.reconnectTimer !== null) globalThis.clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    if (this.pingTimer !== null) {
      globalThis.clearInterval(this.pingTimer)
      this.pingTimer = null
    }
    const socket = this.socket
    this.socket = null
    socket?.close()
    this.onUpdate = undefined
    this.onStatus = undefined
    this.webSocketUrlProvider = undefined
  }
}

