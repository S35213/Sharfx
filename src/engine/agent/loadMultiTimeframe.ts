import { useEffect, useState } from 'react'
import { TIMEFRAMES, type OHLCV, type Timeframe } from '../../types'
import { marketDataSource } from '../../data/createMarketDataSource'

const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  M30: 1800,
  H1: 3600,
  H4: 14400,
  D1: 86400,
  W1: 604800,
}
const MONDAY_WEEK_ANCHOR_SECONDS = 345600
const bucketStart = (time: number, timeframe: Timeframe): number => timeframe === 'W1' ? Math.floor((time - MONDAY_WEEK_ANCHOR_SECONDS) / 604800) * 604800 + MONDAY_WEEK_ANCHOR_SECONDS : Math.floor(time / TIMEFRAME_SECONDS[timeframe]) * TIMEFRAME_SECONDS[timeframe]

const aggregateFromM1 = (base: OHLCV[], timeframe: Timeframe): OHLCV[] => {
  const groups = new Map<number, OHLCV>()
  for (const candle of base) {
    const bucket = bucketStart(candle.time, timeframe)
    const existing = groups.get(bucket)
    if (!existing) {
      groups.set(bucket, {
        time: bucket,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume ?? 0,
      })
      continue
    }
    existing.high = Math.max(existing.high, candle.high)
    existing.low = Math.min(existing.low, candle.low)
    existing.close = candle.close
    existing.volume = (existing.volume ?? 0) + (candle.volume ?? 0)
  }
  return [...groups.values()].sort((a, b) => a.time - b.time).slice(-300)
}

export const useMultiTimeframeCandles = (
  symbol: string,
  fallbackTimeframe: Timeframe,
  fallbackCandles: OHLCV[],
  baseM1Candles: OHLCV[] = [],
): Partial<Record<Timeframe, OHLCV[]>> => {
  const [frames, setFrames] = useState<Partial<Record<Timeframe, OHLCV[]>>>({ [fallbackTimeframe]: fallbackCandles })

  useEffect(() => {
    if (baseM1Candles.length > 0) {
      const next = Object.fromEntries(TIMEFRAMES.map((tf) => [tf, aggregateFromM1(baseM1Candles, tf)]))
      setFrames(next as Partial<Record<Timeframe, OHLCV[]>>)
      return
    }

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
  }, [symbol, fallbackTimeframe, fallbackCandles, baseM1Candles])

  return frames
}
