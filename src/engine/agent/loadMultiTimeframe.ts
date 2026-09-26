import { useEffect, useState } from 'react'
import { TIMEFRAMES, type OHLCV, type Timeframe } from '../../types'
import { DerivPublicMarketFeed } from '../../data/deriv/DerivPublicMarketFeed'

const loadDerivCandles = (symbol: string, timeframe: Timeframe): Promise<OHLCV[]> => new Promise((resolve, reject) => {
  const feed = new DerivPublicMarketFeed()
  let timer: ReturnType<typeof setTimeout> | undefined

  const finish = (result: OHLCV[] | Error): void => {
    if (timer) clearTimeout(timer)
    feed.disconnect()
    if (result instanceof Error) reject(result)
    else resolve(result)
  }

  timer = setTimeout(() => finish(new Error('Deriv historical candle request timed out.')), 12000)

  feed.connect(symbol, timeframe, {
    onUpdate: (candles) => {
      if (candles.length >= 5) finish(candles)
    },
    onStatus: (status, message) => {
      if (status === 'error') finish(new Error(message || 'Deriv historical candle request failed.'))
    },
  })
})

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
      return
    }
    if (fallbackCandles.length > 0) {
      setFrames((previous) => ({ ...previous, [fallbackTimeframe]: fallbackCandles }))
    }
  }, [baseM1Candles.length, fallbackCandles, fallbackTimeframe])

  useEffect(() => {
    if (baseM1Candles.length > 0) return
    let cancelled = false

    const load = async (): Promise<void> => {
      const results = await Promise.all(TIMEFRAMES.map(async (timeframe) => {
        try {
          return [timeframe, await loadDerivCandles(symbol, timeframe)] as const
        } catch {
          return [timeframe, []] as const
        }
      }))

      if (cancelled) return

      const next = Object.fromEntries(results.filter(([, data]) => data.length > 0)) as Partial<Record<Timeframe, OHLCV[]>>
      if (fallbackCandles.length > 0) next[fallbackTimeframe] = fallbackCandles
      setFrames(next)
    }

    void load()
    return () => { cancelled = true }
  }, [baseM1Candles.length, fallbackCandles, fallbackTimeframe, refreshKey, symbol])

  return frames
}
