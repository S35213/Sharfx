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
  // Staging uses Deriv's public socket directly so Cloudflare proxy latency/failure
  // cannot hold the chart in CONNECTING. The deployed UI still runs on Cloudflare.
  if (hostname === 'sharfx-pr55-staging.150sharingan2.workers.dev') return DERIV_PUBLIC_WS_URL
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
  adjust_start_time: 1,
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

const openPublicMarketSocket = (timeoutMs = 3500): Promise<WebSocket> => new Promise((resolve, reject) => {
  const socket = new WebSocket(getDerivMarketWebSocketUrl())
  let settled = false
  const finish = (action: 'resolve' | 'reject', value?: Error): void => {
    if (settled) return
    settled = true
    globalThis.clearTimeout(timer)
    if (action === 'resolve') resolve(socket)
    else reject(value ?? new Error('Deriv public market socket failed.'))
  }
  const timer = globalThis.setTimeout(() => {
    try { socket.close() } catch (error) { void error }
    finish('reject', new Error('Deriv public market socket timed out.'))
  }, timeoutMs)
  socket.onopen = () => finish('resolve')
  socket.onerror = () => finish('reject', new Error('Deriv public market socket failed.'))
  socket.onclose = () => {
    if (!settled) finish('reject', new Error('Deriv public market socket closed before connecting.'))
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
    socket.send(JSON.stringify({ active_symbols: 'brief', req_id: 7100 }))
  })
}

export const fetchDerivMultiTimeframeCandles = async (
  symbol: string,
  timeframes: Timeframe[],
): Promise<Partial<Record<Timeframe, OHLCV[]>>> => {
  const requested = Array.from(new Set(timeframes))
  if (!requested.length) return {}

  let socket: WebSocket
  try {
    socket = await openPublicMarketSocket()
  } catch {
    return {}
  }

  let nextReqId = 8100
  const requestHistory = async (timeframe: Timeframe, count: number): Promise<OHLCV[]> => {
    const reqId = nextReqId++
    return await new Promise((resolve) => {
      let settled = false
      const timer = globalThis.setTimeout(() => finish([]), 5000)
      const finish = (candles: OHLCV[]): void => {
        if (settled) return
        settled = true
        globalThis.clearTimeout(timer)
        if (socket.onmessage === handleMessage) socket.onmessage = null
        resolve(candles)
      }
      const handleMessage = (event: MessageEvent): void => {
        try {
          const payload = JSON.parse(String(event.data)) as DerivTickResponse
          if (Number(payload.req_id) !== reqId) return
          if (payload.error?.message) {
            finish([])
            return
          }
          if (payload.msg_type !== 'candles' || !Array.isArray(payload.candles)) return
          finish(toCandles(payload.candles).sort((a, b) => a.time - b.time).slice(-count))
        } catch {
          // Ignore unrelated or malformed messages for this request.
        }
      }
      socket.onmessage = handleMessage
      socket.send(JSON.stringify(createDerivCandleHistoryRequest(toDerivSymbol(symbol), timeframe, {
        end: 'latest',
        count,
        reqId,
      })))
    })
  }

  try {
    const needsLower = requested.some((timeframe) => ['M1', 'M5', 'M15', 'M30'].includes(timeframe))
    const needsHourly = requested.some((timeframe) => ['H1', 'H4'].includes(timeframe))
    const needsDaily = requested.some((timeframe) => ['D1', 'W1'].includes(timeframe))

    // Request each anchor history sequentially on the shared socket so the
    // response handler for one request cannot replace another request's handler.
    const m1 = needsLower ? await requestHistory('M1', 600) : []
    const h1 = needsHourly ? await requestHistory('H1', 400) : []
    const d1 = needsDaily ? await requestHistory('D1', 2100) : []

    const results: Partial<Record<Timeframe, OHLCV[]>> = {}

    for (const timeframe of requested) {
      if (timeframe === 'M1') results.M1 = m1.slice(-300)
      else if (timeframe === 'M5') results.M5 = aggregateCandles(m1, 'M5').slice(-300)
      else if (timeframe === 'M15') results.M15 = aggregateCandles(m1, 'M15').slice(-300)
      else if (timeframe === 'M30') results.M30 = aggregateCandles(m1, 'M30').slice(-300)
      else if (timeframe === 'H1') results.H1 = h1.slice(-300)
      else if (timeframe === 'H4') results.H4 = aggregateCandles(h1, 'H4').slice(-300)
      else if (timeframe === 'D1') results.D1 = d1.slice(-300)
      else if (timeframe === 'W1') results.W1 = aggregateWeeklyCandles(d1).slice(-300)
    }

    return results
  } finally {
    try { socket.close() } catch (error) { void error }
  }
}

export const subscribeDerivForexQuotes = async (
  symbols: string[],
  onQuote: (symbol: string, quote: number, epoch: number) => void,
): Promise<() => void> => {
  if (!symbols.length) return () => undefined
  const socket = await openPublicMarketSocket()
  let stopped = false
  const normalizedSymbols = Array.from(new Set(symbols.map(toDerivSymbol).filter(Boolean)))

  socket.onmessage = (event: MessageEvent) => {
    if (stopped) return
    try {
      const payload = JSON.parse(String(event.data)) as DerivTickResponse
      if (payload.msg_type === 'tick' && typeof payload.tick?.symbol === 'string') {
        const quote = Number(payload.tick.quote)
        const epoch = Number(payload.tick.epoch)
        if (Number.isFinite(quote) && quote > 0 && Number.isFinite(epoch)) {
          onQuote(formatForexSymbol(payload.tick.symbol), quote, epoch)
        }
        return
      }
      if (payload.msg_type === 'history' && payload.history?.times?.length && payload.history?.prices?.length) {
        const index = Math.min(payload.history.times.length, payload.history.prices.length) - 1
        if (index < 0) return
        const epoch = Number(payload.history.times[index])
        const quote = Number(payload.history.prices[index])
        const requested = payload.req_id !== undefined ? payload.req_id - 7101 : -1
        const requestedSymbol = typeof payload.echo_req?.ticks_history === 'string' ? payload.echo_req.ticks_history : ''
        const symbol = requested >= 0 && requested < normalizedSymbols.length
          ? formatForexSymbol(normalizedSymbols[requested])
          : requestedSymbol
            ? formatForexSymbol(requestedSymbol)
            : ''
        if (symbol && Number.isFinite(epoch) && Number.isFinite(quote) && quote > 0) onQuote(symbol, quote, epoch)
      }
    } catch {
      // Ignore malformed catalog messages without interrupting the quote watch.
    }
  }

  // The public ticks endpoint accepts one symbol per request. Prime every
  // watchlist row with the latest available price, then keep each symbol live.
  normalizedSymbols.forEach((symbol, index) => {
    const reqId = 7101 + index
    socket.send(JSON.stringify({
      ticks_history: symbol,
      end: 'latest',
      count: 1,
      style: 'ticks',
      req_id: reqId,
    }))
    socket.send(JSON.stringify({
      ticks: symbol,
      subscribe: 1,
      req_id: reqId + normalizedSymbols.length,
    }))
  })

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
  echo_req?: { ticks_history?: string }
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

const aggregateCandles = (candles: OHLCV[], timeframe: Timeframe): OHLCV[] => {
  if (!candles.length) return []
  const buckets = new Map<number, OHLCV>()
  for (const candle of candles) {
    const epochSeconds = Math.floor(candle.time / 1000)
    const bucket = candleBucketMs(epochSeconds, timeframe)
    const existing = buckets.get(bucket)
    if (!existing) {
      buckets.set(bucket, { ...candle, time: bucket })
    } else {
      buckets.set(bucket, {
        time: bucket,
        open: existing.open,
        high: Math.max(existing.high, candle.high),
        low: Math.min(existing.low, candle.low),
        close: candle.close,
      })
    }
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time)
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
      count: historyDefaultCount(this.timeframe),
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
    let socketOpenTimer: ReturnType<typeof setTimeout> | null = globalThis.setTimeout(() => {
      if (this.stopped || generation !== this.connectionGeneration || socket.readyState === WebSocket.OPEN) return
      if (!usingDirectFallback) this.forceDirectFallback = true
      this.onStatus?.('connecting')
      try { socket.close(1013, 'Market socket connection timeout') } catch (error) { void error }
    }, 3500)
    const clearSocketOpenTimer = (): void => {
      if (socketOpenTimer !== null) globalThis.clearTimeout(socketOpenTimer)
      socketOpenTimer = null
    }
    const clearFirstDataTimer = (): void => {
      if (this.firstDataTimer !== null) globalThis.clearTimeout(this.firstDataTimer)
      this.firstDataTimer = null
    }
    const requestFallbackCandles = (): void => {
      this.requestHistory(socket, Math.floor(Date.now() / 1000) - 172800)
    }

    socket.onopen = () => {
      if (this.stopped || generation !== this.connectionGeneration) return
      clearSocketOpenTimer()
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
          if (toDerivSymbol(formatForexSymbol(response.tick.symbol ?? '')) !== this.symbol) return
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

    socket.onclose = () => {
      clearSocketOpenTimer()
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

