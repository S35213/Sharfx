import { useEffect, useState } from 'react'
import { TIMEFRAMES, type OHLCV, type Timeframe } from '../../types'
import { fetchDerivMultiTimeframeCandles } from '../../data/deriv/DerivPublicMarketFeed'

const loadDerivCandles = async (symbol: string, timeframes: Timeframe[]): Promise<Partial<Record<Timeframe, OHLCV[]>>> => {
  try {
    return await fetchDerivMultiTimeframeCandles(symbol, timeframes)
  } catch {
    return {}
  }
}

export const useMultiTimeframeCandles = (
  symbol: string,
  fallbackTimeframe: Timeframe,
  fallbackCandles: OHLCV[],
  baseM1Candles: OHLCV[] = [],
  refreshKey = 0,
): Partial<Record<Timeframe, OHLCV[]>> => {
  const [frames, setFrames] = useState<Partial<Record<Timeframe, OHLCV[]>>>(
    fallbackCandles.length > 0 ? { [fallbackTimeframe]: fallbackCandles } : {},
  )

  useEffect(() => {
    if (baseM1Candles.length > 0) {
      setFrames((previous) => ({ ...previous, M1: baseM1Candles }))
      return
    }
    if (fallbackCandles.length > 0) {
      setFrames((previous) => ({ ...previous, [fallbackTimeframe]: fallbackCandles }))
    }
  }, [baseM1Candles, fallbackCandles, fallbackTimeframe])

  useEffect(() => {
    if (baseM1Candles.length > 0) return
    let cancelled = false

    const load = async (): Promise<void> => {
      const next = await loadDerivCandles(symbol, TIMEFRAMES)
      if (cancelled) return
      if (fallbackCandles.length > 0) next[fallbackTimeframe] = fallbackCandles
      setFrames(next)
    }

    void load()
    return () => { cancelled = true }
  }, [baseM1Candles.length, fallbackCandles, fallbackTimeframe, refreshKey, symbol])

  return frames
}
