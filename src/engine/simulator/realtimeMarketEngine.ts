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
  W1: 604800,
}
const MONDAY_WEEK_ANCHOR_SECONDS = 345600
const bucketStart = (time: number, timeframe: Timeframe): number => timeframe === 'W1' ? Math.floor((time - MONDAY_WEEK_ANCHOR_SECONDS) / 604800) * 604800 + MONDAY_WEEK_ANCHOR_SECONDS : Math.floor(time / TIMEFRAME_SECONDS[timeframe]) * TIMEFRAME_SECONDS[timeframe]

const finitePositive = (value: number): boolean => Number.isFinite(value) && value > 0

const aggregate = (base: OHLCV[], timeframe: Timeframe, precision: number, limit = 300): OHLCV[] => {
  const groups = new Map<number, OHLCV>()

  for (const candle of base) {
    const bucket = bucketStart(candle.time, timeframe)
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

  constructor(spec: SymbolSpec, timeframe: Timeframe, initialM1Candles: OHLCV[], initialBid?: number, _initialTimestamp?: number) {
    if (!initialM1Candles.length) throw new Error('Simulator requires M1 history.')
    this.spec = spec
    this.timeframe = timeframe
    const maxDemoRange = Math.max(spec.pipSize, 0.000001) * 6
    this.m1Candles = initialM1Candles
      .filter((candle) => finitePositive(candle.open) && finitePositive(candle.high) && finitePositive(candle.low) && finitePositive(candle.close))
      .sort((a, b) => a.time - b.time)
      .slice(-60000)
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

    // The simulator price path is synthetic, but its clock is not. Rebase the
    // historical seed data onto the actual current minute so every displayed
    // timeframe follows the real-world wall clock instead of an old mock date.
    const nowSeconds = Math.floor(Date.now() / 1000)
    const currentMinute = Math.floor(nowSeconds / 60) * 60
    const sourceLastMinute = Math.floor(last.time / 60) * 60
    const timeShift = currentMinute - sourceLastMinute
    if (timeShift !== 0) {
      for (const candle of this.m1Candles) candle.time += timeShift
    }

    this.simulatedTime = nowSeconds
    this.bid = initialBid !== undefined && finitePositive(initialBid) ? Number(initialBid) : last.close
    const seed = seedFor(spec.baseCurrency + spec.quoteCurrency)
    this.phase = (seed % 10000) / 10000 * Math.PI * 2
  }

  private displayCandles(): OHLCV[] {
    // The candle close is always the simulator bid. Higher timeframes are
    // still aggregated from the same M1 stream. The quote heartbeat is shared
    // across timeframes; only the bar grouping changes as the chart timeframe changes.
    return aggregate(this.m1Candles, this.timeframe, this.spec.pricePrecision, 300)
  }

  tickOnce(simulatedSeconds = 1): SimulatorSnapshot {
    this.tick += 1
    this.simulatedTime += Math.max(1, Math.trunc(simulatedSeconds))

    const pip = Math.max(this.spec.pipSize, 0.000001)
    const last = this.m1Candles[this.m1Candles.length - 1]
    const distanceFromOpen = last ? this.bid - last.open : 0

    // One quote/tick stream drives every timeframe. MT5 builds higher timeframes
    // from the same underlying minute/tick data; changing from H1 to H4 or D1
    // changes the bar grouping, not the frequency of incoming price updates.
    // Keep the simulator market feed independent of the selected display timeframe.
    const marketProfile = {
      cycleSeconds: 1200,
      pipsPerTick: 0.095,
      inertia: 0.985,
    }
    const slowWave =
      Math.sin((this.simulatedTime / marketProfile.cycleSeconds) * Math.PI * 2 + this.phase) * 0.68 +
      Math.sin((this.simulatedTime / (marketProfile.cycleSeconds * 0.41)) * Math.PI * 2 + this.phase * 0.71) * 0.18
    const microWave =
      Math.sin(this.tick * 1.91 + this.phase * 1.7) * 0.10 +
      Math.sin(this.tick * 3.37 + this.phase * 0.43) * 0.05
    const pullback = -Math.sign(distanceFromOpen) * Math.min(Math.abs(distanceFromOpen) / pip, 14) * 0.010
    const signal = slowWave + microWave + pullback

    this.momentum = this.momentum * marketProfile.inertia + signal * (1 - marketProfile.inertia)
    if (this.momentum > 0.06) this.lastDirection = 1
    else if (this.momentum < -0.06) this.lastDirection = -1

    const impulse =
      marketProfile.pipsPerTick *
      (0.84 + Math.min(1, Math.abs(this.momentum)) * 0.24 + Math.sin(this.tick * 2.71 + this.phase) * 0.10)
    const signedImpulse = Math.max(0.035, Math.abs(impulse))

    const next = Math.max(
      pip / 10,
      Number((this.bid + this.lastDirection * pip * signedImpulse).toFixed(this.spec.pricePrecision)),
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
