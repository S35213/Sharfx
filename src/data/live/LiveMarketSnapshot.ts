import type { OHLCV, Timeframe } from '../../types'
import { evaluateMarketDataHealth, type MarketDataHealth } from './marketDataHealth'
import type { LiveMarketTransport } from './LiveMarketDataSource'

export interface LiveMarketSnapshot {
  candles: OHLCV[]
  health: MarketDataHealth
}

export interface LiveMarketSnapshotOptions {
  nowSeconds: number
  staleAfterIntervals?: number
}

export async function getLiveMarketSnapshot(
  transport: LiveMarketTransport,
  symbol: string,
  timeframe: Timeframe,
  limit: number,
  options: LiveMarketSnapshotOptions,
): Promise<LiveMarketSnapshot> {
  const candles = await transport.getCandles(symbol, timeframe, limit)
  const health = evaluateMarketDataHealth(candles, timeframe, options.nowSeconds, options.staleAfterIntervals)
  return { candles, health }
}
