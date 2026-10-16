import type { SymbolSpec, Timeframe, TradeOrder } from '../../types'
import type { SetupCandidate } from '../setup/types'
import { calculateCfdRiskPlan, type CfdRiskPlan } from '../../lib/cfdRiskEngine'
import { providerSymbolsMatch } from '../../lib/normalizeProviderSymbol'
import type { CTraderLiveInstrument, CTraderLiveQuote } from '../../data/ctrader/CTraderLiveQuote'
import { tradeBotRiskBudget, type TradeBotMarketSource } from './tradeBotDecision'

export type CTraderApiPost = (body: Record<string, unknown>) => Promise<Record<string, unknown>>

export interface TradeBotDemoExecutionInput {
  source: TradeBotMarketSource | null
  symbol: string
  timeframe: Timeframe
  signalCandleTime: number
  setup: SetupCandidate
  accountBalance: number
  accountFreeMargin: number
  accountCurrency: string
  symbolSpec: SymbolSpec | null
  nowMs?: number
  post?: CTraderApiPost
}

export interface TradeBotDemoExecutionResult {
  trade: TradeOrder
  riskPlan: CfdRiskPlan
  marginRequired: number
  protectionConfirmed: boolean
  signalKey: string
}

const isPositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

const roundToTick = (price: number, tick: number, direction: 'down' | 'up'): number => {
  if (!isPositive(price) || !isPositive(tick)) return 0
  const units = price / tick
  const roundedUnits = direction === 'down'
    ? Math.floor(units + 1e-9)
    : Math.ceil(units - 1e-9)
  const decimals = Math.min(10, Math.max(0, Math.ceil(-Math.log10(tick))))
  return Number((roundedUnits * tick).toFixed(decimals))
}

const defaultPost: CTraderApiPost = async (body) => {
  const response = await fetch('/api/providers/ctrader', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok || payload.ok !== true) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'cTrader rejected the demo bot request.')
  }
  return payload
}

const apiRequest = async (
  post: CTraderApiPost,
  source: TradeBotMarketSource,
  action: string,
  fields: Record<string, unknown> = {},
): Promise<Record<string, unknown>> => post({
  providerId: 'ctrader',
  connectionId: source.connectionId,
  accountId: source.accountId,
  environment: source.environment,
  action,
  ...fields,
})

/**
 * Submit one validated cTrader practice-market order for one READY bot setup.
 * All preflight failures are terminal for this signal; callers should not retry
 * the same candle automatically. The live-account server route remains disabled.
 */
export const executeTradeBotDemoOrder = async (
  input: TradeBotDemoExecutionInput,
): Promise<TradeBotDemoExecutionResult> => {
  const {
    source, symbol, timeframe, signalCandleTime, setup,
    accountBalance, accountFreeMargin, accountCurrency, symbolSpec,
    nowMs = Date.now(), post = defaultPost,
  } = input

  if (source?.providerId !== 'ctrader' || source.environment !== 'demo' ||
      !source.connectionId || !source.accountId) {
    throw new Error('Automatic entries require the explicitly selected cTrader practice account. Live accounts are blocked.')
  }
  if (!symbolSpec || !providerSymbolsMatch(symbol, symbolSpec.symbol)) {
    throw new Error('A matching verified broker specification is required before automatic sizing.')
  }
  if (!Number.isFinite(signalCandleTime) || signalCandleTime <= 0) {
    throw new Error('The selected timeframe has no valid signal-candle timestamp; no order was sent.')
  }
  if (setup.status !== 'candidate' || (setup.direction !== 'BUY' && setup.direction !== 'SELL')) {
    throw new Error('The current setup is not a valid directional candidate.')
  }
  if (!isPositive(accountFreeMargin)) {
    throw new Error('Current cTrader free margin is unavailable; no order was sent.')
  }

  const sourceKey = [
    symbol.trim().toUpperCase(),
    source.providerId,
    source.connectionId,
    source.accountId,
    source.environment,
    timeframe,
    Math.trunc(signalCandleTime),
    setup.direction,
  ].join('|')
  const riskBudget = tradeBotRiskBudget(accountBalance)
  if (!isPositive(riskBudget)) throw new Error('A positive account balance is required for automatic sizing.')

  // Every entry uses a fresh broker quote. A chart candle close is never used as
  // an executable market price.
  const quotePayload = await apiRequest(post, source, 'quote', { symbol })
  const quote = asObject(quotePayload.quote) as unknown as CTraderLiveQuote
  const instrument = asObject(quotePayload.instrument) as unknown as CTraderLiveInstrument
  const bid = Number(quote.bid)
  const ask = Number(quote.ask)
  const quoteAt = Date.parse(String(quote.timestamp ?? ''))
  if (!providerSymbolsMatch(symbol, String(quote.symbol ?? '')) ||
      !isPositive(bid) || !isPositive(ask) || ask < bid ||
      !isPositive(quoteAt) || quoteAt > nowMs + 5_000 || nowMs - quoteAt > 15_000) {
    throw new Error('The fresh cTrader quote is missing, stale or mismatched; no order was sent.')
  }
  if (!instrument.tradable || !instrument.providerSymbol ||
      !providerSymbolsMatch(symbol, instrument.symbol) ||
      !isPositive(instrument.quantityMin) || !isPositive(instrument.quantityMax) ||
      !isPositive(instrument.quantityStep) || !isPositive(instrument.priceIncrement) ||
      instrument.quantityMax < instrument.quantityMin) {
    throw new Error('cTrader did not return complete tradable instrument rules; no order was sent.')
  }

  // Refuse to stack another open trade on the same market. The bot can continue
  // monitoring and report the gate, but it must not pyramid into existing exposure.
  const reconcile = await apiRequest(post, source, 'reconcile')
  const positions = Array.isArray(reconcile.positions) ? reconcile.positions.map(asObject) : []
  const alreadyOpen = positions.some((position) => {
    const positionSymbol = String(position.symbol ?? '')
    const symbolId = String(asObject(position.metadata).symbolId ?? '')
    return providerSymbolsMatch(symbol, positionSymbol) ||
      (symbolId !== '' && symbolId === String(instrument.providerSymbol))
  })
  if (alreadyOpen) {
    throw new Error('An open cTrader position already exists for ' + symbol + '. The bot will not stack another entry on the same market.')
  }

  const entryPrice = setup.direction === 'BUY' ? ask : bid
  const pipSize = symbolSpec.pipSize
  const priceTick = instrument.priceIncrement
  const rawStopDistance = Math.abs(setup.entryPrice - setup.stopLoss)
  const rawTargetDistance = Math.abs(setup.takeProfit - setup.entryPrice)
  if (!isPositive(pipSize) || !isPositive(entryPrice) ||
      !isPositive(rawStopDistance) || !isPositive(rawTargetDistance)) {
    throw new Error('The strategy stop/target distances are invalid; no order was sent.')
  }

  const metadata = asObject(instrument.metadata)
  const distanceMode = Number(metadata.distanceSetIn)
  const minimumStop = Math.max(0, Number(metadata.slDistance) || 0)
  const minimumTarget = Math.max(0, Number(metadata.tpDistance) || 0)
  const minimumStopPrice = distanceMode === 1
    ? minimumStop * priceTick
    : distanceMode === 2
      ? minimumStop * entryPrice / 10_000
      : 0
  const minimumTargetPrice = distanceMode === 1
    ? minimumTarget * priceTick
    : distanceMode === 2
      ? minimumTarget * entryPrice / 10_000
      : 0
  const spreadPips = Math.max(0, ask - bid) / pipSize
  const pointPips = priceTick / pipSize
  const stopDistancePips = Math.max(rawStopDistance / pipSize, minimumStopPrice / pipSize + spreadPips + pointPips)
  const targetDistancePips = Math.max(rawTargetDistance / pipSize, minimumTargetPrice / pipSize + pointPips)
  const stopPriceRaw = setup.direction === 'BUY'
    ? entryPrice - stopDistancePips * pipSize
    : entryPrice + stopDistancePips * pipSize
  const targetPriceRaw = setup.direction === 'BUY'
    ? entryPrice + targetDistancePips * pipSize
    : entryPrice - targetDistancePips * pipSize
  // Always round protective levels outward to a broker tick.
  const stopLoss = roundToTick(stopPriceRaw, priceTick, setup.direction === 'BUY' ? 'down' : 'up')
  const takeProfit = roundToTick(targetPriceRaw, priceTick, setup.direction === 'BUY' ? 'up' : 'down')

  const riskPlan = calculateCfdRiskPlan({
    accountBalance,
    accountCurrency,
    symbol: symbolSpec,
    side: setup.direction,
    entryPrice,
    stopLossPrice: stopLoss,
    takeProfitPrice: takeProfit,
    riskAmount: riskBudget,
  })
  if (!riskPlan.valid) throw new Error(riskPlan.error || 'Fresh-quote risk sizing failed; no order was sent.')
  if (riskPlan.estimatedLossAtStop > riskBudget + 0.01) {
    throw new Error(
      'Broker minimum volume would exceed the risk ceiling (' +
      riskPlan.estimatedLossAtStop.toFixed(2) + ' > ' + riskBudget.toFixed(2) +
      ' ' + accountCurrency + '); no order was sent.',
    )
  }
  if (riskPlan.riskRewardRatio < 1.5) {
    throw new Error('The fresh-quote risk/reward is below 1.5:1 after broker-distance checks; no order was sent.')
  }
  if (riskPlan.lotSize < instrument.quantityMin - 1e-8 ||
      riskPlan.lotSize > instrument.quantityMax + 1e-8) {
    throw new Error('The calculated volume is outside current cTrader lot limits; no order was sent.')
  }

  const marginPayload = await apiRequest(post, source, 'margin', {
    symbol,
    symbolId: instrument.providerSymbol,
    lots: riskPlan.lotSize,
  })
  const margin = asObject(marginPayload.margin)
  const marginRequired = Number(setup.direction === 'BUY' ? margin.buyMargin : margin.sellMargin)
  if (!isPositive(marginRequired)) {
    throw new Error('cTrader did not return a valid broker-margin estimate; no order was sent.')
  }
  if (marginRequired > accountFreeMargin) {
    throw new Error('The required broker margin exceeds current free margin; no order was sent.')
  }

  const clientOrderId = [
    'shafxbot',
    symbol.toUpperCase().replace(/[^A-Z0-9]/g, ''),
    timeframe.toLowerCase(),
    Math.trunc(signalCandleTime),
    setup.direction.toLowerCase(),
  ].join('-').slice(0, 50)

  const placedPayload = await apiRequest(post, source, 'placeOrder', {
    symbolId: instrument.providerSymbol,
    order: {
      symbol,
      side: setup.direction,
      quantity: riskPlan.lotSize,
      quantityUnit: 'lots',
      type: 'MARKET',
      entryPrice,
      stopLoss,
      takeProfit,
      clientOrderId,
    },
  })
  const order = asObject(placedPayload.order)
  const rawOrder = asObject(order.raw)
  const rawPosition = asObject(rawOrder.position)
  const positionId = String(order.positionId ?? rawPosition.positionId ?? '')
  const providerOrderId = String(order.providerOrderId ?? rawOrder.orderId ?? clientOrderId)
  const priceCandidates = [
    order.executionPrice,
    rawOrder.executedPrice,
    rawOrder.executionPrice,
    rawOrder.price,
    rawPosition.price,
    entryPrice,
  ]
  const executionPrice = priceCandidates.map(Number).find(isPositive) ?? entryPrice
  const digits = Math.max(0, Math.min(10, symbolSpec.pricePrecision))
  const stopDistanceAtPlan = Math.abs(entryPrice - stopLoss)
  const targetDistanceAtPlan = Math.abs(takeProfit - entryPrice)
  const plannedStopAtFill = setup.direction === 'BUY'
    ? executionPrice - stopDistanceAtPlan
    : executionPrice + stopDistanceAtPlan
  const plannedTargetAtFill = setup.direction === 'BUY'
    ? executionPrice + targetDistanceAtPlan
    : executionPrice - targetDistanceAtPlan
  const brokerStop = Number(rawPosition.stopLoss)
  const brokerTarget = Number(rawPosition.takeProfit)
  const effectiveStopLoss = isPositive(brokerStop) ? brokerStop : Number(plannedStopAtFill.toFixed(digits))
  const effectiveTakeProfit = isPositive(brokerTarget) ? brokerTarget : Number(plannedTargetAtFill.toFixed(digits))
  const protectionConfirmed = order.protectionApplied === true && Boolean(positionId)
  const protectionError = String(order.protectionError ?? '')
  const trade: TradeOrder = {
    id: positionId || providerOrderId,
    symbol,
    chartTimeframe: timeframe,
    type: setup.direction,
    lotSize: riskPlan.lotSize,
    volumeLots: riskPlan.lotSize,
    entryPrice: executionPrice,
    currentPrice: executionPrice,
    pnlReferencePrice: executionPrice,
    pnlReferenceProfit: 0,
    pnlPipSize: symbolSpec.pipSize,
    stopLoss: effectiveStopLoss,
    takeProfit: effectiveTakeProfit,
    plannedStopLossPrice: effectiveStopLoss,
    plannedTakeProfitPrice: effectiveTakeProfit,
    riskPercent: accountBalance > 0 ? riskPlan.estimatedLossAtStop / accountBalance * 100 : 0,
    riskAmount: riskPlan.estimatedLossAtStop,
    rewardAmount: riskPlan.estimatedRewardAtTarget,
    riskRewardRatio: riskPlan.riskRewardRatio,
    status: 'open',
    openTime: new Date(nowMs).toISOString(),
    profit: 0,
    providerOrderId,
    brokerProduct: 'SHAFX_CFD_CTRADER',
    providerId: 'ctrader',
    providerConnectionId: source.connectionId,
    providerAccountId: source.accountId,
    pipValuePerLot: riskPlan.pipValuePerLot,
    notionalValue: riskPlan.notionalValue,
    usedMargin: marginRequired,
    stopLossPips: riskPlan.stopDistancePips,
    takeProfitPips: riskPlan.targetDistancePips,
    brokerProtectionConfirmed: protectionConfirmed,
    brokerProtectionError: protectionConfirmed
      ? undefined
      : protectionError || 'cTrader did not confirm both broker-side stop loss and take profit or a usable position ID.',
  }
  return { trade, riskPlan, marginRequired, protectionConfirmed, signalKey: sourceKey }
}
