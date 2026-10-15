import type { OHLCV, SymbolSpec, Timeframe } from '../../types'
import { evaluateTradeBotDecision } from './tradeBotDecision'
import {
  advanceTradeBotShadowRecords,
  createTradeBotShadowRecord,
  type TradeBotShadowRecord,
} from './tradeBotShadowEvaluation'

const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  M1: 60,
  M5: 5 * 60,
  M15: 15 * 60,
  M30: 30 * 60,
  H1: 60 * 60,
  H4: 4 * 60 * 60,
  D1: 24 * 60 * 60,
  W1: 7 * 24 * 60 * 60,
}

export interface TradeBotHistoricalReplayResult {
  timeframe: Timeframe
  candlesReviewed: number
  readyCandidates: number
  waitDecisions: number
  blockedDecisions: number
  target: number
  stop: number
  ambiguous: number
  pending: number
  resolvedSampleCount: number
  resolutionRatePercent: number | null
  conservativeTargetRatePercent: number | null
  records: TradeBotShadowRecord[]
  notes: string[]
}

/**
 * Offline replay of the exact current Trade Bot decision function over the
 * supplied historical candles. It only supplies bars already closed at each
 * historical signal time, including higher-timeframe bars, to prevent
 * look-ahead. It never accesses a broker or submits orders.
 */
export const runTradeBotHistoricalReplay = (input: {
  scopeKey: string
  symbol: string
  timeframe: Timeframe
  frames: Partial<Record<Timeframe, readonly OHLCV[]>>
  accountBalance: number
  accountCurrency: string
  symbolSpec: SymbolSpec | null
}): TradeBotHistoricalReplayResult => {
  const { scopeKey, symbol, timeframe, frames, accountBalance, accountCurrency, symbolSpec } = input
  const selectedBars = (frames[timeframe] ?? []).slice().sort((a, b) => a.time - b.time)
  const validBars = selectedBars.filter((bar) =>
    Number.isFinite(bar.time) && [bar.open, bar.high, bar.low, bar.close].every((price) =>
      Number.isFinite(price) && price > 0) && bar.high >= bar.low)
  const records: TradeBotShadowRecord[] = []
  let waitDecisions = 0
  let blockedDecisions = 0
  let readyCandidates = 0
  let candlesReviewed = 0

  // Need a following candle to know the signal candle is closed; never signal
  // from the newest potentially-forming candle.
  for (let index = 7; index < validBars.length - 1; index += 1) {
    const signalBar = validBars[index]
    const signalCloseTime = signalBar.time + TIMEFRAME_SECONDS[timeframe]
    const closedFrames: Partial<Record<Timeframe, OHLCV[]>> = {}
    for (const [frameName, bars] of Object.entries(frames) as [Timeframe, readonly OHLCV[]][]) {
      const duration = TIMEFRAME_SECONDS[frameName]
      closedFrames[frameName] = bars
        .filter((bar) => Number.isFinite(bar.time) && bar.time + duration <= signalCloseTime)
        .slice()
        .sort((a, b) => a.time - b.time)
    }

    const decision = evaluateTradeBotDecision({
      frames: closedFrames,
      symbol,
      timeframe,
      accountBalance,
      accountCurrency,
      symbolSpec,
    })
    candlesReviewed += 1
    if (decision.status === 'WAIT') {
      waitDecisions += 1
      continue
    }
    if (decision.status === 'BLOCKED') {
      blockedDecisions += 1
      continue
    }
    if (!decision.setup) {
      blockedDecisions += 1
      continue
    }

    const record = createTradeBotShadowRecord({
      scopeKey,
      symbol,
      timeframe,
      signalCandleTime: signalBar.time,
      setup: decision.setup,
      riskBudget: decision.riskBudget,
      estimatedLoss: decision.riskPlan?.valid ? decision.riskPlan.estimatedLossAtStop : null,
      estimatedReward: decision.riskPlan?.valid ? decision.riskPlan.estimatedRewardAtTarget : null,
    })
    if (!record || records.some((existing) => existing.id === record.id)) continue
    readyCandidates += 1
    // Resolve each candidate against the complete historical frame. The
    // evaluator excludes the final bar and labels same-bar SL/TP touches ambiguous.
    const resolved = advanceTradeBotShadowRecords([record], frames)[0]
    records.push(resolved)
  }

  const target = records.filter((record) => record.status === 'TARGET').length
  const stop = records.filter((record) => record.status === 'STOP').length
  const ambiguous = records.filter((record) => record.status === 'AMBIGUOUS').length
  const pending = records.filter((record) => record.status === 'PENDING').length
  const resolvedSampleCount = target + stop
  const denominator = resolvedSampleCount
  return {
    timeframe,
    candlesReviewed,
    readyCandidates,
    waitDecisions,
    blockedDecisions,
    target,
    stop,
    ambiguous,
    pending,
    resolvedSampleCount,
    resolutionRatePercent: readyCandidates ? Number(((resolvedSampleCount + ambiguous) / readyCandidates * 100).toFixed(1)) : null,
    conservativeTargetRatePercent: denominator ? Number((target / denominator * 100).toFixed(1)) : null,
    records: records.slice(-100),
    notes: [
      'Offline historical replay only; no broker orders are sent.',
      'Decision inputs include only candles closed by each signal time to avoid higher-timeframe look-ahead.',
      'Entry is idealized at the signal candle close; spread, commission, slippage, gaps and fill latency are not modeled.',
      'If a candle touches both stop and target, it is AMBIGUOUS and excluded from the target-rate denominator.',
      'PENDING means the available history did not resolve the plan; the newest potentially-forming candle is not used.',
      'Results are not a profitability guarantee and should be compared with demo forward results.',
    ],
  }
}
