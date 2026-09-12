import type { OHLCV, Timeframe } from '../../types'

export const DERIV_PUBLIC_WS_URL = 'wss://api.derivws.com/trading/v1/options/ws/public'

const timeframeSeconds: Record<Timeframe, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  M30: 1800,
  H1: 3600,
  H4: 14400,
  D1: 86400,
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
}

const toCandles = (items: DerivTickResponse['candles']): OHLCV[] => (items ?? []).flatMap((item) => {
  const { epoch, open, high, low, close } = item
  if (![epoch, open, high, low, close].every((value) => typeof value === 'number' && Number.isFinite(value))) return []
  if (high! < Math.max(open!, close!) || low! > Math.min(open!, close!) || low! > high!) return []
  return [{ time: Math.trunc(epoch! * 1000), open: open!, high: high!, low: low!, close: close! }]
})

export class DerivPublicMarketFeed {
  private socket: WebSocket | null = null
  private symbol = ''
  private timeframe: Timeframe = 'M5'
  private candles: OHLCV[] = []
  private onUpdate?: (candles: OHLCV[], price: number, epoch: number) => void
  private onStatus?: (status: 'connecting' | 'connected' | 'disconnected' | 'error', message?: string) => void

  connect(symbol: string, timeframe: Timeframe, callbacks: { onUpdate: (candles: OHLCV[], price: number, epoch: number) => void; onStatus: (status: 'connecting' | 'connected' | 'disconnected' | 'error', message?: string) => void }): void {
    this.disconnect()
    this.symbol = toDerivSymbol(symbol)
    this.timeframe = timeframe
    this.onUpdate = callbacks.onUpdate
    this.onStatus = callbacks.onStatus
    this.onStatus('connecting')
    const socket = new WebSocket(DERIV_PUBLIC_WS_URL)
    this.socket = socket

    socket.onopen = () => {
      this.onStatus?.('connected')
      socket.send(JSON.stringify({ ticks_history: this.symbol, end: 'latest', count: 200, style: 'candles', granularity: timeframeSeconds[this.timeframe], subscribe: 0, req_id: 1 }))
      socket.send(JSON.stringify({ ticks: this.symbol, subscribe: 1, req_id: 2 }))
    }

    socket.onmessage = (event) => {
      try {
        const response = JSON.parse(String(event.data)) as DerivTickResponse
        if (response.error?.message) {
          this.onStatus?.('error', response.error.message)
          return
        }
        if (response.msg_type === 'candles') {
          this.candles = toCandles(response.candles).sort((a, b) => a.time - b.time)
          return
        }
        if (response.msg_type === 'tick' && response.tick?.quote !== undefined && response.tick.epoch !== undefined) {
          const price = response.tick.quote
          const epochMs = response.tick.epoch * 1000
          const bucket = Math.floor(response.tick.epoch / timeframeSeconds[this.timeframe]) * timeframeSeconds[this.timeframe] * 1000
          const last = this.candles[this.candles.length - 1]
          if (!last || last.time !== bucket) this.candles = [...this.candles, { time: bucket, open: price, high: price, low: price, close: price }]
          else this.candles = [...this.candles.slice(0, -1), { ...last, high: Math.max(last.high, price), low: Math.min(last.low, price), close: price }]
          this.candles = this.candles.slice(-300)
          this.onUpdate?.(this.candles, price, epochMs)
        }
      } catch {
        this.onStatus?.('error', 'Received invalid market-data message.')
      }
    }
    socket.onerror = () => this.onStatus?.('error', 'Deriv public market-data connection failed.')
    socket.onclose = () => this.onStatus?.('disconnected')
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
    this.onUpdate = undefined
    this.onStatus = undefined
  }
}
