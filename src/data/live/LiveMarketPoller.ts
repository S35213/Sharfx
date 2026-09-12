import type { OHLCV, Timeframe } from '../../types'
import { evaluateMarketDataHealth, type MarketDataHealth } from './marketDataHealth'
import type { LiveMarketTransport } from './LiveMarketDataSource'

export interface LiveMarketPollResult {
  candles: OHLCV[]
  health: MarketDataHealth
}

export interface LiveMarketPollerOptions {
  symbol: string
  timeframe: Timeframe
  limit?: number
  intervalMs?: number
  staleAfterIntervals?: number
  nowSeconds?: () => number
  onUpdate: (result: LiveMarketPollResult) => void
  onError?: (error: Error) => void
}

export class LiveMarketPoller {
  private timer: ReturnType<typeof setInterval> | undefined
  private inFlight = false

  constructor(private readonly transport: LiveMarketTransport, private readonly options: LiveMarketPollerOptions) {
    if (!options.symbol.trim()) throw new Error('A symbol is required for live market polling.')
    if (!Number.isInteger(options.limit ?? 300) || (options.limit ?? 300) < 2) throw new Error('Live market polling limit must be at least 2.')
    if (!Number.isInteger(options.intervalMs ?? 5_000) || (options.intervalMs ?? 5_000) <= 0) throw new Error('Live market polling interval must be a positive integer.')
  }

  async poll(): Promise<void> {
    if (this.inFlight) return
    this.inFlight = true
    try {
      const candles = await this.transport.getCandles(this.options.symbol, this.options.timeframe, this.options.limit ?? 300)
      const health = evaluateMarketDataHealth(candles, this.options.timeframe, (this.options.nowSeconds ?? (() => Date.now() / 1000))(), this.options.staleAfterIntervals ?? 3)
      this.options.onUpdate({ candles, health })
    } catch (error) {
      this.options.onError?.(error instanceof Error ? error : new Error('Live market polling failed.'))
    } finally {
      this.inFlight = false
    }
  }

  start(): void {
    this.stop()
    void this.poll()
    this.timer = setInterval(() => { void this.poll() }, this.options.intervalMs ?? 5_000)
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer)
    this.timer = undefined
  }
}
