import type { OHLCV, Timeframe } from '../../types'

interface GenerateOptions { count: number; startPrice: number; pipSize: number; pricePrecision: number; timeframe: Timeframe; seed: number }

const INTERVAL_SECONDS: Record<Timeframe, number> = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D1: 86400 }
const PRICE_BY_SYMBOL: Record<string, number> = { 'EUR/USD': 1.08542, 'GBP/USD': 1.26315, 'USD/JPY': 149.85, 'USD/CHF': 0.8842, 'AUD/USD': 0.6512, 'USD/CAD': 1.3625, 'NZD/USD': 0.6085, 'XAU/USD': 2650.00 }
const PRECISION_BY_SYMBOL: Record<string, number> = { 'USD/JPY': 3, 'XAU/USD': 2 }
const BASE_M1_COUNT = 60000

const hash = (value: string): number => { let h = 2166136261; for (let i = 0; i < value.length; i += 1) h = Math.imul(h ^ value.charCodeAt(i), 16777619); return h >>> 0 }
const rng = (seed: number): (() => number) => { let state = seed >>> 0; return () => { state = Math.imul(1664525, state) + 1013904223; return (state >>> 0) / 4294967296 } }

const generateBaseM1 = (symbol: string, startPrice: number, pipSize: number, precision: number): OHLCV[] => {
  const random = rng(hash(symbol + '|coherent-m1-v2'))
  const endSec = Math.floor(Date.now() / 60000) * 60
  const startSec = endSec - (BASE_M1_COUNT - 1) * 60
  const volatility = startPrice > 100 ? pipSize * 2.8 : pipSize * 1.35
  let price = startPrice
  const raw: OHLCV[] = []
  for (let i = 0; i < BASE_M1_COUNT; i += 1) {
    const time = startSec + i * 60
    const shock = (random() - 0.5) * volatility
    const momentum = i > 0 ? (price - raw[raw.length - 1].close) * 0.12 : 0
    const open = price
    const close = Math.max(pipSize / 10, open + shock + momentum)

    // Keep candle bodies and wicks independent. The old generator reused the
    // large price shock to size both wicks, making almost every candle a long-wick bar.
    const body = Math.abs(close - open)
    const upperWick = random() < 0.18 ? 0 : pipSize * (0.05 + random() * 0.45) + body * random() * 0.25
    const lowerWick = random() < 0.18 ? 0 : pipSize * (0.05 + random() * 0.45) + body * random() * 0.25
    const high = Math.max(open, close) + upperWick
    const low = Math.max(pipSize / 10, Math.min(open, close) - lowerWick)
    raw.push({ time, open, high, low, close, volume: Math.floor(100 + random() * 900) })
    price = close
  }

  const scale = startPrice / Math.max(pipSize / 10, raw[raw.length - 1].close)
  return raw.map((c) => ({
    time: c.time,
    open: Number((c.open * scale).toFixed(precision)),
    high: Number((c.high * scale).toFixed(precision)),
    low: Number((c.low * scale).toFixed(precision)),
    close: Number((c.close * scale).toFixed(precision)),
    volume: c.volume,
  }))
}

const aggregate = (base: OHLCV[], timeframe: Timeframe, precision: number): OHLCV[] => {
  const interval = INTERVAL_SECONDS[timeframe]
  if (interval === 60) return base
  const groups = new Map<number, OHLCV>()
  for (const candle of base) {
    const bucket = Math.floor(candle.time / interval) * interval
    const current = groups.get(bucket)
    if (!current) {
      groups.set(bucket, { time: bucket, open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume ?? 0 })
      continue
    }
    current.high = Math.max(current.high, candle.high)
    current.low = Math.min(current.low, candle.low)
    current.close = candle.close
    current.volume = (current.volume ?? 0) + (candle.volume ?? 0)
  }
  return [...groups.values()].sort((a, b) => a.time - b.time).map((c) => ({
    ...c,
    open: Number(c.open.toFixed(precision)),
    high: Number(c.high.toFixed(precision)),
    low: Number(c.low.toFixed(precision)),
    close: Number(c.close.toFixed(precision)),
  }))
}

export const generateMockCandles = (opts: GenerateOptions): OHLCV[] => {
  const base = generateBaseM1('custom', opts.startPrice, opts.pipSize, opts.pricePrecision)
  return aggregate(base, opts.timeframe, opts.pricePrecision).slice(-Math.max(10, Math.min(opts.count, 1000)))
}

export const validateCandles = (data: OHLCV[]): OHLCV[] => {
  const sorted = [...data]
    .filter((c) => Number.isFinite(c.time) && Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close))
    .filter((c) => c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close))
    .sort((a, b) => a.time - b.time)
  const seen = new Set<number>()
  return sorted.filter((c) => { if (seen.has(c.time)) return false; seen.add(c.time); return true })
}

const cache = new Map<string, OHLCV[]>()
const baseCache = new Map<string, OHLCV[]>()

export const getMockCandles = (symbol: string, timeframe: Timeframe, limit = 300): OHLCV[] => {
  const key = `${symbol}|${timeframe}|${limit}`
  const cached = cache.get(key)
  if (cached) return cached

  const specPrecision = PRECISION_BY_SYMBOL[symbol] ?? 5
  const pipSize = symbol === 'XAU/USD' ? 0.01 : symbol.includes('JPY') ? 0.01 : 0.0001
  const baseKey = `${symbol}|${pipSize}|${specPrecision}`
  const base = baseCache.get(baseKey) ?? generateBaseM1(symbol, PRICE_BY_SYMBOL[symbol] ?? PRICE_BY_SYMBOL['EUR/USD'], pipSize, specPrecision)
  baseCache.set(baseKey, base)
  const aggregated = aggregate(base, timeframe, specPrecision)
  // The simulator can request a larger M1 history so higher timeframes have
  // enough completed bars to render a real chart instead of one or two candles.
  const historyLimit = Math.max(10, Math.min(limit, 12000))
  const validated = validateCandles(aggregated.slice(-historyLimit))
  cache.set(key, validated)
  return validated
}
