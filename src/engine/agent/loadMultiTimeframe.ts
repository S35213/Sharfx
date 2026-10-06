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
    let cancelled = false
    // Do not compete with the chart's first market connection. Wait until the
    // chart has real candles, or an explicit rescan requests fresh history.
    if (fallbackCandles.length === 0 && baseM1Candles.length === 0 && refreshKey === 0) return

    const load = async (): Promise<void> => {
      const next = await loadDerivCandles(symbol, TIMEFRAMES)
      if (cancelled) return
      setFrames((previous) => {
        const merged = { ...previous, ...next }
        return merged
      })
    }

    void load()
    return () => { cancelled = true }
  }, [refreshKey, symbol])

  return {
    ...frames,
    ...(baseM1Candles.length > 0 ? { M1: baseM1Candles } : {}),
    ...(fallbackCandles.length > 0 ? { [fallbackTimeframe]: fallbackCandles } : {}),
  }
}
