import { useEffect, useState } from 'react'
import { TIMEFRAMES, type OHLCV, type Timeframe } from '../../types'
import { marketDataSource } from '../../data/createMarketDataSource'

export const useMultiTimeframeCandles = (symbol: string, fallbackTimeframe: Timeframe, fallbackCandles: OHLCV[]): Partial<Record<Timeframe, OHLCV[]>> => {
  const [frames, setFrames] = useState<Partial<Record<Timeframe, OHLCV[]>>>({ [fallbackTimeframe]: fallbackCandles })
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const entries = await Promise.all(TIMEFRAMES.map(async (tf) => {
        if (tf === fallbackTimeframe) return [tf, fallbackCandles] as const
        try { return [tf, await marketDataSource.getCandles(symbol, tf)] as const } catch { return [tf, []] as const }
      }))
      if (!cancelled) setFrames(Object.fromEntries(entries.filter(([, data]) => data.length > 0)) as Partial<Record<Timeframe, OHLCV[]>>)
    }
    void load()
    return () => { cancelled = true }
  }, [symbol, fallbackTimeframe, fallbackCandles])
  return frames
}
