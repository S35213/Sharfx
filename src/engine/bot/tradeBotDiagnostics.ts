import { providerSymbolsMatch } from '../../lib/normalizeProviderSymbol'
import { TIMEFRAMES, type OHLCV, type SymbolSpec, type Timeframe } from '../../types'
import type { TradeBotDecision } from './tradeBotDecision'
import type { TradeBotMarketSource, TradeBotMarketStatus } from './useTradeBotMarketData'

const MINIMUM_CANDLES = 8
const STALE_AFTER_MS = 45_000

export interface TradeBotDiagnosticGate {
  id: string
  label: string
  passed: boolean
  detail: string
}

export interface TradeBotDiagnosticInput {
  source: TradeBotMarketSource | null
  symbol: string
  timeframe: Timeframe
  frames: Partial<Record<Timeframe, OHLCV[]>>
  marketStatus: TradeBotMarketStatus
  /** Local completion time of the last candle-history request. */
  marketUpdatedAt: number | null
  /** Provider timestamp attached to the actual cTrader quote, not the poll time. */
  marketQuoteTimestamp: number | null
  marketQuoteError?: string | null
  accountBalance: number
  accountCurrency: string
  symbolSpec: SymbolSpec | null
  decision: TradeBotDecision
  nowMs?: number
}

export interface TradeBotDiagnosticSnapshot {
  summary: 'READY_FOR_REVIEW' | 'WAITING' | 'BLOCKED'
  sourceLabel: string
  sourceAllowed: boolean
  candleCount: number
  enoughCandles: boolean
  lastCandleAt: string | null
  lastCandleClose: number | null
  loadedTimeframes: string[]
  marketStatus: TradeBotMarketStatus
  /** Age of cTrader's own quote timestamp. */
  marketAgeSeconds: number | null
  /** Age of the last successful history-request cycle, shown separately from quote age. */
  marketRefreshAgeSeconds: number | null
  marketFresh: boolean
  brokerSpec: {
    available: boolean
    matchesSymbol: boolean
    contractSize: number | null
    pipSize: number | null
    pricePrecision: number | null
    minLotSize: number | null
    maxLotSize: number | null
    lotStep: number | null
  }
  balanceValid: boolean
  decisionStatus: TradeBotDecision['status']
  decisionReason: string
  higherTimeframeBias: TradeBotDecision['higherTimeframeBias']
  riskBudget: number
  riskPlanValid: boolean
  lots: number | null
  estimatedLoss: number | null
  estimatedReward: number | null
  riskRewardRatio: number | null
  riskWithinBudget: boolean
  rewardRatioPassed: boolean
  gates: TradeBotDiagnosticGate[]
}

const isPositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

const shortId = (value: string | null | undefined): string => {
  const cleaned = String(value ?? '').trim()
  if (!cleaned) return 'missing'
  return cleaned.length <= 8 ? cleaned : '…' + cleaned.slice(-6)
}

const candleTimestamp = (value: number | undefined): string | null => {
  if (!Number.isFinite(value) || Number(value) <= 0) return null
  const time = Number(value)
  const date = new Date(time > 1_000_000_000_000 ? time : time * 1000)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

/** Read-only explanation of Trade Bot gates. It never submits or modifies orders. */
export const buildTradeBotDiagnosticSnapshot = (
  input: TradeBotDiagnosticInput,
): TradeBotDiagnosticSnapshot => {
  const {
    source, symbol, timeframe, frames, marketStatus, marketUpdatedAt,
    marketQuoteTimestamp, marketQuoteError, accountBalance, accountCurrency, symbolSpec, decision, nowMs = Date.now(),
  } = input
  const candles = frames[timeframe] ?? []
  const lastCandle = candles[candles.length - 1]
  const candleCount = candles.length
  const enoughCandles = candleCount >= MINIMUM_CANDLES
  const refreshAgeMs = marketUpdatedAt == null ? null : nowMs - marketUpdatedAt
  const quoteAgeMs = marketQuoteTimestamp == null ? null : nowMs - marketQuoteTimestamp
  const marketFresh = quoteAgeMs !== null && quoteAgeMs >= -5_000 && quoteAgeMs <= STALE_AFTER_MS
  const sourceAllowed = source?.providerId === 'ctrader' &&
    source.environment === 'demo' &&
    Boolean(source.connectionId?.trim() && source.accountId?.trim())
  const matchesSymbol = Boolean(symbolSpec && providerSymbolsMatch(symbol, symbolSpec.symbol))
  const specComplete = Boolean(
    symbolSpec && matchesSymbol &&
    isPositive(symbolSpec.contractSize) &&
    isPositive(symbolSpec.pipSize) &&
    isPositive(symbolSpec.minLotSize) &&
    isPositive(symbolSpec.maxLotSize) &&
    isPositive(symbolSpec.lotStep) &&
    Number.isFinite(symbolSpec.pricePrecision) &&
    symbolSpec.pricePrecision >= 0 &&
    symbolSpec.maxLotSize >= symbolSpec.minLotSize,
  )
  const balanceValid = isPositive(accountBalance) && Boolean(String(accountCurrency ?? '').trim())
  const plan = decision.riskPlan
  const riskPlanValid = Boolean(plan?.valid)
  const riskWithinBudget = Boolean(plan?.valid &&
    Number.isFinite(plan.estimatedLossAtStop) &&
    plan.estimatedLossAtStop <= decision.riskBudget + 0.01)
  const rewardRatioPassed = Boolean(plan?.valid && plan.riskRewardRatio >= 1.5)
  const loadedTimeframes = TIMEFRAMES.filter((frame) => (frames[frame]?.length ?? 0) >= MINIMUM_CANDLES)

  const gates: TradeBotDiagnosticGate[] = [
    {
      id: 'source',
      label: 'Selected source',
      passed: sourceAllowed,
      detail: sourceAllowed
        ? 'cTrader practice account selected; no live-provider fallback is used.'
        : source?.providerId !== 'ctrader'
          ? 'Trade Bot accepts cTrader practice data only.'
          : source.environment !== 'demo'
            ? 'Live cTrader accounts are blocked.'
            : 'A cTrader connection and account must both be selected.',
    },
    {
      id: 'candles',
      label: 'Selected-timeframe history',
      passed: enoughCandles,
      detail: String(candleCount) + ' ' + timeframe + ' candles loaded; at least ' + MINIMUM_CANDLES + ' are required.',
    },
    {
      id: 'freshness',
      label: 'Market refresh',
      passed: marketFresh,
      detail: marketQuoteTimestamp == null
        ? (marketQuoteError || 'No cTrader broker quote timestamp is available. A successful candle-history request is not proof of a live market.')
        : marketFresh
          ? 'cTrader broker quote timestamp is ' + String(Math.max(0, Math.round(Number(quoteAgeMs) / 1000))) + ' seconds old.'
          : 'cTrader broker quote timestamp is ' + String(Math.round(Number(quoteAgeMs) / 1000)) + ' seconds old or invalid. Repeated history polling does not make a stale quote live.',
    },
    {
      id: 'instrument',
      label: 'Broker instrument contract',
      passed: specComplete,
      detail: specComplete
        ? String(symbolSpec?.symbol) + ': contract ' + String(symbolSpec?.contractSize) + ', pip ' + String(symbolSpec?.pipSize) + ', lot ' + String(symbolSpec?.minLotSize) + '–' + String(symbolSpec?.maxLotSize) + ' step ' + String(symbolSpec?.lotStep) + '.'
        : 'Matching, complete cTrader contract metadata is missing; mock/default specs are not accepted.',
    },
    {
      id: 'balance',
      label: 'Account balance and currency',
      passed: balanceValid,
      detail: balanceValid
        ? String(accountCurrency) + ' ' + accountBalance.toFixed(2) + ' supplied to the risk engine.'
        : 'A positive account balance and currency are required.',
    },
    {
      id: 'decision',
      label: 'Structure and higher-timeframe decision',
      passed: decision.status === 'READY' && Boolean(decision.setup),
      detail: String(decision.status) + ': ' + decision.reason,
    },
    {
      id: 'risk',
      label: 'Stop-loss risk budget',
      passed: riskWithinBudget,
      detail: plan
        ? 'Budget ' + decision.riskBudget.toFixed(2) + '; planned stop loss ' + plan.estimatedLossAtStop.toFixed(2) + '.'
        : 'No valid risk plan has been produced.',
    },
    {
      id: 'reward',
      label: 'Minimum risk/reward',
      passed: rewardRatioPassed,
      detail: plan?.valid
        ? plan.riskRewardRatio.toFixed(2) + ':1; minimum is 1.5:1.'
        : 'Risk/reward cannot pass until the risk plan is valid.',
    },
  ]

  const hardBlock = !sourceAllowed || !specComplete || !balanceValid || decision.status === 'BLOCKED'
  const reviewReady = !hardBlock && enoughCandles && marketFresh &&
    decision.status === 'READY' && Boolean(decision.setup) && riskWithinBudget && rewardRatioPassed

  return {
    summary: reviewReady ? 'READY_FOR_REVIEW' : hardBlock ? 'BLOCKED' : 'WAITING',
    sourceLabel: String(source?.providerId ?? 'none') + ' / ' + String(source?.environment ?? 'unknown') +
      ' / connection ' + shortId(source?.connectionId) + ' / account ' + shortId(source?.accountId),
    sourceAllowed,
    candleCount,
    enoughCandles,
    lastCandleAt: candleTimestamp(lastCandle?.time),
    lastCandleClose: isPositive(lastCandle?.close) ? lastCandle.close : null,
    loadedTimeframes,
    marketStatus,
    marketAgeSeconds: quoteAgeMs === null ? null : Math.round(quoteAgeMs / 1000),
    marketRefreshAgeSeconds: refreshAgeMs === null ? null : Math.round(refreshAgeMs / 1000),
    marketFresh,
    brokerSpec: {
      available: Boolean(symbolSpec),
      matchesSymbol,
      contractSize: isPositive(symbolSpec?.contractSize) ? symbolSpec.contractSize : null,
      pipSize: isPositive(symbolSpec?.pipSize) ? symbolSpec.pipSize : null,
      pricePrecision: Number.isFinite(symbolSpec?.pricePrecision) ? symbolSpec?.pricePrecision ?? null : null,
      minLotSize: isPositive(symbolSpec?.minLotSize) ? symbolSpec.minLotSize : null,
      maxLotSize: isPositive(symbolSpec?.maxLotSize) ? symbolSpec.maxLotSize : null,
      lotStep: isPositive(symbolSpec?.lotStep) ? symbolSpec.lotStep : null,
    },
    balanceValid,
    decisionStatus: decision.status,
    decisionReason: decision.reason,
    higherTimeframeBias: decision.higherTimeframeBias,
    riskBudget: decision.riskBudget,
    riskPlanValid,
    lots: plan?.valid ? plan.lotSize : null,
    estimatedLoss: plan?.valid ? plan.estimatedLossAtStop : null,
    estimatedReward: plan?.valid ? plan.estimatedRewardAtTarget : null,
    riskRewardRatio: plan?.valid ? plan.riskRewardRatio : null,
    riskWithinBudget,
    rewardRatioPassed,
    gates,
  }
}
