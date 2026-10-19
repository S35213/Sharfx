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

export interface TradeBotReplayPerformance {
  candidateCount: number
  target: number
  stop: number
  ambiguous: number
  pending: number
  resolvedSampleCount: number
  targetHitRatePercent: number | null
  netWinRatePercent: number | null
  netProfitFactor: number | null
  netExpectancyR: number | null
  netTotalR: number | null
  maxDrawdownR: number | null
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
  assumedRoundTripCostPips: number
  netProfitFactor: number | null
  netExpectancyR: number | null
  netTotalR: number | null
  maxDrawdownR: number | null
  outOfSampleStartTime: number | null
  outOfSample: TradeBotReplayPerformance
  records: TradeBotShadowRecord[]
  notes: string[]
}

export const calculateTradeBotReplayPerformance = (
  records: readonly TradeBotShadowRecord[],
  costRById: ReadonlyMap<string, number>,
): TradeBotReplayPerformance => {
  const targetRecords = records.filter((record) => record.status === 'TARGET')
  const stopRecords = records.filter((record) => record.status === 'STOP')
  const ambiguous = records.filter((record) => record.status === 'AMBIGUOUS').length
  const pending = records.filter((record) => record.status === 'PENDING').length
  const resolved = records
    .filter((record) => record.status === 'TARGET' || record.status === 'STOP')
    .slice()
    .sort((a, b) => a.signalCandleTime - b.signalCandleTime)
  const outcomesR = resolved.map((record) => {
    const risk = Number(record.estimatedLoss)
    const costR = costRById.get(record.id) ?? 0
    if (record.status === 'STOP') return -1 - costR
    const reward = Number(record.estimatedReward)
    return Number.isFinite(risk) && risk > 0 && Number.isFinite(reward) && reward > 0
      ? reward / risk - costR
      : -costR
  })
  const netTotal = outcomesR.reduce((total, result) => total + result, 0)
  const grossProfit = outcomesR.reduce((total, result) => total + Math.max(0, result), 0)
  const grossLoss = outcomesR.reduce((total, result) => total + Math.max(0, -result), 0)
  let equityR = 0
  let peakR = 0
  let maxDrawdownR = 0
  for (const result of outcomesR) {
    equityR += result
    peakR = Math.max(peakR, equityR)
    maxDrawdownR = Math.max(maxDrawdownR, peakR - equityR)
  }
  const resolvedSampleCount = resolved.length
  return {
    candidateCount: records.length,
    target: targetRecords.length,
    stop: stopRecords.length,
    ambiguous,
    pending,
    resolvedSampleCount,
    targetHitRatePercent: resolvedSampleCount
      ? Number((targetRecords.length / resolvedSampleCount * 100).toFixed(1))
      : null,
    netWinRatePercent: resolvedSampleCount
      ? Number((outcomesR.filter((result) => result > 0).length / resolvedSampleCount * 100).toFixed(1))
      : null,
    netProfitFactor: grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(3)) : null,
    netExpectancyR: resolvedSampleCount ? Number((netTotal / resolvedSampleCount).toFixed(3)) : null,
    netTotalR: resolvedSampleCount ? Number(netTotal.toFixed(3)) : null,
    maxDrawdownR: resolvedSampleCount ? Number(maxDrawdownR.toFixed(3)) : null,
  }
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
  /** Combined round-trip spread/commission/slippage estimate expressed as pips for this instrument. */
  estimatedRoundTripCostPips?: number
}): TradeBotHistoricalReplayResult => {
  const {
    scopeKey, symbol, timeframe, frames, accountBalance, accountCurrency, symbolSpec,
  } = input
  const assumedRoundTripCostPips = Number.isFinite(input.estimatedRoundTripCostPips)
    ? Math.min(100, Math.max(0, Number(input.estimatedRoundTripCostPips)))
    : 1.5
  const selectedBars = (frames[timeframe] ?? []).slice().sort((a, b) => a.time - b.time)
  const validBars = selectedBars.filter((bar) =>
    Number.isFinite(bar.time) && [bar.open, bar.high, bar.low, bar.close].every((price) =>
      Number.isFinite(price) && price > 0) && bar.high >= bar.low)
  const records: TradeBotShadowRecord[] = []
  const costRById = new Map<string, number>()
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
    const plan = decision.riskPlan
    if (plan?.valid && plan.estimatedLossAtStop > 0 && plan.lotSize > 0 &&
        plan.pipValuePerLot > 0 && Number.isFinite(assumedRoundTripCostPips)) {
      const estimatedRoundTripCost = assumedRoundTripCostPips * plan.pipValuePerLot * plan.lotSize
      costRById.set(record.id, estimatedRoundTripCost / plan.estimatedLossAtStop)
    } else {
      costRById.set(record.id, 0)
    }
    // Resolve each candidate against future candles. A same-candle SL/TP touch
    // is kept ambiguous instead of assuming a favourable intrabar sequence.
    const resolved = advanceTradeBotShadowRecords([record], frames)[0]
    records.push(resolved)
  }

  const target = records.filter((record) => record.status === 'TARGET').length
  const stop = records.filter((record) => record.status === 'STOP').length
  const ambiguous = records.filter((record) => record.status === 'AMBIGUOUS').length
  const pending = records.filter((record) => record.status === 'PENDING').length
  const resolvedSampleCount = target + stop
  const performance = calculateTradeBotReplayPerformance(records, costRById)
  // Use a chronological final 30% as a holdout reporting slice. Earlier bars
  // may inform a decision, but holdout signals are never evaluated on later data
  // until their outcomes resolve through subsequent candles.
  const outOfSampleIndex = validBars.length >= 20 ? Math.max(8, Math.floor(validBars.length * 0.7)) : -1
  const outOfSampleStartTime = outOfSampleIndex >= 0 && outOfSampleIndex < validBars.length - 1
    ? validBars[outOfSampleIndex]?.time ?? null
    : null
  const outOfSampleRecords = outOfSampleStartTime === null
    ? []
    : records.filter((record) => record.signalCandleTime >= outOfSampleStartTime)
  const outOfSample = calculateTradeBotReplayPerformance(outOfSampleRecords, costRById)

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
    conservativeTargetRatePercent: performance.targetHitRatePercent,
    assumedRoundTripCostPips,
    netProfitFactor: performance.netProfitFactor,
    netExpectancyR: performance.netExpectancyR,
    netTotalR: performance.netTotalR,
    maxDrawdownR: performance.maxDrawdownR,
    outOfSampleStartTime,
    outOfSample,
    records: records.slice(-100),
    notes: [
      'Offline historical replay only; no broker orders are sent.',
      'Decision inputs include only candles closed by each signal time to avoid higher-timeframe look-ahead.',
      'A configurable assumed round-trip cost is converted to account-currency cost using the broker risk plan, then deducted in R units. It is a pip-equivalent estimate, not recorded historical spread or commission.',
      'The default cost estimate is 1.5 pip-equivalent per round trip; tune it for the selected instrument and broker conditions. Zero disables the modelled cost.',
      'The final 30% of a minimum 20-candle history is reported separately as a chronological holdout. Earlier candles are retained only as causal decision context.',
      'Entry is idealized at the signal candle close; gaps, exact bid/ask at entry, variable spread, commission schedules and fill latency are not available in OHLC candles.',
      'If a candle touches both stop and target, it is AMBIGUOUS and excluded from hit-rate and expectancy calculations.',
      'PENDING means the available history did not resolve the plan; the newest potentially-forming candle is not used.',
      'Results are not a profitability guarantee and should be compared with cTrader demo forward results.',
    ],
  }
}
