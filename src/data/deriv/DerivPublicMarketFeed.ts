import type { OHLCV, Timeframe } from '../../types'

export const DERIV_PUBLIC_WS_URL = 'wss://ws.binaryws.com/websockets/v3'

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

export const toDerivSymbol = (symbol: string): string => {
  const normalized = symbol.replace('/', '').toUpperCase()
  return normalized.length === 6 ? `frx${normalized}` : symbol
}

interface DerivTickResponse {
  msg_type?: string
  tick?: { epoch?: number; quote?: number; symbol?: string }
  candles?: Array<{ epoch?: number; open?: number; high?: number; low?: number; close?: number }>
  error?: { message?: string }
  errors?: Array<{ message?: string }>
}

const toCandles = (items: DerivTickResponse['candles']): OHLCV[] => (items ?? []).flatMap((item) => {
  const { epoch, open, high, low, close } = item
  if (![epoch, open, high, low, close].every((value) => typeof value === 'number' && Number.isFinite(value))) return []
  if (high! < Math.max(open!, close!) || low! > Math.min(open!, close!) || low! > high!) return []
  return [{ time: Math.trunc(epoch! * 1000), open: open!, high: high!, low: low!, close: close! }]
})

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
    this.reconnectAttempt = 0
    this.stopped = false
    this.connectionGeneration += 1
    this.openSocket(this.connectionGeneration)
  }

  private async openSocket(generation: number): Promise<void> {
    if (this.stopped || generation !== this.connectionGeneration) return
    this.onStatus?.('connecting')

    let wsUrl = DERIV_PUBLIC_WS_URL
    if (this.webSocketUrlProvider) {
      try {
        wsUrl = await this.webSocketUrlProvider()
      } catch {
        // Read-only market data does not require account authentication.
        // Keep the market stream healthy by silently falling back to Deriv's public feed.
        wsUrl = DERIV_PUBLIC_WS_URL
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
      socket.send(JSON.stringify({ ticks_history: this.symbol, end: 'latest', count: 300, style: 'candles', granularity: timeframeSeconds[this.timeframe], subscribe: 0, req_id: 1 }))
      socket.send(JSON.stringify({ ticks: this.symbol, subscribe: 1, req_id: 2 }))
    }

    socket.onmessage = (event) => {
      if (this.stopped || generation !== this.connectionGeneration) return
      try {
        const response = JSON.parse(String(event.data)) as DerivTickResponse
        const responseError = response.error?.message ?? response.errors?.find((item) => typeof item?.message === 'string')?.message
        if (responseError) {
          this.onStatus?.('error', responseError)
          socket.close()
          return
        }
        if (response.msg_type === 'candles') {
          this.candles = toCandles(response.candles).sort((a, b) => a.time - b.time).slice(-300)
          const lastCandle = this.candles[this.candles.length - 1]
          if (lastCandle) this.onUpdate?.(this.candles, lastCandle.close, Math.trunc(lastCandle.time))
          return
        }
        if (response.msg_type === 'tick' && response.tick?.quote !== undefined && response.tick.epoch !== undefined) {
          const price = Number(response.tick.quote)
          const epoch = Number(response.tick.epoch)
          if (!Number.isFinite(price) || !Number.isFinite(epoch) || price <= 0) {
            this.onStatus?.('error', 'Deriv returned an invalid live price.')
            return
          }
          const epochMs = epoch * 1000
          const bucket = Math.floor(epoch / timeframeSeconds[this.timeframe]) * timeframeSeconds[this.timeframe] * 1000
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
      this.onStatus?.('error', 'Deriv market-data WebSocket connection failed.')
    }

    socket.onclose = () => {
      if (this.pingTimer !== null) {
        globalThis.clearInterval(this.pingTimer)
        this.pingTimer = null
      }
      if (this.stopped || generation !== this.connectionGeneration) return
      this.socket = null
      this.onStatus?.('disconnected')
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
