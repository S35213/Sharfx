import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, CheckCircle2, Clock3, LoaderCircle, ShieldCheck, XCircle } from 'lucide-react'
import type { SymbolSpec, Timeframe, TradeOrder, TradeSide } from '../../types'
import type { SetupCandidate } from '../../engine/setup/types'
import type { ActiveProviderSelection } from '../../data/provider/providerConnections'
import { calculateCfdRiskPlan } from '../../lib/cfdRiskEngine'
import { scaleAutoRiskDistance } from '../../lib/autoRiskDistances'
import { formatCurrency, formatPrice } from '../../lib/format'
import type { DerivOrderConnection } from '../../data/deriv/derivTrading'
import type { ChartAnnotation } from '../chart/CandlestickChart'
import { subscribeCTraderLiveQuote } from '../../data/ctrader/CTraderLiveQuote'
import { getQuoteTickDirection, type QuoteTickDirection } from './quoteTickDirection'

interface Props {
  symbol: string
  currentPrice: number
  bidPrice: number
  askPrice: number
  accountBalance: number
  accountFreeMargin?: number
  accountCurrency: string
  symbolSpec: SymbolSpec
  timeframe: Timeframe
  connection: DerivOrderConnection | null
  providerSelection: ActiveProviderSelection | null
  activePosition?: TradeOrder | null
  onTradeOpened: (order: TradeOrder) => void
  onTradeClosed?: (id: string) => void | Promise<void>
  onTradeLinesChange?: (lines: ChartAnnotation[]) => void
  aiSetup?: SetupCandidate | null
}

type TicketState = 'ready' | 'placing' | 'error'

interface ProviderQuote {
  symbol: string
  bid?: number
  ask?: number
  last?: number
  /** Missing provider timestamps must remain missing; they are not evidence of freshness. */
  timestamp: string | null
}

interface ProviderInstrument {
  symbol: string
  providerSymbol: string
  contractSize?: number
  pipSize?: number
  quantityMin?: number
  quantityMax?: number
  quantityStep?: number
  priceIncrement?: number
  tradable: boolean
  metadata?: Record<string, unknown>
}

interface MarginResult {
  buyMargin: number | null
  sellMargin: number | null
}

const sharedCTraderMarginCache = new Map<string, { margin: MarginResult; expiresAt: number }>()
const sharedCTraderMarginInflight = new Map<string, Promise<MarginResult>>()
const SHARED_CTRADER_MARGIN_CACHE_MS = 10000
const QUOTE_TICK_COLOR_HOLD_MS = 650

const postCTrader = async (body: Record<string, unknown>): Promise<Record<string, unknown>> => {
  const response = await fetch('/api/providers/ctrader', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      providerId: 'ctrader',
      connectionId: body.connectionId,
      accountId: body.accountId,
      environment: body.environment,
      action: body.action,
      ...(body.order ? { order: body.order } : {}),
      ...(body.positionId ? { positionId: body.positionId } : {}),
      ...(body.symbol ? { symbol: body.symbol } : {}),
      ...(body.symbolId !== undefined ? { symbolId: body.symbolId } : {}),
      ...(body.lots !== undefined ? { lots: body.lots } : {}),
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload?.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'SHAFX cTrader request failed.')
  return payload as Record<string, unknown>
}

const getTradeAge = (openTime?: string, now = Date.now()): string => {
  if (!openTime) return '—'
  const opened = Date.parse(openTime)
  if (!Number.isFinite(opened)) return '—'
  const total = Math.max(0, Math.floor((now - opened) / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

const lineFor = (id: string, price: number | null | undefined, label: string, color: string, width: 1 | 2 = 1): ChartAnnotation | null =>
  Number.isFinite(price) && Number(price) > 0 ? { id, price: Number(price), label, color, lineWidth: width } : null

const providerSymbolSpec = (base: SymbolSpec, instrument: ProviderInstrument | null): SymbolSpec => {
  const priceIncrement = Number(instrument?.priceIncrement)
  return {
    ...base,
    // Keep SHAFX's standard-lot contract size for risk math.
    // cTrader's lotSize field is a broker volume-conversion unit, not the
    // same semantic contract-size value used by the SHAFX risk engine.
    contractSize: base.contractSize,
    pipSize: Number(instrument?.pipSize) > 0 ? Number(instrument?.pipSize) : base.pipSize,
    minLotSize: Number(instrument?.quantityMin) > 0 ? Number(instrument?.quantityMin) : base.minLotSize,
    maxLotSize: Number(instrument?.quantityMax) > 0 ? Number(instrument?.quantityMax) : base.maxLotSize,
    lotStep: Number(instrument?.quantityStep) > 0 ? Number(instrument?.quantityStep) : base.lotStep,
    pricePrecision: priceIncrement > 0
      ? Math.max(0, Math.ceil(-Math.log10(priceIncrement)))
      : base.pricePrecision,
  }
}

export const CTraderManualTicket: React.FC<Props> = ({
  symbol,
  currentPrice,
  bidPrice,
  askPrice,
  accountBalance,
  accountFreeMargin = accountBalance,
  accountCurrency,
  symbolSpec,
  timeframe,
  connection,
  providerSelection,
  activePosition = null,
  onTradeOpened,
  onTradeClosed,
  onTradeLinesChange,
  aiSetup,
}) => {
  const [side, setSide] = useState<TradeSide>(aiSetup?.direction ?? 'BUY')
  const [riskSizing, setRiskSizing] = useState(true)
  const [stopDistanceMode, setStopDistanceMode] = useState<'auto' | 'manual'>(aiSetup ? 'auto' : 'manual')
  const [targetDistanceMode, setTargetDistanceMode] = useState<'auto' | 'manual'>(aiSetup ? 'auto' : 'manual')
  const [riskAmount, setRiskAmount] = useState('')
  const [lotsInput, setLotsInput] = useState('')
  const [stopPipsInput, setStopPipsInput] = useState('')
  const [targetPipsInput, setTargetPipsInput] = useState('')
  const [quote, setQuote] = useState<ProviderQuote | null>(null)
  const [instrument, setInstrument] = useState<ProviderInstrument | null>(null)
  const [margin, setMargin] = useState<MarginResult | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [state, setState] = useState<TicketState>('ready')
  const [error, setError] = useState('')
  const [protectionWarning, setProtectionWarning] = useState('')
  const [now, setNow] = useState(0)
  const previousMidPriceRef = useRef<number | null>(null)
  const marketDirectionResetTimerRef = useRef<number | null>(null)
  const [quoteReceivedAtMs, setQuoteReceivedAtMs] = useState(0)
  const [marketDirection, setMarketDirection] = useState<QuoteTickDirection>('neutral')

  const entryPrice = side === 'BUY'
    ? Number(quote?.ask ?? askPrice ?? currentPrice)
    : Number(quote?.bid ?? bidPrice ?? currentPrice)

  const effectiveSymbol = useMemo(() => providerSymbolSpec(symbolSpec, instrument), [instrument, symbolSpec])
  // The quote callback and UI clock share the same state-backed timestamp, so
  // freshness checks remain pure during render and update on every quote/timer tick.
  const quoteAgeMs = now - quoteReceivedAtMs
  const quoteFresh = quoteReceivedAtMs > 0 && quoteAgeMs >= 0 && quoteAgeMs <= 15_000

  const setupStopPips = aiSetup && Number.isFinite(aiSetup.entryPrice) && Number.isFinite(aiSetup.stopLoss) && aiSetup.entryPrice > 0 && aiSetup.stopLoss > 0
    ? Math.abs(aiSetup.entryPrice - aiSetup.stopLoss) / Math.max(effectiveSymbol.pipSize, Number.EPSILON)
    : Number.NaN
  const setupTargetPips = aiSetup && Number.isFinite(aiSetup.entryPrice) && Number.isFinite(aiSetup.takeProfit) && aiSetup.entryPrice > 0 && aiSetup.takeProfit > 0
    ? Math.abs(aiSetup.takeProfit - aiSetup.entryPrice) / Math.max(effectiveSymbol.pipSize, Number.EPSILON)
    : Number.NaN
  const usesSetupStopDistance = Number.isFinite(setupStopPips) && setupStopPips > 0
  const usesSetupTargetDistance = Number.isFinite(setupTargetPips) && setupTargetPips > 0
  const requestedRisk = riskAmount.trim() ? Number(riskAmount) : 0
  const brokerMetadata = instrument?.metadata ?? {}
  const brokerDistanceUnit = Number(brokerMetadata.distanceSetIn)
  const brokerPricePoint = Number(instrument?.priceIncrement) > 0
    ? Number(instrument?.priceIncrement)
    : 10 ** -effectiveSymbol.pricePrecision
  const brokerPointPips = brokerPricePoint / Math.max(effectiveSymbol.pipSize, Number.EPSILON)
  const quoteSpreadPips = Number.isFinite(Number(quote?.ask)) && Number.isFinite(Number(quote?.bid)) &&
    Number(quote?.ask) > Number(quote?.bid)
    ? (Number(quote?.ask) - Number(quote?.bid)) / Math.max(effectiveSymbol.pipSize, Number.EPSILON)
    : 0
  // cTrader distance mode 1 is symbol points; mode 2 is hundredths of a
  // percent (100 means 1%). Convert both to pips before validating AUTO / EDIT.
  const brokerMinStopPriceDistance = brokerDistanceUnit === 1
    ? Math.max(0, Number(brokerMetadata.slDistance) || 0) * brokerPricePoint
    : brokerDistanceUnit === 2
      ? Math.max(0, Number(brokerMetadata.slDistance) || 0) * Math.max(entryPrice, 0) / 10000
      : 0
  const brokerMinTargetPriceDistance = brokerDistanceUnit === 1
    ? Math.max(0, Number(brokerMetadata.tpDistance) || 0) * brokerPricePoint
    : brokerDistanceUnit === 2
      ? Math.max(0, Number(brokerMetadata.tpDistance) || 0) * Math.max(entryPrice, 0) / 10000
      : 0
  const brokerMinStopPips = brokerMinStopPriceDistance / Math.max(effectiveSymbol.pipSize, Number.EPSILON) + quoteSpreadPips + brokerPointPips
  const brokerMinTargetPips = brokerMinTargetPriceDistance / Math.max(effectiveSymbol.pipSize, Number.EPSILON) + brokerPointPips
  // AUTO scales the reference distance with risk but never goes below the
  // broker's known minimum. Lot sizing then adjusts to keep planned cash risk.
  const autoStopPips = Math.max(
    scaleAutoRiskDistance(usesSetupStopDistance ? setupStopPips : 10, requestedRisk),
    brokerMinStopPips,
  )
  const autoTargetPips = Math.max(
    scaleAutoRiskDistance(usesSetupTargetDistance ? setupTargetPips : 20, requestedRisk),
    brokerMinTargetPips,
  )
  const stopPips = stopDistanceMode === 'auto' ? autoStopPips : (stopPipsInput.trim() ? Number(stopPipsInput) : Number.NaN)
  const targetPips = targetDistanceMode === 'auto' ? autoTargetPips : (targetPipsInput.trim() ? Number(targetPipsInput) : Number.NaN)
  const protectionDistanceError = stopPips > 0 && stopPips + 1e-8 < brokerMinStopPips
    ? 'cTrader requires a stop distance of at least ' + brokerMinStopPips.toFixed(1) + ' pips for this symbol.'
    : targetPips > 0 && targetPips + 1e-8 < brokerMinTargetPips
      ? 'cTrader requires a target distance of at least ' + brokerMinTargetPips.toFixed(1) + ' pips for this symbol.'
      : ''
  const lots = lotsInput.trim() ? Number(lotsInput) : 0

  const stopLossPrice = Number.isFinite(entryPrice) && Number.isFinite(stopPips) && stopPips > 0
    ? Number((side === 'BUY' ? entryPrice - stopPips * effectiveSymbol.pipSize : entryPrice + stopPips * effectiveSymbol.pipSize).toFixed(effectiveSymbol.pricePrecision))
    : 0
  const takeProfitPrice = Number.isFinite(entryPrice) && Number.isFinite(targetPips) && targetPips > 0
    ? Number((side === 'BUY' ? entryPrice + targetPips * effectiveSymbol.pipSize : entryPrice - targetPips * effectiveSymbol.pipSize).toFixed(effectiveSymbol.pricePrecision))
    : 0

  const plan = useMemo(() => calculateCfdRiskPlan({
    accountBalance,
    accountCurrency,
    symbol: effectiveSymbol,
    side,
    entryPrice,
    stopLossPrice,
    takeProfitPrice,
    ...(riskSizing ? { riskAmount: requestedRisk } : { lots }),
  }), [accountBalance, accountCurrency, effectiveSymbol, entryPrice, lots, requestedRisk, riskSizing, side, stopLossPrice, takeProfitPrice])

  const selectedMargin = side === 'BUY' ? margin?.buyMargin ?? null : margin?.sellMargin ?? null
  const riskWindowRisk = plan.valid ? plan.estimatedLossAtStop : 0
  const rewardWindow = plan.valid ? plan.estimatedRewardAtTarget : 0
  const riskRatio = plan.valid ? plan.riskRewardRatio : 0
  const buyButtonDirection: QuoteTickDirection = marketDirection === 'down' ? 'down' : 'up'
  const sellButtonDirection: QuoteTickDirection = marketDirection === 'down' ? 'up' : 'down'
  const quoteTileStateClass = (direction: QuoteTickDirection, ready: boolean): string =>
    ready ? `shafx-quote-tile--${direction}` : 'shafx-quote-tile--unavailable'
  const quoteTileStyle = (direction: QuoteTickDirection, ready: boolean, buttonSide: TradeSide): React.CSSProperties => {
    if (!ready) return buttonSide === 'BUY'
      ? { backgroundColor: '#15375A', borderColor: '#2F80FF', color: '#D4E5FF' }
      : { backgroundColor: '#4A1B25', borderColor: '#F04452', color: '#FFE0E4' }
    if (direction === 'down') return { backgroundColor: '#C52D41', borderColor: '#FF6979', color: '#FFFFFF' }
    if (direction === 'up') return { backgroundColor: '#176FC1', borderColor: '#70B9FF', color: '#FFFFFF' }
    return buttonSide === 'BUY'
      ? { backgroundColor: '#176FC1', borderColor: '#70B9FF', color: '#FFFFFF' }
      : { backgroundColor: '#C52D41', borderColor: '#FF6979', color: '#FFFFFF' }
  }

  useEffect(() => {
    setSide(aiSetup?.direction ?? 'BUY')
    if (aiSetup) {
      setStopDistanceMode('auto')
      setTargetDistanceMode('auto')
      setStopPipsInput('')
      setTargetPipsInput('')
    } else {
      setStopDistanceMode('manual')
      setTargetDistanceMode('manual')
    }
  }, [aiSetup?.direction, aiSetup?.entryPrice, aiSetup?.stopLoss, aiSetup?.takeProfit, symbol])

  useEffect(() => {
    if (providerSelection?.providerId !== 'ctrader' || !connection?.accountId) return
    const updateNow = (): void => setNow(Date.now())
    updateNow()
    const timer = window.setInterval(updateNow, 1000)
    return () => window.clearInterval(timer)
  }, [connection?.accountId, providerSelection?.providerId])

  useEffect(() => {
    const bid = Number(quote?.bid)
    const ask = Number(quote?.ask)
    const midpoint = (bid + ask) / 2
    const clearReset = (): void => {
      if (marketDirectionResetTimerRef.current !== null) window.clearTimeout(marketDirectionResetTimerRef.current)
      marketDirectionResetTimerRef.current = null
    }
    if (!quoteFresh || !Number.isFinite(midpoint) || midpoint <= 0 || bid <= 0 || ask <= 0) {
      clearReset()
      previousMidPriceRef.current = null
      setMarketDirection('neutral')
      return
    }
    const previous = previousMidPriceRef.current
    previousMidPriceRef.current = midpoint
    if (previous === null) {
      clearReset()
      setMarketDirection('neutral')
      return
    }
    const direction = getQuoteTickDirection(midpoint, previous)
    if (direction === 'neutral') return
    clearReset()
    setMarketDirection(direction)
    marketDirectionResetTimerRef.current = window.setTimeout(() => {
      setMarketDirection('neutral')
      marketDirectionResetTimerRef.current = null
    }, QUOTE_TICK_COLOR_HOLD_MS)
  }, [quoteFresh, quote?.bid, quote?.ask])

  useEffect(() => {
    previousMidPriceRef.current = null
    if (marketDirectionResetTimerRef.current !== null) window.clearTimeout(marketDirectionResetTimerRef.current)
    marketDirectionResetTimerRef.current = null
    setMarketDirection('neutral')
    setQuote(null)
    setInstrument(null)
    setQuoteReceivedAtMs(0)
    if (!connection?.accountId || !connection.connectionId || providerSelection?.providerId !== 'ctrader') {
      setQuoteLoading(false)
      return
    }
    setQuoteLoading(true)
    const unsubscribe = subscribeCTraderLiveQuote({
      connectionId: connection.connectionId,
      accountId: connection.accountId,
      environment: connection.environment === 'live' ? 'live' : 'demo',
      symbol,
    }, (nextQuote, nextInstrument) => {
      const receivedAtMs = Date.now()
      setQuote(nextQuote)
      setInstrument(nextInstrument)
      setQuoteReceivedAtMs(receivedAtMs)
      setNow(receivedAtMs)
      setQuoteLoading(false)
      setError('')
    })
    return () => {
      unsubscribe()
      if (marketDirectionResetTimerRef.current !== null) window.clearTimeout(marketDirectionResetTimerRef.current)
      marketDirectionResetTimerRef.current = null
      setQuoteLoading(false)
    }
  }, [connection?.accountId, connection?.connectionId, connection?.environment, providerSelection?.providerId, symbol])

  const lines = useMemo<ChartAnnotation[]>(() => {
    if (!activePosition) return []
    return [
      lineFor(activePosition.id + '-entry', activePosition.entryPrice, activePosition.type === 'BUY' ? 'BUY ENTRY' : 'SELL ENTRY', activePosition.type === 'BUY' ? '#2F80FF' : '#F04452', 2),
      lineFor(activePosition.id + '-sl', activePosition.plannedStopLossPrice ?? activePosition.stopLoss, 'SL ' + (activePosition.stopLossPips ? activePosition.stopLossPips.toFixed(1) + 'p' : ''), '#F04452'),
      lineFor(activePosition.id + '-tp', activePosition.plannedTakeProfitPrice ?? activePosition.takeProfit, 'TP ' + (activePosition.takeProfitPips ? activePosition.takeProfitPips.toFixed(1) + 'p' : ''), '#2F80FF'),
    ].filter((line): line is ChartAnnotation => Boolean(line))
  }, [activePosition])
  
  useEffect(() => {
    onTradeLinesChange?.(lines)
  }, [lines, onTradeLinesChange])

  const resetError = (): void => {
    setError('')
    setState('ready')
  }

  const chooseSide = (value: TradeSide): void => {
    setSide(value)
    resetError()
  }

  const connectCTrader = (): void => {
    window.location.assign('/api/providers/ctrader?op=login')
  }

  const place = async (): Promise<void> => {
    if (!connection || providerSelection?.providerId !== 'ctrader' || !providerSelection?.accountId) {
      setError('Connect a Deriv cTrader practice account before placing a CFD.')
      setState('error')
      return
    }
    if (!plan.valid) {
      setError(plan.error || 'The position size is not valid.')
      setState('error')
      return
    }
    setState('placing')
    setError('')
    setProtectionWarning('')
    try {
      if (protectionDistanceError) throw new Error(protectionDistanceError)

      // A fresh cached margin is a quick local guard. Never delay market order
      // submission for a separate margin WebSocket round-trip; cTrader validates
      // actual available margin during execution.
      let marginToUse: MarginResult | null = null
      let marginCacheKey = ''
      const roundedLots = Number(Number(plan.lotSize).toFixed(2))
      if (instrument?.providerSymbol) {
        marginCacheKey = [
          connection.environment,
          connection.accountId,
          instrument.providerSymbol,
          roundedLots.toFixed(2),
        ].join(':')
        const cached = sharedCTraderMarginCache.get(marginCacheKey)
        if (cached && cached.expiresAt > Date.now()) {
          marginToUse = cached.margin
          setMargin(marginToUse)
        }
      }
      const requiredMargin = side === 'BUY' ? marginToUse?.buyMargin ?? null : marginToUse?.sellMargin ?? null
      if (requiredMargin !== null && requiredMargin > accountFreeMargin) {
        throw new Error('Required broker margin is above the available free margin. Reduce volume or risk.')
      }

      const payload = await postCTrader({
        connectionId: connection.connectionId,
        accountId: connection.accountId,
        environment: connection.environment,
        action: 'placeOrder',
        ...(instrument?.providerSymbol ? { symbolId: instrument.providerSymbol } : {}),
        order: {
          symbol,
          side,
          quantity: plan.lotSize,
          quantityUnit: 'lots',
          type: 'MARKET',
          // The API converts these absolute planned levels to relative distances
          // so cTrader anchors protection to the actual fill price.
          entryPrice,
          stopLoss: stopLossPrice,
          takeProfit: takeProfitPrice,
          clientOrderId: 'shafx-' + crypto.randomUUID(),
        },
      })
      const order = (payload.order || {}) as Record<string, unknown>
      const rawOrder = (order.raw && typeof order.raw === 'object' && order.raw) ? order.raw as Record<string, unknown> : {}
      const protectionApplied = order.protectionApplied === true
        ? true
        : order.protectionApplied === false ? false : undefined
      const protectionError = String(order.protectionError || '')
      const rawPosition = (rawOrder.position && typeof rawOrder.position === 'object' && rawOrder.position) ? rawOrder.position as Record<string, unknown> : {}
      const providerOrderId = String(order.providerOrderId || rawOrder.orderId || crypto.randomUUID())
      const positionId = String(order.positionId || rawPosition.positionId || '')
      const executionPrice = Number(
        order.executionPrice ??
          ((order.raw && typeof order.raw === 'object' && order.raw)
            ? ((rawOrder.executedPrice ?? rawOrder.executionPrice ?? rawOrder.price ?? rawPosition.price) as number | string | undefined)
            : entryPrice),
      )
      const filledEntryPrice = Number.isFinite(executionPrice) && executionPrice > 0 ? executionPrice : entryPrice
      const stopDistancePrice = Number((Math.round(Math.abs(entryPrice - stopLossPrice) * 100000) / 100000).toFixed(effectiveSymbol.pricePrecision))
      const targetDistancePrice = Number((Math.round(Math.abs(takeProfitPrice - entryPrice) * 100000) / 100000).toFixed(effectiveSymbol.pricePrecision))
      const brokerStopPrice = Number(rawPosition.stopLoss)
      const brokerTargetPrice = Number(rawPosition.takeProfit)
      const plannedStopAtFill = side === 'BUY' ? filledEntryPrice - stopDistancePrice : filledEntryPrice + stopDistancePrice
      const plannedTargetAtFill = side === 'BUY' ? filledEntryPrice + targetDistancePrice : filledEntryPrice - targetDistancePrice
      const effectiveStopLossPrice = Number.isFinite(brokerStopPrice) && brokerStopPrice > 0
        ? brokerStopPrice
        : Number(plannedStopAtFill.toFixed(effectiveSymbol.pricePrecision))
      const effectiveTakeProfitPrice = Number.isFinite(brokerTargetPrice) && brokerTargetPrice > 0
        ? brokerTargetPrice
        : Number(plannedTargetAtFill.toFixed(effectiveSymbol.pricePrecision))
      const trade: TradeOrder = {
        // cTrader close/amend operations require the broker positionId, not the orderId.
        id: positionId || providerOrderId,
        symbol,
        type: side,
        lotSize: plan.lotSize,
        volumeLots: plan.lotSize,
        entryPrice: filledEntryPrice,
        currentPrice: filledEntryPrice,
        pnlReferencePrice: filledEntryPrice,
        pnlReferenceProfit: 0,
        pnlPipSize: effectiveSymbol.pipSize,
        stopLoss: effectiveStopLossPrice,
        takeProfit: effectiveTakeProfitPrice,
        plannedStopLossPrice: effectiveStopLossPrice,
        plannedTakeProfitPrice: effectiveTakeProfitPrice,
        riskPercent: accountBalance > 0 ? (plan.estimatedLossAtStop / accountBalance) * 100 : 0,
        riskAmount: plan.estimatedLossAtStop,
        rewardAmount: plan.estimatedRewardAtTarget,
        riskRewardRatio: plan.riskRewardRatio,
        status: 'open',
        openTime: new Date().toISOString(),
        profit: 0,
        providerOrderId,
        brokerProduct: 'SHAFX_CFD_CTRADER',
        providerId: 'ctrader',
        providerConnectionId: connection.connectionId,
        providerAccountId: connection.accountId,
        pipValuePerLot: plan.pipValuePerLot,
        notionalValue: plan.notionalValue,
        usedMargin: (side === 'BUY' ? marginToUse?.buyMargin ?? null : marginToUse?.sellMargin ?? null) ?? undefined,
        stopLossPips: plan.stopDistancePips,
        takeProfitPips: plan.targetDistancePips,
        brokerProtectionConfirmed: protectionApplied,
        brokerProtectionError: protectionApplied === false
          ? protectionError || 'cTrader did not confirm the requested broker-side SL/TP levels.'
          : undefined,
      }
      onTradeOpened(trade)

      // Warm margin in the background for a subsequent order, rather than making
      // the current market entry wait for another cTrader connection.
      if (instrument?.providerSymbol && marginCacheKey) {
        const cached = sharedCTraderMarginCache.get(marginCacheKey)
        if (!cached || cached.expiresAt <= Date.now()) {
          let marginResult = sharedCTraderMarginInflight.get(marginCacheKey)
          if (!marginResult) {
            marginResult = postCTrader({
              connectionId: connection.connectionId,
              accountId: connection.accountId,
              environment: connection.environment,
              action: 'margin',
              symbol,
              symbolId: instrument.providerSymbol,
              lots: roundedLots,
            }).then((marginPayload) => {
              const next = marginPayload.margin as MarginResult
              sharedCTraderMarginCache.set(marginCacheKey, { margin: next, expiresAt: Date.now() + SHARED_CTRADER_MARGIN_CACHE_MS })
              return next
            }).finally(() => {
              if (sharedCTraderMarginInflight.get(marginCacheKey) === marginResult) sharedCTraderMarginInflight.delete(marginCacheKey)
            })
            sharedCTraderMarginInflight.set(marginCacheKey, marginResult)
          }
          void marginResult.then(setMargin).catch(() => undefined)
        }
      }

      if (protectionApplied === false) {
        setProtectionWarning(
          'Trade opened, but cTrader did not confirm broker-side SL/TP. Treat the chart levels as unconfirmed and check this position in cTrader. ' +
          (protectionError || ''),
        )
      } else {
        setProtectionWarning('')
      }
      setState('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to place the cTrader practice order.')
      setState('error')
    }
  }

  const handleClose = async (): Promise<void> => {
    if (!activePosition?.id || !onTradeClosed) return
    await onTradeClosed(activePosition.id)
  }

  const liveQuotePrice = activePosition?.type === 'SELL'
    ? Number(quote?.ask ?? 0)
    : Number(quote?.bid ?? 0)
  const priceNow = activePosition?.currentPrice && activePosition.currentPrice > 0
    ? activePosition.currentPrice
    : liveQuotePrice > 0 ? liveQuotePrice : entryPrice

  if (activePosition) {
    const brokerProfit = Number(activePosition.profit)
    const isProfit = brokerProfit >= 0
    return (
      <section className="overflow-hidden border border-shafx-border bg-shafx-surface">
        <header className="border-b border-shafx-border px-3 py-3 sm:px-4">
          <div className="flex items-start justify-between gap-3">
            <div><div className="flex items-center gap-2"><span className="text-[10px] font-semibold uppercase tracking-[0.16em]">SHAFX CFD</span><span className="rounded-full border border-shafx-success/25 bg-shafx-success/10 px-2 py-0.5 text-[7px] font-bold text-shafx-success">LIVE POSITION</span></div><div className="mt-1 font-mono text-[8px] text-shafx-textMuted">{symbol} • {activePosition.type} • cTrader practice</div></div>
            <div className={'font-mono text-xl font-semibold tabular-nums ' + (isProfit ? 'text-shafx-success' : 'text-shafx-danger')}>{formatCurrency(brokerProfit, accountCurrency)}</div>
          </div>
          <div className="mt-3 grid grid-cols-2 border-y border-shafx-border sm:grid-cols-4">
            <div className="px-2 py-2 sm:border-r border-shafx-border"><div className="text-[9px] uppercase tracking-[0.12em] text-shafx-textMuted">Volume</div><div className="mt-1 font-mono text-xs font-semibold">{Number(activePosition.volumeLots ?? activePosition.lotSize ?? 0).toFixed(2)} lot</div></div>
            <div className="px-2 py-2 sm:border-r border-shafx-border"><div className="text-[9px] uppercase tracking-[0.12em] text-shafx-textMuted">Entry</div><div className="mt-1 font-mono text-xs font-semibold">{formatPrice(activePosition.entryPrice, symbolSpec.pricePrecision)}</div></div>
            <div className="px-2 py-2 sm:border-r border-shafx-border"><div className="text-[9px] uppercase tracking-[0.12em] text-shafx-textMuted">Current</div><div className="mt-1 font-mono text-xs font-semibold">{formatPrice(priceNow, symbolSpec.pricePrecision)}</div></div>
            <div className="px-2 py-2"><div className="text-[9px] uppercase tracking-[0.12em] text-shafx-textMuted">Age</div><div className="mt-1 flex items-center gap-1 font-mono text-xs font-semibold"><Clock3 className="h-3 w-3 text-shafx-textMuted" />{getTradeAge(activePosition.openTime, now)}</div></div>
          </div>
        </header>
        {protectionWarning && <div role="alert" className="border-b border-shafx-warning/30 bg-shafx-warning/[0.08] px-3 py-2 text-[8px] leading-4 text-shafx-warning">{protectionWarning}</div>}
        <div className="grid grid-cols-2 gap-px bg-shafx-border">
          <div className="bg-shafx-surface p-3"><div className="text-[8px] uppercase tracking-[0.12em] text-shafx-danger">Stop loss{activePosition.brokerProtectionConfirmed === false ? ' · UNCONFIRMED' : ''}</div><div className="mt-1 font-mono text-sm">{activePosition.plannedStopLossPrice ? formatPrice(activePosition.plannedStopLossPrice, symbolSpec.pricePrecision) : '—'}</div><div className="mt-1 font-mono text-[8px] text-shafx-textMuted">{activePosition.stopLossPips ? activePosition.stopLossPips.toFixed(1) + ' pips' : '—'}</div></div>
          <div className="bg-shafx-surface p-3 text-right"><div className="text-[8px] uppercase tracking-[0.12em] text-shafx-success">Take profit{activePosition.brokerProtectionConfirmed === false ? ' · UNCONFIRMED' : ''}</div><div className="mt-1 font-mono text-sm">{activePosition.plannedTakeProfitPrice ? formatPrice(activePosition.plannedTakeProfitPrice, symbolSpec.pricePrecision) : '—'}</div><div className="mt-1 font-mono text-[8px] text-shafx-textMuted">{activePosition.takeProfitPips ? activePosition.takeProfitPips.toFixed(1) + ' pips' : '—'}</div></div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-shafx-border px-3 py-2.5">
          <div className="text-[8px] leading-4 text-shafx-textMuted"><ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-shafx-accent" />Broker-managed SL/TP stays with cTrader.</div>
          <button type="button" onClick={() => void handleClose()} className="inline-flex min-h-9 items-center gap-1.5 border border-shafx-danger/40 bg-shafx-danger/10 px-3 text-[8px] font-semibold text-shafx-danger"><XCircle className="h-3.5 w-3.5" /> CLOSE</button>
        </div>
        <div className="border-t border-shafx-border">
          <div className="px-3 py-2 text-[8px] font-semibold uppercase tracking-[0.14em] text-shafx-textMuted">Open another setup</div>
          {renderPlanningTicket()}
        </div>
      </section>
    )
  }

  function renderPlanningTicket(): React.ReactNode {
    const cTraderReady = Boolean(connection?.accountId && providerSelection?.providerId === 'ctrader' && connection.environment === 'demo')
    const brokerQuoteReady = Boolean(
      quoteFresh && instrument?.providerSymbol && quote &&
      Number.isFinite(Number(quote.bid)) && Number.isFinite(Number(quote.ask)) &&
      Number(quote.bid) > 0 && Number(quote.ask) > 0,
    )
    const canTrade = Boolean(cTraderReady && brokerQuoteReady && plan.valid && !protectionDistanceError)
    return (
      <div className="bg-[#080D13] p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <div><div className="text-[10px] font-semibold uppercase tracking-[0.16em]">SHAFX CFD • manual</div><div className="mt-0.5 font-mono text-[8px] text-shafx-textMuted">{symbol} • {timeframe} • Deriv cTrader</div></div>
          <div className={'rounded-full border px-2 py-1 text-[7px] font-bold tracking-wide ' + (brokerQuoteReady ? 'border-[#2F80FF]/35 bg-[#2F80FF]/10 text-[#8AB8FF]' : 'border-[#59616D] bg-[#151A21] text-[#AAB2BD]')}>{brokerQuoteReady ? 'LIVE PRICE' : quoteLoading ? 'CONNECTING' : connection?.accountId ? 'WAITING FOR TICKS' : 'OFFLINE'}</div>
        </div>

        {aiSetup && <div className="mt-2 flex items-center gap-2 rounded-xl border border-shafx-accent/20 bg-shafx-accent/[0.05] px-2.5 py-2 text-[8px] text-shafx-accent"><CheckCircle2 className="h-3.5 w-3.5" />Setup loaded. The final BUY/SELL button activates when the plan is complete.</div>}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" data-side="BUY" data-market-direction={buyButtonDirection} data-button-tone={buyButtonDirection} data-quote-ready={brokerQuoteReady ? 'true' : 'false'} style={quoteTileStyle(buyButtonDirection, brokerQuoteReady, 'BUY')} aria-label="Select BUY at Ask price" aria-pressed={side === 'BUY'} onClick={() => chooseSide('BUY')} className={'shafx-trade-side-button shafx-quote-tile ' + quoteTileStateClass(buyButtonDirection, brokerQuoteReady) + ' relative min-h-[66px] border px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shafx-accent'}>
            <span className="flex items-center justify-between gap-1 text-[11px] font-bold tracking-[0.08em]"><span>BUY</span><span className="text-[8px] uppercase tracking-[0.14em] text-[#AAB2BD]">ASK</span></span>
            <span className="shafx-trade-side-price mt-1 block font-mono text-base font-semibold tabular-nums sm:text-lg tracking-tight" style={{ color: brokerQuoteReady ? '#FFFFFF' : '#DDE4EC' }}>{brokerQuoteReady ? formatPrice(Number(quote?.ask), effectiveSymbol.pricePrecision) : '—'}</span>
          </button>
          <button type="button" data-side="SELL" data-market-direction={sellButtonDirection} data-button-tone={sellButtonDirection} data-quote-ready={brokerQuoteReady ? 'true' : 'false'} style={quoteTileStyle(sellButtonDirection, brokerQuoteReady, 'SELL')} aria-label="Select SELL at Bid price" aria-pressed={side === 'SELL'} onClick={() => chooseSide('SELL')} className={'shafx-trade-side-button shafx-quote-tile ' + quoteTileStateClass(sellButtonDirection, brokerQuoteReady) + ' relative min-h-[66px] border px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shafx-accent'}>
            <span className="flex items-center justify-between gap-1 text-[11px] font-bold tracking-[0.08em]"><span>SELL</span><span className="text-[8px] uppercase tracking-[0.14em] text-[#AAB2BD]">BID</span></span>
            <span className="shafx-trade-side-price mt-1 block font-mono text-base font-semibold tabular-nums sm:text-lg tracking-tight" style={{ color: brokerQuoteReady ? '#FFFFFF' : '#DDE4EC' }}>{brokerQuoteReady ? formatPrice(Number(quote?.bid), effectiveSymbol.pricePrecision) : '—'}</span>
          </button>
        </div>

        <div className="mt-3 rounded-2xl border border-shafx-border bg-shafx-surface">
          <div className="border-b border-shafx-border px-3 py-2.5"><div className="flex items-center justify-between gap-2"><span className="text-[8px] font-semibold uppercase tracking-[0.14em]">Risk Window</span><span className="font-mono text-[8px] text-shafx-textMuted">{accountCurrency} account</span></div><div className="mt-2 grid grid-cols-4 gap-1.5"><div className="rounded-lg border border-shafx-border bg-shafx-bg p-2"><div className="text-[6px] uppercase tracking-[0.12em] text-shafx-textMuted">Risk</div><div className="mt-1 font-mono text-[10px] font-semibold text-shafx-danger">{plan.valid ? formatCurrency(riskWindowRisk, accountCurrency) : '—'}</div></div><div className="rounded-lg border border-shafx-border bg-shafx-bg p-2"><div className="text-[6px] uppercase tracking-[0.12em] text-shafx-textMuted">Stop</div><div className="mt-1 font-mono text-[10px] font-semibold">{Number.isFinite(stopPips) && stopPips > 0 ? stopPips.toFixed(1) : '—'}p</div></div><div className="rounded-lg border border-shafx-border bg-shafx-bg p-2"><div className="text-[6px] uppercase tracking-[0.12em] text-shafx-textMuted">Target</div><div className="mt-1 font-mono text-[10px] font-semibold">{plan.valid ? formatCurrency(rewardWindow, accountCurrency) : '—'}</div></div><div className="rounded-lg border border-shafx-border bg-shafx-bg p-2"><div className="text-[6px] uppercase tracking-[0.12em] text-shafx-textMuted">R:R</div><div className="mt-1 font-mono text-[10px] font-semibold">1:{plan.valid && Number.isFinite(riskRatio) ? riskRatio.toFixed(2) : '—'}</div></div></div></div>
          <div className="grid grid-cols-2 gap-px bg-shafx-border">
            <div className="bg-shafx-surface p-3">
              <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-shafx-textMuted">Position size</div>
              <button type="button" onClick={() => { setRiskSizing((value) => !value) }} aria-pressed={riskSizing} className={riskSizing ? 'mt-2 rounded-lg border border-shafx-accent/40 bg-shafx-accent/10 px-2.5 py-1.5 text-[8px] font-bold text-shafx-accent' : 'mt-2 rounded-lg border border-shafx-border bg-shafx-bg px-2.5 py-1.5 text-[8px] font-bold text-shafx-textMuted'}>{riskSizing ? 'RISK AMOUNT' : 'FIXED LOTS'}</button>
              <div className="mt-2 text-[8px] leading-4 text-shafx-textMuted">{riskSizing ? 'You choose the money at risk.' : 'You choose the volume.'}</div>
            </div>
            <div className="bg-shafx-surface p-3">
              <label htmlFor="shafx-risk-or-lots" className="block text-[9px] font-semibold uppercase tracking-[0.12em] text-shafx-textMuted">{riskSizing ? 'Risk amount' : 'Lot size'}</label>
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-shafx-border bg-[#0A1018] px-2.5 py-2 focus-within:border-shafx-accent/70 focus-within:ring-1 focus-within:ring-shafx-accent/30">
                <span className="shrink-0 font-mono text-[9px] text-shafx-textMuted">{riskSizing ? accountCurrency : 'LOT'}</span>
                <input id="shafx-risk-or-lots" aria-label={riskSizing ? 'Risk amount' : 'Lot size'} type="number" min="0.01" step={riskSizing ? '0.50' : String(effectiveSymbol.lotStep || 0.01)} value={riskSizing ? riskAmount : lotsInput} placeholder={riskSizing ? 'Enter amount' : 'Enter lots'} onChange={(event) => { if (riskSizing) setRiskAmount(event.target.value); else setLotsInput(event.target.value) }} className="min-w-0 w-full bg-transparent font-mono text-sm tabular-nums text-shafx-text outline-none placeholder:text-shafx-textMuted/60" />
              </div>
              <div className="mt-1 text-[8px] text-shafx-textMuted">Editable field · tap to type</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px bg-shafx-border">
            <div className="bg-shafx-surface p-3">
              <div className="flex items-center justify-between gap-1">
                <label htmlFor="shafx-stop-distance" className="text-[9px] font-semibold uppercase tracking-[0.12em] text-shafx-textMuted">Stop distance</label>
                <div className="inline-flex rounded-lg border border-shafx-border bg-[#0A1018] p-0.5">
                  <button type="button" aria-pressed={stopDistanceMode === 'auto'} onClick={() => setStopDistanceMode('auto')} className={stopDistanceMode === 'auto' ? 'rounded-md bg-shafx-accent px-2 py-1 text-[8px] font-bold text-white' : 'rounded-md px-2 py-1 text-[8px] font-bold text-shafx-textMuted disabled:opacity-40'} title={usesSetupStopDistance ? 'Scale the selected setup stop by the entered risk amount' : 'Scale the 10-pip stop baseline with the entered risk amount'}>AUTO</button>
                  <button type="button" aria-pressed={stopDistanceMode === 'manual'} onClick={() => { setStopPipsInput(Number.isFinite(stopPips) && stopPips > 0 ? stopPips.toFixed(1) : ''); setStopDistanceMode('manual') }} className={stopDistanceMode === 'manual' ? 'rounded-md bg-shafx-accent px-2 py-1 text-[8px] font-bold text-white' : 'rounded-md px-2 py-1 text-[8px] font-bold text-shafx-textMuted'}>EDIT</button>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-shafx-border bg-[#0A1018] px-2.5 py-2 focus-within:border-shafx-accent/70 focus-within:ring-1 focus-within:ring-shafx-accent/30">
                <input id="shafx-stop-distance" aria-label="Stop distance in pips" type="number" min="0.1" step="0.1" value={stopDistanceMode === 'auto' ? autoStopPips.toFixed(1) : stopPipsInput} disabled={stopDistanceMode === 'auto'} placeholder={stopDistanceMode === 'auto' ? 'From setup' : 'Enter pips'} onChange={(event) => { setStopPipsInput(event.target.value) }} className="min-w-0 w-full bg-transparent font-mono text-sm tabular-nums text-shafx-text outline-none placeholder:text-shafx-textMuted/60 disabled:cursor-not-allowed disabled:opacity-75" />
                <span className="shrink-0 font-mono text-[8px] text-shafx-textMuted">PIPS</span>
              </div>
              <div className="mt-1 text-[8px] text-shafx-textMuted">{stopDistanceMode === 'auto' ? (usesSetupStopDistance ? 'Selected setup scaled by risk amount' : 'AUTO baseline · 10 pips at ' + formatCurrency(10, accountCurrency) + ' risk') : 'Editable · enter your stop distance'}</div>
            </div>
            <div className="bg-shafx-surface p-3">
              <div className="flex items-center justify-between gap-1">
                <label htmlFor="shafx-target-distance" className="text-[9px] font-semibold uppercase tracking-[0.12em] text-shafx-textMuted">Target distance</label>
                <div className="inline-flex rounded-lg border border-shafx-border bg-[#0A1018] p-0.5">
                  <button type="button" aria-pressed={targetDistanceMode === 'auto'} onClick={() => setTargetDistanceMode('auto')} className={targetDistanceMode === 'auto' ? 'rounded-md bg-shafx-accent px-2 py-1 text-[8px] font-bold text-white' : 'rounded-md px-2 py-1 text-[8px] font-bold text-shafx-textMuted disabled:opacity-40'} title={usesSetupTargetDistance ? 'Scale the selected setup target by the entered risk amount' : 'Scale the 20-pip target baseline with the entered risk amount'}>AUTO</button>
                  <button type="button" aria-pressed={targetDistanceMode === 'manual'} onClick={() => { setTargetPipsInput(Number.isFinite(targetPips) && targetPips > 0 ? targetPips.toFixed(1) : ''); setTargetDistanceMode('manual') }} className={targetDistanceMode === 'manual' ? 'rounded-md bg-shafx-accent px-2 py-1 text-[8px] font-bold text-white' : 'rounded-md px-2 py-1 text-[8px] font-bold text-shafx-textMuted'}>EDIT</button>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-shafx-border bg-[#0A1018] px-2.5 py-2 focus-within:border-shafx-accent/70 focus-within:ring-1 focus-within:ring-shafx-accent/30">
                <input id="shafx-target-distance" aria-label="Target distance in pips" type="number" min="0.1" step="0.1" value={targetDistanceMode === 'auto' ? autoTargetPips.toFixed(1) : targetPipsInput} disabled={targetDistanceMode === 'auto'} placeholder={targetDistanceMode === 'auto' ? 'From setup' : 'Enter pips'} onChange={(event) => { setTargetPipsInput(event.target.value) }} className="min-w-0 w-full bg-transparent font-mono text-sm tabular-nums text-shafx-text outline-none placeholder:text-shafx-textMuted/60 disabled:cursor-not-allowed disabled:opacity-75" />
                <span className="shrink-0 font-mono text-[8px] text-shafx-textMuted">PIPS</span>
              </div>
              <div className="mt-1 text-[8px] text-shafx-textMuted">{targetDistanceMode === 'auto' ? (usesSetupTargetDistance ? 'Selected setup scaled by risk amount' : 'AUTO baseline · 20 pips at ' + formatCurrency(10, accountCurrency) + ' risk') : 'Editable · enter your target distance'}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px bg-shafx-border">
            <div className="bg-shafx-surface p-3"><div className="text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Volume</div><div className="mt-1 font-mono text-lg font-semibold">{plan.valid ? plan.lotSize.toFixed(2) : '—'} <span className="text-[8px] text-shafx-textMuted">lot</span></div></div>
            <div className="bg-shafx-surface p-3 text-right"><div className="text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Pip value</div><div className="mt-1 font-mono text-lg font-semibold">{plan.valid ? formatCurrency(plan.pipValuePerLot * Math.max(plan.lotSize, 0), accountCurrency) : '—'}<span className="ml-1 text-[8px] text-shafx-textMuted">/pip</span></div></div>
          </div>
        </div>

        {protectionDistanceError && <div role="alert" className="mt-2 rounded-xl border border-shafx-warning/25 bg-shafx-warning/[0.06] px-3 py-2.5 text-[8px] leading-4 text-shafx-warning">{protectionDistanceError} AUTO will adjust its distance when selected.</div>}

        {plan.warning && <div className="mt-2 rounded-xl border border-shafx-warning/25 bg-shafx-warning/[0.06] px-3 py-2.5 text-[8px] leading-4 text-shafx-warning">
          <span className="font-semibold">Broker minimum lot:</span> {plan.warning}
        </div>}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-shafx-border bg-shafx-surface p-2.5"><div className="text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Broker margin</div><div className="mt-1 font-mono text-sm font-semibold">{selectedMargin !== null ? formatCurrency(selectedMargin, accountCurrency) : 'Checked on trade'}</div><div className="mt-1 text-[7px] leading-3.5 text-shafx-textMuted">SHAFX checks cTrader margin before you place the trade.</div></div>
          <div className="rounded-xl border border-shafx-border bg-shafx-surface p-2.5"><div className="text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Price plan</div><div className="mt-1 font-mono text-[9px]">Entry {formatPrice(entryPrice, effectiveSymbol.pricePrecision)}</div><div className="mt-1 grid grid-cols-2 gap-2 text-[8px]"><span className="text-shafx-danger">SL {stopLossPrice > 0 ? formatPrice(stopLossPrice, effectiveSymbol.pricePrecision) : '—'}</span><span className="text-right text-shafx-success">TP {takeProfitPrice > 0 ? formatPrice(takeProfitPrice, effectiveSymbol.pricePrecision) : '—'}</span></div></div>
        </div>

        <div className="mt-3 rounded-xl border border-shafx-accent/20 bg-shafx-accent/[0.04] px-3 py-2.5 text-[8px] leading-4 text-shafx-textMuted">
          <span className="font-semibold text-shafx-text">Why this size?</span> {riskSizing
            ? 'SHAFX starts from your selected risk amount and stop distance, then rounds volume down to the broker step. A tighter stop can increase volume; a wider stop reduces it.'
            : 'You chose the lot size directly. SHAFX still shows the resulting dollar risk before you confirm.'}
        </div>

        
        {!cTraderReady && <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-shafx-warning/25 bg-shafx-warning/[0.05] px-3 py-2.5">
          <div><div className="text-[8px] font-semibold text-shafx-warning">cTrader practice account not connected</div><div className="mt-1 text-[7px] leading-3.5 text-shafx-textMuted">The new SHAFX CFD ticket is ready, but broker execution requires Deriv cTrader authorization.</div></div>
          <button type="button" onClick={connectCTrader} className="min-h-9 shrink-0 rounded-lg bg-shafx-accent px-3 text-[8px] font-bold text-white">CONNECT cTRADER</button>
        </div>}

{error && <div role="alert" className="mt-3 rounded-xl border border-shafx-danger/25 bg-shafx-danger/10 px-3 py-2 text-[8px] leading-4 text-shafx-danger">{error}</div>}
          {!plan.valid && !error && <div role="status" className="mt-3 rounded-xl border border-shafx-border bg-shafx-surface px-3 py-2 text-[8px] leading-4 text-shafx-textMuted">{aiSetup ? (riskSizing ? 'Enter the risk amount to calculate volume, or choose fixed lots.' : 'Enter a lot size to calculate the plan.') : 'Enter a risk amount and both distances, or load a setup to use AUTO distances.'}</div>}

        <button type="button" onClick={() => void place()} disabled={!canTrade || state === 'placing'} className={'mt-3 flex min-h-12 w-full items-center justify-center gap-2 text-[9px] font-bold ' + (side === 'BUY' ? 'bg-[#176FC1] text-white' : 'bg-[#C52D41] text-white') + ' disabled:opacity-45'}>
          {state === 'placing'
            ? <><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> PLACING {side}…</>
            : !cTraderReady
              ? <><ArrowUpRight className="h-3.5 w-3.5" /> CONNECT cTRADER TO TRADE</>
              : !brokerQuoteReady
                ? <><LoaderCircle className="h-3.5 w-3.5" /> WAITING FOR cTRADER PRICE…</>
                : <><CheckCircle2 className="h-3.5 w-3.5" /> {connection?.environment === 'demo' ? side : 'LIVE LOCKED'}</>}
        </button>

        {connection?.environment !== 'demo' && <div className="mt-2 text-center text-[7px] uppercase tracking-[0.14em] text-shafx-warning">Live execution is deliberately locked until the SHAFX release gate passes.</div>}
      </div>
    )
  }

  return renderPlanningTicket()
}
