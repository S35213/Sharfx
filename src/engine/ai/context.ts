import type { OHLCV } from '../../types'
import type { MarketStructureResult } from '../marketStructure/types'
import type { SupportResistanceResult } from '../supportResistance/types'
import type { LiquidityResult } from '../liquidity/types'
import type { SetupResult } from '../setup/types'
import type { AITradingContext, ExternalEvent } from './types'

export const buildTradingContext = (
  symbol: string,
  timeframe: string,
  candles: OHLCV[],
  marketStructure: MarketStructureResult,
  supportResistance: SupportResistanceResult,
  liquidity: LiquidityResult,
  setup: SetupResult,
  higherTimeframeBias: string | null = null,
  externalEvents: ExternalEvent[] = [],
  timestamp?: number,
): AITradingContext => {
  const lastCandle = candles[candles.length - 1]
  const currentPrice = lastCandle?.close ?? setup.currentPrice
  const resolvedTimestamp = timestamp ?? lastCandle?.time ?? 0

  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    throw new Error('AI trading context requires a valid current price.')
  }
  if (!Number.isFinite(resolvedTimestamp) || resolvedTimestamp < 0) {
    throw new Error('AI trading context requires a valid timestamp.')
  }

  return {
    symbol,
    timeframe,
    currentPrice,
    marketStructure,
    supportResistance,
    liquidity,
    setup,
    recentCandles: candles.slice(-20).map((candle) => ({ time: candle.time, close: candle.close })),
    higherTimeframeBias,
    externalEvents,
    timestamp: resolvedTimestamp,
    dataStatus: 'simulated',
  }
}
