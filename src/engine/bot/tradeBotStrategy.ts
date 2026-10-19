import type { OHLCV, SymbolSpec, Timeframe } from '../../types'
import type { MarketBias } from '../marketStructure/types'
import { analyzeLiquidity } from '../liquidity'
import { analyzeMarketStructure, findSwingPoints } from '../marketStructure'
import { analyzeSetup } from '../setup'
import type { SetupCandidate } from '../setup/types'
import { analyzeSupportResistance } from '../supportResistance'

export type TradeBotCheckStatus = 'PASS' | 'WATCH' | 'BLOCK'

export interface TradeBotStrategyCheck {
  id: string
  label: string
  status: TradeBotCheckStatus
  detail: string
}

export type TradeBotSignalSource = 'STRUCTURE_LIQUIDITY' | 'EMA_MOMENTUM'

export interface TradeBotStrategyMetrics {
  closedCandles: number
  emaFast: number | null
  emaSlow: number | null
  rsi: number | null
  atr: number | null
}

export interface TradeBotStrategyResult {
  setup: SetupCandidate | null
  source: TradeBotSignalSource | null
  score: number | null
  signalCandleTime: number | null
  reason: string
  checks: TradeBotStrategyCheck[]
  metrics: TradeBotStrategyMetrics
}

const emptyMetrics = (closedCandles = 0): TradeBotStrategyMetrics => ({
  closedCandles,
  emaFast: null,
  emaSlow: null,
  rsi: null,
  atr: null,
})

const isPositive = (value: number): boolean => Number.isFinite(value) && value > 0

const validCandle = (candle: OHLCV): boolean =>
  Number.isFinite(candle.time) && candle.time > 0 &&
  [candle.open, candle.high, candle.low, candle.close].every((value) => Number.isFinite(value) && value > 0) &&
  candle.high >= Math.max(candle.open, candle.close) &&
  candle.low <= Math.min(candle.open, candle.close) &&
  candle.high >= candle.low

/** EMA series aligned to the input array; earlier, under-warmed values remain null. */
const emaSeries = (values: readonly number[], period: number): Array<number | null> => {
  const output: Array<number | null> = Array.from({ length: values.length }, () => null)
  if (!Number.isInteger(period) || period < 2 || values.length < period) return output

  let ema = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period
  output[period - 1] = ema
  const alpha = 2 / (period + 1)
  for (let index = period; index < values.length; index += 1) {
    ema = values[index] * alpha + ema * (1 - alpha)
    output[index] = ema
  }
  return output
}

const rsiFor = (candles: readonly OHLCV[], period = 14): number | null => {
  if (candles.length <= period) return null
  let gains = 0
  let losses = 0
  for (let index = candles.length - period; index < candles.length; index += 1) {
    const change = candles[index].close - candles[index - 1].close
    if (change > 0) gains += change
    else losses -= change
  }
  const averageGain = gains / period
  const averageLoss = losses / period
  if (averageLoss <= 0) return averageGain > 0 ? 100 : 50
  if (averageGain <= 0) return 0
  const relativeStrength = averageGain / averageLoss
  return 100 - 100 / (1 + relativeStrength)
}

const atrFor = (candles: readonly OHLCV[], period = 14): number | null => {
  if (candles.length <= period) return null
  const ranges: number[] = []
  for (let index = candles.length - period; index < candles.length; index += 1) {
    const candle = candles[index]
    const previousClose = candles[index - 1].close
    ranges.push(Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    ))
  }
  const value = ranges.reduce((sum, range) => sum + range, 0) / ranges.length
  return isPositive(value) ? value : null
}

const rounded = (price: number, precision: number): number => Number(price.toFixed(Math.min(10, Math.max(0, precision))))

const createMomentumSetup = (input: {
  symbol: string
  timeframe: Timeframe
  candles: readonly OHLCV[]
  symbolSpec: SymbolSpec
  fastEma: number
  slowEma: number
  fastEmaPrevious: number
  timeframe: Timeframe
  rsi: number
  atr: number
  score: number
  breakout: boolean
}): SetupCandidate | null => {
  const { symbol, timeframe, candles, symbolSpec, fastEma, slowEma, fastEmaPrevious, rsi, atr, score, breakout } = input
  const signalCandle = candles[candles.length - 1]
  if (!signalCandle) return null

  const buy = fastEma > slowEma
  const entryPrice = rounded(signalCandle.close, symbolSpec.pricePrecision)
  const pipSize = symbolSpec.pipSize
  const minStopDistance = pipSize * 8
  const localBars = candles.slice(-7)
  const localExtreme = buy
    ? Math.min(...localBars.map((candle) => candle.low))
    : Math.max(...localBars.map((candle) => candle.high))
  const swingDistance = buy
    ? entryPrice - localExtreme + atr * 0.15
    : localExtreme - entryPrice + atr * 0.15
  const desiredDistance = Math.max(atr * 1.25, swingDistance, minStopDistance)
  const stopDistance = Math.max(minStopDistance, Math.min(desiredDistance, atr * 2.5))
  if (!isPositive(entryPrice) || !isPositive(stopDistance)) return null

  const stopLoss = rounded(entryPrice + (buy ? -stopDistance : stopDistance), symbolSpec.pricePrecision)
  const takeProfit = rounded(entryPrice + (buy ? stopDistance * 1.8 : -stopDistance * 1.8), symbolSpec.pricePrecision)
  if (!(buy ? stopLoss < entryPrice && takeProfit > entryPrice : stopLoss > entryPrice && takeProfit < entryPrice)) return null

  const emaText = 'EMA(9) ' + (buy ? 'above' : 'below') + ' EMA(21); fast EMA moved from ' +
    fastEmaPrevious.toFixed(symbolSpec.pricePrecision) + ' to ' + fastEma.toFixed(symbolSpec.pricePrecision)
  const momentumText = 'RSI(14) ' + rsi.toFixed(1) + ' supports ' + (buy ? 'bullish' : 'bearish') + ' momentum'
  const triggerText = breakout
    ? timeframe + ' closed candle broke the previous six-candle range.'
    : timeframe + ' closed candle confirms continuation in the EMA trend.'
  return {
    direction: buy ? 'BUY' : 'SELL',
    status: 'candidate',
    quality: score >= 90 ? 'strong' : 'moderate',
    entryPrice,
    stopLoss,
    takeProfit,
    riskRewardRatio: 1.8,
    riskDistance: Math.abs(entryPrice - stopLoss),
    rewardDistance: Math.abs(takeProfit - entryPrice),
    confidence: Math.min(92, Math.max(70, Math.round(score))),
    rationale: [
      emaText + ' with the fast EMA slope pointing the same way.',
      momentumText + '.',
      triggerText,
      symbol + ' ' + timeframe + ' momentum continuation signal; stop distance adapts to ATR and recent range, with target at 1.8R.',
    ],
    invalidation: buy
      ? 'Momentum setup invalidated if price moves through its protective stop.'
      : 'Momentum setup invalidated if price moves through its protective stop.',
    liquidityTarget: null,
  }
}

const noSetup = (input: {
  candles: readonly OHLCV[]
  reason: string
  checks: TradeBotStrategyCheck[]
  metrics?: TradeBotStrategyMetrics
}): TradeBotStrategyResult => ({
  setup: null,
  source: null,
  score: null,
  signalCandleTime: input.candles[input.candles.length - 1]?.time ?? null,
  reason: input.reason,
  checks: input.checks,
  metrics: input.metrics ?? emptyMetrics(input.candles.length),
})

/**
 * Two-layer Trade Bot strategy:
 * 1. Keep the existing structure/support/liquidity setup when it finds one.
 * 2. Otherwise use a closed-candle EMA(9/21) + RSI(14) + ATR(14) momentum
 *    continuation setup. An unclear higher timeframe is informational, not an
 *    automatic veto. A confirmed multi-timeframe opposition remains a hard hold.
 */
export const evaluateTradeBotStrategy = (input: {
  symbol: string
  timeframe: Timeframe
  candles: readonly OHLCV[]
  symbolSpec: SymbolSpec
  higherTimeframeBias: MarketBias | null
  higherTimeframeDirectionalCount: number
  higherTimeframeConfidence: number
  higherTimeframeDetail: string
}): TradeBotStrategyResult => {
  const { symbol, timeframe, symbolSpec, higherTimeframeBias, higherTimeframeDirectionalCount, higherTimeframeConfidence, higherTimeframeDetail } = input
  // The final cTrader candle may still be forming. Signals use closed candles only.
  const candles = input.candles.slice().filter(validCandle).sort((a, b) => a.time - b.time).slice(0, -1)
  const historyCheck: TradeBotStrategyCheck = {
    id: 'history',
    label: 'Closed candles',
    status: candles.length >= 30 ? 'PASS' : 'BLOCK',
    detail: String(candles.length) + ' closed candles available; trend fallback needs at least 30.',
  }
  const higherCheck = (direction: 'BUY' | 'SELL' | null): TradeBotStrategyCheck => {
    const directionBias = direction === 'BUY' ? 'Bullish' : direction === 'SELL' ? 'Bearish' : null
    if (!directionBias) {
      return {
        id: 'higher-timeframe',
        label: 'Higher timeframe',
        status: 'WATCH',
        detail: higherTimeframeDetail || 'Higher-timeframe bias will be reviewed when a directional candidate appears.',
      }
    }
    const hasStrongOpposition = Boolean(
      higherTimeframeBias && higherTimeframeBias !== 'Sideways' && higherTimeframeBias !== directionBias &&
      higherTimeframeDirectionalCount >= 2 && higherTimeframeConfidence >= 65,
    )
    if (hasStrongOpposition) {
      return {
        id: 'higher-timeframe',
        label: 'Higher timeframe',
        status: 'BLOCK',
        detail: higherTimeframeDetail + ' The entry is held until the conflict clears.',
      }
    }
    if (higherTimeframeBias === directionBias) {
      return {
        id: 'higher-timeframe',
        label: 'Higher timeframe',
        status: 'PASS',
        detail: higherTimeframeDetail || 'Higher-timeframe direction agrees with the candidate.',
      }
    }
    return {
      id: 'higher-timeframe',
      label: 'Higher timeframe',
      status: 'WATCH',
      detail: 'Higher-timeframe direction is unclear, so it is not used as a veto; the selected-timeframe signal must pass its own checks.',
    }
  }

  const rawLast = candles[candles.length - 1]
  if (candles.length >= 7) {
    const swings = findSwingPoints(candles as import('../../types').OHLCV[], 2)
    const structure = analyzeMarketStructure(candles as import('../../types').OHLCV[], 2)
    const tolerance = symbol.includes('JPY') ? 0.1 : symbol.includes('XAU') ? 0.01 : 0.001
    const supportResistance = analyzeSupportResistance(candles as import('../../types').OHLCV[], tolerance, swings)
    const liquidity = analyzeLiquidity(candles as import('../../types').OHLCV[], swings, tolerance)
    const structural = analyzeSetup({
      currentPrice: rawLast?.close ?? Number.NaN,
      structure,
      supportResistance,
      liquidity,
    }).preferredSetup
    if (structural) {
      const htCheck = higherCheck(structural.direction)
      const checks: TradeBotStrategyCheck[] = [
        historyCheck,
        { id: 'structure', label: 'Structure + liquidity', status: 'PASS', detail: structural.rationale.join(' ') },
        htCheck,
      ]
      if (htCheck.status === 'BLOCK') {
        return noSetup({
          candles,
          reason: 'A structural setup exists, but a confirmed higher-timeframe conflict is holding it. ' + htCheck.detail,
          checks,
          metrics: emptyMetrics(candles.length),
        })
      }
      return {
        setup: structural,
        source: 'STRUCTURE_LIQUIDITY',
        score: structural.confidence,
        signalCandleTime: rawLast?.time ?? null,
        reason: 'Structure and liquidity setup passed.',
        checks,
        metrics: emptyMetrics(candles.length),
      }
    }
  }

  if (candles.length < 30) {
    return noSetup({
      candles,
      reason: 'Waiting for 30 closed candles before the EMA/momentum fallback can evaluate this market.',
      checks: [
        historyCheck,
        { id: 'structure', label: 'Structure + liquidity', status: 'WATCH', detail: 'No structural setup qualified on the latest closed candles.' },
        higherCheck(null),
      ],
    })
  }

  const closes = candles.map((candle) => candle.close)
  const fastValues = emaSeries(closes, 9)
  const slowValues = emaSeries(closes, 21)
  const lastIndex = candles.length - 1
  const fastEma = fastValues[lastIndex]
  const previousFastEma = fastValues[lastIndex - 1]
  const slowEma = slowValues[lastIndex]
  const rsi = rsiFor(candles, 14)
  const atr = atrFor(candles, 14)
  if (fastEma === null || previousFastEma === null || slowEma === null || rsi === null || atr === null) {
    return noSetup({
      candles,
      reason: 'The indicator window is not ready yet; no entry was evaluated.',
      checks: [
        historyCheck,
        { id: 'indicators', label: 'Trend + momentum', status: 'BLOCK', detail: 'EMA, RSI or ATR could not be calculated from the closed bars.' },
        higherCheck(null),
      ],
    })
  }

  const lastCandle = candles[lastIndex]
  const priorRange = candles.slice(-7, -1)
  const previousHigh = Math.max(...priorRange.map((candle) => candle.high))
  const previousLow = Math.min(...priorRange.map((candle) => candle.low))
  const bullishBreakout = lastCandle.close > previousHigh
  const bearishBreakout = lastCandle.close < previousLow
  const buy = fastEma > slowEma
  const sell = fastEma < slowEma
  const slopeUp = fastEma > previousFastEma
  const slopeDown = fastEma < previousFastEma
  const aboveFast = lastCandle.close > fastEma
  const belowFast = lastCandle.close < fastEma
  const bullishRsi = rsi >= 51 && rsi <= 73
  const bearishRsi = rsi >= 27 && rsi <= 49
  const bullishCandle = lastCandle.close > lastCandle.open
  const bearishCandle = lastCandle.close < lastCandle.open

  const buyScore =
    (buy ? 25 : 0) +
    (slopeUp ? 10 : 0) +
    (aboveFast && lastCandle.close > slowEma ? 20 : 0) +
    (bullishRsi ? 20 : 0) +
    (bullishCandle ? 10 : 0) +
    (bullishBreakout ? 15 : 0)
  const sellScore =
    (sell ? 25 : 0) +
    (slopeDown ? 10 : 0) +
    (belowFast && lastCandle.close < slowEma ? 20 : 0) +
    (bearishRsi ? 20 : 0) +
    (bearishCandle ? 10 : 0) +
    (bearishBreakout ? 15 : 0)

  const direction: 'BUY' | 'SELL' | null = buyScore >= sellScore && buyScore >= 75
    ? 'BUY'
    : sellScore > buyScore && sellScore >= 75
      ? 'SELL'
      : null
  const chosenScore = direction === 'BUY' ? buyScore : direction === 'SELL' ? sellScore : Math.max(buyScore, sellScore)
  const metrics: TradeBotStrategyMetrics = {
    closedCandles: candles.length,
    emaFast: fastEma,
    emaSlow: slowEma,
    rsi,
    atr,
  }
  const trendPassed = direction === 'BUY' ? buy : direction === 'SELL' ? sell : buy || sell
  const slopePassed = direction === 'BUY' ? slopeUp : direction === 'SELL' ? slopeDown : slopeUp || slopeDown
  const pricePassed = direction === 'BUY'
    ? aboveFast && lastCandle.close > slowEma
    : direction === 'SELL'
      ? belowFast && lastCandle.close < slowEma
      : (aboveFast && lastCandle.close > slowEma) || (belowFast && lastCandle.close < slowEma)
  const momentumPassed = direction === 'BUY' ? bullishRsi : direction === 'SELL' ? bearishRsi : bullishRsi || bearishRsi
  const candlePassed = direction === 'BUY'
    ? bullishCandle || bullishBreakout
    : direction === 'SELL'
      ? bearishCandle || bearishBreakout
      : bullishCandle || bearishCandle || bullishBreakout || bearishBreakout
  const checks: TradeBotStrategyCheck[] = [
    historyCheck,
    {
      id: 'trend',
      label: 'EMA trend',
      status: trendPassed && slopePassed ? 'PASS' : 'WATCH',
      detail: 'EMA(9) ' + fastEma.toFixed(symbolSpec.pricePrecision) + ' / EMA(21) ' + slowEma.toFixed(symbolSpec.pricePrecision) +
        '; fast EMA slope ' + (slopeUp ? 'up' : slopeDown ? 'down' : 'flat') + '.',
    },
    {
      id: 'momentum',
      label: 'RSI momentum',
      status: momentumPassed ? 'PASS' : 'WATCH',
      detail: 'RSI(14) is ' + rsi.toFixed(1) + '; BUY range 51–73, SELL range 27–49.',
    },
    {
      id: 'price-action',
      label: 'Closed candle',
      status: candlePassed && pricePassed ? 'PASS' : 'WATCH',
      detail: 'Price ' + (aboveFast ? 'above' : belowFast ? 'below' : 'at') + ' EMA(9); ' +
        (bullishBreakout ? 'bullish range break' : bearishBreakout ? 'bearish range break' : bullishCandle ? 'bullish close' : bearishCandle ? 'bearish close' : 'no directional close') + '.',
    },
  ]

  if (!direction || chosenScore < 75) {
    const unmet = checks.filter((check) => check.status !== 'PASS').map((check) => check.label.toLowerCase())
    return noSetup({
      candles,
      reason: unmet.length
        ? 'No entry yet: waiting for ' + unmet.join(', ') + ' to align.'
        : 'No entry yet: trend/momentum score is ' + chosenScore + '/100; a minimum 75 is required.',
      checks: [...checks, higherCheck(null)],
      metrics,
    })
  }

  const htCheck = higherCheck(direction)
  if (htCheck.status === 'BLOCK') {
    return noSetup({
      candles,
      reason: 'Momentum setup ' + direction + ' held by higher-timeframe conflict.',
      checks: [...checks, htCheck],
      metrics,
    })
  }
  const setup = createMomentumSetup({
    symbol,
    timeframe,
    candles,
    symbolSpec,
    fastEma,
    slowEma,
    fastEmaPrevious: previousFastEma,
    rsi,
    atr,
    score: chosenScore,
    timeframe,
    breakout: direction === 'BUY' ? bullishBreakout : bearishBreakout,
  })
  if (!setup) {
    return noSetup({
      candles,
      reason: 'A momentum candidate was detected, but its stop/target could not be placed on valid prices. No entry was sent.',
      checks: [...checks, { id: 'prices', label: 'Stop + target', status: 'BLOCK', detail: 'The calculated protective prices failed direction/precision validation.' }, htCheck],
      metrics,
    })
  }

  return {
    setup,
    source: 'EMA_MOMENTUM',
    score: chosenScore,
    signalCandleTime: lastCandle.time,
    reason: 'EMA/momentum continuation passed with score ' + chosenScore + '/100.',
    checks: [...checks, htCheck, { id: 'prices', label: 'Stop + target', status: 'PASS', detail: 'ATR/structure-adaptive stop and 1.8R target created from closed candles.' }],
    metrics,
  }
}
