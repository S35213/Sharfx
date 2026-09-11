import type { OHLCV, Timeframe } from '../../types'

interface GenerateOptions {
  count: number
  startPrice: number
  pipSize: number
  pricePrecision: number
  timeframe: Timeframe
  seed: number
}

const INTERVAL_SECONDS: Record<Timeframe, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  M30: 1800,
  H1: 3600,
  H4: 14400,
  D1: 86400,
}

const PRICE_BY_SYMBOL: Record<string, number> = {
  'EUR/USD': 1.08542,
  'GBP/USD': 1.26315,
  'USD/JPY': 149.85,
  'USD/CHF': 0.8842,
  'AUD/USD': 0.6512,
  'USD/CAD': 1.3625,
  'NZD/USD': 0.6085,
}

const PRECISION_BY_SYMBOL: Record<string, number> = {
  'USD/JPY': 3,
}

const hash = (value: string): number => {
  let h = 2166136261
  for (let i = 0; i < value.length; i += 1) h = Math.imul(h ^ value.charCodeAt(i), 16777619)
  return h >>> 0
}

const rng = (seed: number): (() => number) => {
  let state = seed >>> 0
  return () => {
    state = Math.imul(1664525, state) + 1013904223
    return (state >>> 0) / 4294967296
  }
}

export const generateMockCandles = (opts: GenerateOptions): OHLCV[] => {
  const { count, startPrice, pipSize, pricePrecision, timeframe, seed } = opts
  const random = rng(seed)
  const interval = INTERVAL_SECONDS[timeframe]
  const endSec = 1705320000
  let price = startPrice
  const candles: OHLCV[] = []

  for (let i = 0; i < count; i += 1) {
    const time = endSec - (count - i) * interval
    const drift = (random() - 0.48) * pipSize * 8
    const open = price
    const close = Math.max(pipSize, open + drift)
    const high = Math.max(open, close) + random() * pipSize * 5
    const low = Math.max(pipSize / 10, Math.min(open, close) - random() * pipSize * 5)
    candles.push({
      time,
      open: Number(open.toFixed(pricePrecision)),
      high: Number(high.toFixed(pricePrecision)),
      low: Number(low.toFixed(pricePrecision)),
      close: Number(close.toFixed(pricePrecision)),
      volume: Math.floor(100 + random() * 900),
    })
    price = close
  }
  return candles
}

export const validateCandles = (data: OHLCV[]): OHLCV[] => {
  const sorted = [...data]
    .filter((c) => Number.isFinite(c.time) && Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close))
    .filter((c) => c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close))
    .sort((a, b) => a.time - b.time)

  const seen = new Set<number>()
  return sorted.filter((c) => {
    if (seen.has(c.time)) return false
    seen.add(c.time)
    return true
  })
}

const cache = new Map<string, OHLCV[]>()

export const getMockCandles = (symbol: string, timeframe: Timeframe, limit = 300): OHLCV[] => {
  const key = `${symbol}|${timeframe}|${limit}`
  const cached = cache.get(key)
  if (cached) return cached

  const specPrecision = PRECISION_BY_SYMBOL[symbol] ?? 5
  const pipSize = symbol.includes('JPY') ? 0.01 : 0.0001
  const raw = generateMockCandles({
    count: Math.max(10, Math.min(limit, 1000)),
    startPrice: PRICE_BY_SYMBOL[symbol] ?? PRICE_BY_SYMBOL['EUR/USD'],
    pipSize,
    pricePrecision: specPrecision,
    timeframe,
    seed: hash(key),
  })
  const validated = validateCandles(raw)
  cache.set(key, validated)
  return validated
}
