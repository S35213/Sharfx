import type { OHLCV, SymbolSpec, Timeframe } from '../../types'

export interface SimulatorSnapshot {
  bid: number
  ask: number
  timestamp: number
  m1Candles: OHLCV[]
  candles: OHLCV[]
}

const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  M30: 1800,
  H1: 3600,
  H4: 14400,
  D1: 86400,
}

const finitePositive = (value: number): boolean => Number.isFinite(value) && value > 0

const aggregate = (base: OHLCV[], timeframe: Timeframe, precision: number, limit = 300): OHLCV[] => {
  const interval = TIMEFRAME_SECONDS[timeframe]
  const groups = new Map<number, OHLCV>()

  for (const candle of base) {
    const bucket = Math.floor(candle.time / interval) * interval
    const current = groups.get(bucket)

    if (!current) {
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

    current.high = Math.max(current.high, candle.high)
    current.low = Math.min(current.low, candle.low)
    current.close = candle.close
    current.volume = (current.volume ?? 0) + (candle.volume ?? 0)
  }

  return [...groups.values()]
    .sort((a, b) => a.time - b.time)
    .slice(-limit)
    .map((candle) => ({
      ...candle,
      open: Number(candle.open.toFixed(precision)),
      high: Number(candle.high.toFixed(precision)),
      low: Number(candle.low.toFixed(precision)),
      close: Number(candle.close.toFixed(precision)),
    }))
}

const seedFor = (symbol: string): number => {
  let value = 2166136261
  for (let index = 0; index < symbol.length; index += 1) value = Math.imul(value ^ symbol.charCodeAt(index), 16777619)
  return value >>> 0
}

export class SimulatorRealtimeMarketEngine {
  private readonly spec: SymbolSpec
  private readonly timeframe: Timeframe
  private readonly m1Candles: OHLCV[]
  private simulatedTime: number
  private bid: number
  private tick = 0
  private phase: number
  private higherTimeframeDirection: -1 | 0 | 1 = 0
  private higherTimeframeBucket: number | null = null

  constructor(spec: SymbolSpec, timeframe: Timeframe, initialM1Candles: OHLCV[], initialBid?: number, initialTimestamp?: number) {
    if (!initialM1Candles.length) throw new Error('Simulator requires M1 history.')
    this.spec = spec
    this.timeframe = timeframe
    const maxDemoRange = Math.max(spec.pipSize, 0.000001) * 6
    this.m1Candles = initialM1Candles
      .filter((candle) => finitePositive(candle.open) && finitePositive(candle.high) && finitePositive(candle.low) && finitePositive(candle.close))
      .sort((a, b) => a.time - b.time)
      .slice(-12000)
      .map((candle) => {
        const bodyHigh = Math.max(candle.open, candle.close)
        const bodyLow = Math.min(candle.open, candle.close)
        const body = bodyHigh - bodyLow
        if (body >= maxDemoRange || candle.high - candle.low <= maxDemoRange) return candle

        const remainingWick = Math.max(0, maxDemoRange - body)
        const halfWick = remainingWick / 2
        return {
          ...candle,
          high: Number((bodyHigh + halfWick).toFixed(spec.pricePrecision)),
          low: Number((bodyLow - halfWick).toFixed(spec.pricePrecision)),
        }
      })

    const last = this.m1Candles[this.m1Candles.length - 1]
    if (!last) throw new Error('Simulator M1 history is invalid.')
    this.simulatedTime = Number.isFinite(initialTimestamp) ? Number(initialTimestamp) : last.time
    this.bid = initialBid !== undefined && finitePositive(initialBid) ? Number(initialBid) : last.close
    const seed = seedFor(spec.baseCurrency + spec.quoteCurrency)
    this.phase = (seed % 10000) / 10000 * Math.PI * 2
  }

  private displayCandles(): OHLCV[] {
    const raw = aggregate(this.m1Candles, this.timeframe, this.spec.pricePrecision, 300)
    if (!['H1', 'H4', 'D1'].includes(this.timeframe) || raw.length === 0) return raw

    const current = raw[raw.length - 1]
    if (this.higherTimeframeBucket !== current.time) {
      this.higherTimeframeBucket = current.time
      this.higherTimeframeDirection = 0
    }

    if (this.higherTimeframeDirection === 0 && current.close !== current.open) {
      this.higherTimeframeDirection = current.close > current.open ? 1 : -1
    }

    // Higher timeframes still receive the live high/low information, but their
    // body direction is latched for the life of the forming bar. This prevents
    // one-second simulator ticks from making H1/H4/D1 flash green/red as price
    // crosses the opening price repeatedly. The finished bar remains the true
    // OHLC result because it is replaced by the next aggregate calculation.
    const close = this.higherTimeframeDirection === 1
      ? Math.max(current.open, current.close)
      : this.higherTimeframeDirection === -1
        ? Math.min(current.open, current.close)
        : current.open

    return [
      ...raw.slice(0, -1),
      { ...current, close: Number(close.toFixed(this.spec.pricePrecision)) },
    ]
  }

  tickOnce(simulatedSeconds = 1): SimulatorSnapshot {
    this.tick += 1
    this.simulatedTime += Math.max(1, Math.trunc(simulatedSeconds))

    const pip = Math.max(this.spec.pipSize, 0.000001)
    const last = this.m1Candles[this.m1Candles.length - 1]
    const distanceFromOpen = last ? this.bid - last.open : 0

    // This is intentionally a tick-driven walk rather than a bar-driven jump.
    // The current bar reacts to every tick and can flip bullish/bearish before
    // the timeframe closes, matching the way a live forming MT5 bar behaves.
    const wave =
      Math.sin(this.tick * 0.31 + this.phase) * 0.58 +
      Math.sin(this.tick * 0.071 + this.phase * 0.53) * 0.27 +
      Math.sin(this.tick * 1.17 + this.phase * 1.11) * 0.15

    const pullback = -Math.sign(distanceFromOpen) * Math.min(Math.abs(distanceFromOpen) / pip, 2.6) * 0.18
    const moveInPips = 0.35 + Math.abs(wave) * 0.95
    const direction = Math.sign(wave + pullback || 1)
    const next = Math.max(
      pip / 10,
      Number((this.bid + direction * pip * moveInPips).toFixed(this.spec.pricePrecision)),
    )

    this.bid = next

    const bucket = Math.floor(this.simulatedTime / 60) * 60
    const current = this.m1Candles[this.m1Candles.length - 1]

    if (!current || current.time !== bucket) {
      this.m1Candles.push({
        time: bucket,
        open: this.bid,
        high: this.bid,
        low: this.bid,
        close: this.bid,
        volume: 1,
      })
    } else {
      current.high = Math.max(current.high, this.bid)
      current.low = Math.min(current.low, this.bid)
      current.close = this.bid
      current.volume = (current.volume ?? 0) + 1
    }

    while (this.m1Candles.length > 12000) this.m1Candles.shift()

    const spread = pip * 0.8
    const ask = Number((this.bid + spread).toFixed(this.spec.pricePrecision))

    return {
      bid: this.bid,
      ask,
      timestamp: this.simulatedTime,
      m1Candles: [...this.m1Candles.slice(-12000)],
      candles: this.displayCandles(),
    }
  }

  snapshot(): SimulatorSnapshot {
    const spread = Math.max(this.spec.pipSize, 0.000001) * 0.8
    return {
      bid: this.bid,
      ask: Number((this.bid + spread).toFixed(this.spec.pricePrecision)),
      timestamp: this.simulatedTime,
      m1Candles: [...this.m1Candles.slice(-12000)],
      candles: this.displayCandles(),
    }
  }
}
