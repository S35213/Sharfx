import type { Timeframe } from '../../types'
import type { TradeBotDiagnosticSnapshot } from './tradeBotDiagnostics'

type TraceDiagnosticFields = Pick<
  TradeBotDiagnosticSnapshot,
  | 'decisionStatus'
  | 'decisionReason'
  | 'higherTimeframeBias'
  | 'candleCount'
  | 'lastCandleAt'
  | 'marketAgeSeconds'
  | 'riskBudget'
  | 'lots'
  | 'estimatedLoss'
  | 'riskRewardRatio'
  | 'brokerSpec'
>

export interface TradeBotDecisionTraceEntry {
  id: string
  scopeKey: string
  symbol: string
  timeframe: Timeframe
  observedAt: number
  candleTime: number | null
  candleAt: string | null
  status: TradeBotDiagnosticSnapshot['decisionStatus']
  reason: string
  higherTimeframeBias: TradeBotDiagnosticSnapshot['higherTimeframeBias']
  candleCount: number
  marketAgeSeconds: number | null
  riskBudget: number
  lots: number | null
  estimatedLoss: number | null
  riskRewardRatio: number | null
  brokerSpecIdentity: string
}

export const createTradeBotDecisionTraceEntry = (input: {
  scopeKey: string
  symbol: string
  timeframe: Timeframe
  marketUpdatedAt: number | null
  candleTime: number | null
  diagnostics: TraceDiagnosticFields
}): TradeBotDecisionTraceEntry | null => {
  const { scopeKey, symbol, timeframe, marketUpdatedAt, candleTime, diagnostics } = input
  if (!Number.isFinite(marketUpdatedAt) || Number(marketUpdatedAt) <= 0) return null
  const cleanScope = String(scopeKey ?? '').trim()
  const cleanSymbol = String(symbol ?? '').trim().toUpperCase()
  if (!cleanScope || !cleanSymbol) return null

  const observedAt = Number(marketUpdatedAt)
  const usableCandleTime = Number.isFinite(candleTime) && Number(candleTime) > 0 ? Number(candleTime) : null
  const id = [
    cleanScope,
    cleanSymbol,
    timeframe,
    Math.trunc(observedAt),
    usableCandleTime ?? 'no-candle',
  ].join('|')
  const spec = diagnostics.brokerSpec
  const brokerSpecIdentity = spec.available && spec.matchesSymbol
    ? [
        spec.contractSize,
        spec.pipSize,
        spec.pricePrecision,
        spec.minLotSize,
        spec.maxLotSize,
        spec.lotStep,
      ].join('/')
    : 'missing-or-mismatched'

  return {
    id,
    scopeKey: cleanScope,
    symbol: cleanSymbol,
    timeframe,
    observedAt,
    candleTime: usableCandleTime,
    candleAt: diagnostics.lastCandleAt,
    status: diagnostics.decisionStatus,
    reason: diagnostics.decisionReason,
    higherTimeframeBias: diagnostics.higherTimeframeBias,
    candleCount: diagnostics.candleCount,
    marketAgeSeconds: diagnostics.marketAgeSeconds,
    riskBudget: diagnostics.riskBudget,
    lots: diagnostics.lots,
    estimatedLoss: diagnostics.estimatedLoss,
    riskRewardRatio: diagnostics.riskRewardRatio,
    brokerSpecIdentity,
  }
}

/** Prepends a newly observed cycle, drops repeated poll effects, and bounds memory use. */
export const appendTradeBotDecisionTrace = (
  current: readonly TradeBotDecisionTraceEntry[],
  next: TradeBotDecisionTraceEntry,
  maxEntries = 12,
): TradeBotDecisionTraceEntry[] => {
  if (current.some((entry) => entry.id === next.id)) return current as TradeBotDecisionTraceEntry[]
  const limit = Number.isFinite(maxEntries) ? Math.max(1, Math.floor(maxEntries)) : 12
  return [next, ...current].slice(0, limit)
}
