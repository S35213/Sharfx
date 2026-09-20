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
  private momentum = 0
  private lastDirection = 1

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
    // The candle close is always the simulator bid. Higher timeframes are
    // still aggregated from the same M1 stream, but the stream itself uses a
    // slower, smoother price path as the timeframe grows. This keeps BUY/SELL
    // and the live candle on one source of truth instead of letting the quote
    // drift away from the candle body.
    return aggregate(this.m1Candles, this.timeframe, this.spec.pricePrecision, 300)
  }

  tickOnce(simulatedSeconds = 1): SimulatorSnapshot {
    this.tick += 1
    this.simulatedTime += Math.max(1, Math.trunc(simulatedSeconds))

    const pip = Math.max(this.spec.pipSize, 0.000001)
    const last = this.m1Candles[this.m1Candles.length - 1]
    const distanceFromOpen = last ? this.bid - last.open : 0

    // The previous simulator used fast sine waves, so even H1/H4 candles
    // could cross their open and flip colour several times per minute. A real
    // study feed should behave more like a smooth market path: persistent
    // directional drift, small micro-noise, and slower regime changes as the
    // selected timeframe increases.
    const profile: Record<Timeframe, { cycleSeconds: number; pipsPerSecond: number; inertia: number }> = {
      M1: { cycleSeconds: 90, pipsPerSecond: 0.12, inertia: 0.975 },
      M5: { cycleSeconds: 240, pipsPerSecond: 0.095, inertia: 0.985 },
      M15: { cycleSeconds: 600, pipsPerSecond: 0.085, inertia: 0.99 },
      M30: { cycleSeconds: 1200, pipsPerSecond: 0.075, inertia: 0.992 },
      H1: { cycleSeconds: 2400, pipsPerSecond: 0.065, inertia: 0.994 },
      H4: { cycleSeconds: 7200, pipsPerSecond: 0.055, inertia: 0.996 },
      D1: { cycleSeconds: 14400, pipsPerSecond: 0.05, inertia: 0.997 },
    }
    const selectedProfile = profile[this.timeframe]
    const slowWave =
      Math.sin((this.simulatedTime / selectedProfile.cycleSeconds) * Math.PI * 2 + this.phase) * 0.78 +
      Math.sin((this.simulatedTime / (selectedProfile.cycleSeconds * 0.63)) * Math.PI * 2 + this.phase * 0.71) * 0.22
    const microNoise = Math.sin(this.tick * 0.17 + this.phase * 1.7) * 0.05
    const pullback = -Math.sign(distanceFromOpen) * Math.min(Math.abs(distanceFromOpen) / pip, 12) * 0.012
    const signal = slowWave + microNoise + pullback

    this.momentum = this.momentum * selectedProfile.inertia + signal * (1 - selectedProfile.inertia)
    if (this.momentum > 0.06) this.lastDirection = 1
    else if (this.momentum < -0.06) this.lastDirection = -1

    const moveInPips = selectedProfile.pipsPerSecond * (0.72 + Math.min(1, Math.abs(this.momentum)) * 0.28)
    const next = Math.max(
      pip / 10,
      Number((this.bid + this.lastDirection * pip * moveInPips).toFixed(this.spec.pricePrecision)),
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
