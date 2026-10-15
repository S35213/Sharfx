import type { OHLCV, Timeframe, TradeSide } from '../../types'
import type { SetupCandidate } from '../setup/types'

export type TradeBotShadowStatus = 'PENDING' | 'TARGET' | 'STOP' | 'AMBIGUOUS'

export interface TradeBotShadowRecord {
  id: string
  scopeKey: string
  symbol: string
  timeframe: Timeframe
  direction: TradeSide
  signalCandleTime: number
  entryPrice: number
  stopLoss: number
  takeProfit: number
  riskBudget: number
  estimatedLoss: number | null
  estimatedReward: number | null
  status: TradeBotShadowStatus
  resolvedAt: number | null
  resolutionNote: string
}

const validPrice = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

/** Creates a hypothetical record only; this module never talks to a broker or submits orders. */
export const createTradeBotShadowRecord = (input: {
  scopeKey: string
  symbol: string
  timeframe: Timeframe
  signalCandleTime: number | null
  setup: SetupCandidate
  riskBudget: number
  estimatedLoss: number | null
  estimatedReward: number | null
}): TradeBotShadowRecord | null => {
  const { scopeKey, symbol, timeframe, signalCandleTime, setup, riskBudget, estimatedLoss, estimatedReward } = input
  if (!scopeKey.trim() || !symbol.trim() || !Number.isFinite(signalCandleTime) || Number(signalCandleTime) <= 0) return null
  if (!validPrice(setup.entryPrice) || !validPrice(setup.stopLoss) || !validPrice(setup.takeProfit)) return null
  if (setup.direction === 'BUY' ? !(setup.stopLoss < setup.entryPrice && setup.takeProfit > setup.entryPrice)
    : !(setup.stopLoss > setup.entryPrice && setup.takeProfit < setup.entryPrice)) return null

  // One hypothetical signal per source/market/timeframe candle; polling cannot multiply the sample count.
  const id = [scopeKey.trim(), symbol.trim().toUpperCase(), timeframe, Math.trunc(Number(signalCandleTime))].join('|')
  return {
    id,
    scopeKey: scopeKey.trim(),
    symbol: symbol.trim().toUpperCase(),
    timeframe,
    direction: setup.direction,
    signalCandleTime: Number(signalCandleTime),
    entryPrice: setup.entryPrice,
    stopLoss: setup.stopLoss,
    takeProfit: setup.takeProfit,
    riskBudget: Number.isFinite(riskBudget) && riskBudget > 0 ? riskBudget : 0,
    estimatedLoss: Number.isFinite(estimatedLoss) && Number(estimatedLoss) >= 0 ? Number(estimatedLoss) : null,
    estimatedReward: Number.isFinite(estimatedReward) && Number(estimatedReward) >= 0 ? Number(estimatedReward) : null,
    status: 'PENDING',
    resolvedAt: null,
    resolutionNote: 'Waiting for a later candle to test the hypothetical stop/target.',
  }
}

/** Adds one bounded, deduplicated shadow candidate. The first READY setup for a candle wins. */
export const appendTradeBotShadowRecord = (
  current: readonly TradeBotShadowRecord[],
  next: TradeBotShadowRecord,
  maxRecords = 24,
): TradeBotShadowRecord[] => {
  if (current.some((record) => record.id === next.id)) return current as TradeBotShadowRecord[]
  const limit = Number.isFinite(maxRecords) ? Math.max(1, Math.floor(maxRecords)) : 24
  return [next, ...current].slice(0, limit)
}

/**
 * Resolves pending shadow records from bars strictly after their signal candle.
 * If one candle touches both SL and TP, mark it AMBIGUOUS instead of assuming a favourable fill.
 */
export const advanceTradeBotShadowRecords = (
  current: readonly TradeBotShadowRecord[],
  frames: Partial<Record<Timeframe, readonly OHLCV[]>>,
): TradeBotShadowRecord[] => current.map((record) => {
  if (record.status !== 'PENDING') return record
  const frame = frames[record.timeframe] ?? []
  // The newest bar may still be forming. Only evaluate bars that have a following
  // bar timestamp, which is the conservative signal available from this OHLC feed.
  const closedBarTimes = new Set(frame.slice(1).map((bar) => bar.time))
  const laterBars = frame
    .filter((bar) => Number.isFinite(bar.time) && bar.time > record.signalCandleTime && closedBarTimes.has(bar.time))
    .slice()
    .sort((a, b) => a.time - b.time)

  for (const bar of laterBars) {
    if (![bar.open, bar.high, bar.low, bar.close].every(validPrice) || bar.high < bar.low) continue
    const stopHit = record.direction === 'BUY' ? bar.low <= record.stopLoss : bar.high >= record.stopLoss
    const targetHit = record.direction === 'BUY' ? bar.high >= record.takeProfit : bar.low <= record.takeProfit
    if (!stopHit && !targetHit) continue

    if (stopHit && targetHit) {
      return {
        ...record,
        status: 'AMBIGUOUS',
        resolvedAt: bar.time,
        resolutionNote: 'One candle touched both stop and target; intrabar order is unknown, so no win/loss is assumed.',
      }
    }
    if (stopHit) {
      return { ...record, status: 'STOP', resolvedAt: bar.time, resolutionNote: 'A later candle touched the planned stop level.' }
    }
    return { ...record, status: 'TARGET', resolvedAt: bar.time, resolutionNote: 'A later candle touched the planned target level.' }
  }
  return record
})
