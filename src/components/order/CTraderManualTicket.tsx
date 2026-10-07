import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, CheckCircle2, Clock3, LoaderCircle, ShieldCheck, XCircle } from 'lucide-react'
import type { SymbolSpec, Timeframe, TradeOrder, TradeSide } from '../../types'
import type { SetupCandidate } from '../../engine/setup/types'
import type { ActiveProviderSelection } from '../../data/provider/providerConnections'
import { calculateCfdRiskPlan } from '../../lib/cfdRiskEngine'
import { formatCurrency, formatPrice } from '../../lib/format'
import type { DerivOrderConnection } from '../../data/deriv/derivTrading'
import type { ChartAnnotation } from '../chart/CandlestickChart'

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
  timestamp: string
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
  contractSize: Number(instrument?.contractSize) > 0 ? Number(instrument?.contractSize) : base.contractSize,
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
  const [riskAmount, setRiskAmount] = useState('2.00')
  const [lotsInput, setLotsInput] = useState('0.02')
  const [stopPipsInput, setStopPipsInput] = useState('10')
  const [targetPipsInput, setTargetPipsInput] = useState('20')
  const [quote, setQuote] = useState<ProviderQuote | null>(null)
  const [instrument, setInstrument] = useState<ProviderInstrument | null>(null)
  const [margin, setMargin] = useState<MarginResult | null>(null)
  const [marginLoading, setMarginLoading] = useState(false)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [state, setState] = useState<TicketState>('ready')
  const [error, setError] = useState('')
  const [now, setNow] = useState(0)
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const marginTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastQuoteErrorAt = useRef(0)
  const lastQuoteError = useRef('')

  const entryPrice = side === 'BUY'
    ? Number(quote?.ask ?? askPrice ?? currentPrice)
    : Number(quote?.bid ?? bidPrice ?? currentPrice)

  const effectiveSymbol = useMemo(() => providerSymbolSpec(symbolSpec, instrument), [instrument, symbolSpec])

  const stopPips = Number(stopPipsInput)
  const targetPips = Number(targetPipsInput)
  const lots = Number(lotsInput)
  const requestedRisk = Number(riskAmount)

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

  useEffect(() => {
    setSide(aiSetup?.direction ?? 'BUY')
  }, [aiSetup?.direction, symbol])

  useEffect(() => {
    if (!activePosition) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [activePosition?.openTime])

  useEffect(() => {
    if (!connection?.accountId || providerSelection?.providerId !== 'ctrader') return
    let cancelled = false

    const load = async (): Promise<void> => {
      setQuoteLoading(true)
      try {
        const payload = await postCTrader({
          connectionId: connection.connectionId,
          accountId: connection.accountId,
          environment: connection.environment,
          action: 'quote',
          symbol,
          ...(instrument?.providerSymbol ? { symbolId: instrument.providerSymbol } : {}),
        })
        if (cancelled) return
        const nextQuote = payload.quote as ProviderQuote
        const nextInstrument = payload.instrument as ProviderInstrument
        setQuote(nextQuote)
        setInstrument(nextInstrument)
        setError('')
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Unable to read the cTrader quote.'
          const nowMs = Date.now()
          if (message !== lastQuoteError.current || nowMs - lastQuoteErrorAt.current > 5000) {
            lastQuoteError.current = message
            lastQuoteErrorAt.current = nowMs
            setError(message)
          }
        }
      } finally {
        if (!cancelled) setQuoteLoading(false)
      }
    }

    void load()
    refreshTimer.current = window.setInterval(() => { void load() }, 1200)
    return () => {
      cancelled = true
      if (refreshTimer.current) window.clearInterval(refreshTimer.current)
      refreshTimer.current = null
    }
  }, [connection?.accountId, connection?.connectionId, connection?.environment, instrument?.providerSymbol, providerSelection?.providerId, symbol])

  useEffect(() => {
    if (!connection?.accountId || providerSelection?.providerId !== 'ctrader' || !plan.valid) {
      setMargin(null)
      return
    }
    if (marginTimer.current) window.clearTimeout(marginTimer.current)
    marginTimer.current = window.setTimeout(async () => {
      setMarginLoading(true)
      try {
        const payload = await postCTrader({
          connectionId: connection.connectionId,
          accountId: connection.accountId,
          environment: connection.environment,
          action: 'margin',
          symbol,
          ...(instrument?.providerSymbol ? { symbolId: instrument.providerSymbol } : {}),
          lots: plan.lotSize,
        })
        const next = payload.margin as MarginResult
        setMargin(next)
      } catch {
        setMargin(null)
      } finally {
        setMarginLoading(false)
      }
    }, 300)
    return () => {
      if (marginTimer.current) window.clearTimeout(marginTimer.current)
    }
  }, [connection?.accountId, connection?.connectionId, connection?.environment, instrument?.providerSymbol, plan.lotSize, plan.valid, providerSelection?.providerId, symbol])

  const lines = useMemo<ChartAnnotation[]>(() => {
    if (activePosition) {
      return [
        lineFor(activePosition.id + '-entry', activePosition.entryPrice, activePosition.type === 'BUY' ? 'BUY ENTRY' : 'SELL ENTRY', activePosition.type === 'BUY' ? '#22D3A5' : '#FF5C75', 2),
        lineFor(activePosition.id + '-sl', activePosition.plannedStopLossPrice ?? activePosition.stopLoss, 'SL ' + (activePosition.stopLossPips ? activePosition.stopLossPips.toFixed(1) + 'p' : ''), '#F6465D'),
        lineFor(activePosition.id + '-tp', activePosition.plannedTakeProfitPrice ?? activePosition.takeProfit, 'TP ' + (activePosition.takeProfitPips ? activePosition.takeProfitPips.toFixed(1) + 'p' : ''), '#0ECB81'),
      ].filter((line): line is ChartAnnotation => Boolean(line))
    }
    return [
      lineFor('shafx-cfd-sl', stopLossPrice, 'SL ' + (Number.isFinite(stopPips) ? stopPips.toFixed(1) + 'p' : ''), '#F6465D'),
      lineFor('shafx-cfd-tp', takeProfitPrice, 'TP ' + (Number.isFinite(targetPips) ? targetPips.toFixed(1) + 'p' : ''), '#0ECB81'),
    ].filter((line): line is ChartAnnotation => Boolean(line))
  }, [activePosition, stopLossPrice, stopPips, targetPips, takeProfitPrice])
  
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
    if (selectedMargin !== null && selectedMargin > accountFreeMargin) {
      setError('Required broker margin is above the available free margin. Reduce volume or risk.')
      setState('error')
      return
    }

    setState('placing')
    setError('')
    try {
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
          stopLoss: stopLossPrice,
          takeProfit: takeProfitPrice,
          clientOrderId: 'shafx-' + crypto.randomUUID(),
        },
      })
      const order = (payload.order || {}) as Record<string, unknown>
      const rawOrder = (order.raw && typeof order.raw === 'object' && order.raw) ? order.raw as Record<string, unknown> : {}
      const rawPosition = (rawOrder.position && typeof rawOrder.position === 'object' && rawOrder.position) ? rawOrder.position as Record<string, unknown> : {}
      const providerOrderId = String(order.providerOrderId || rawOrder.orderId || crypto.randomUUID())
      const positionId = String(order.positionId || rawPosition.positionId || '')
      const executionPrice = Number(
        order.executionPrice ??
          ((order.raw && typeof order.raw === 'object' && order.raw)
            ? ((rawOrder.executedPrice ?? rawOrder.executionPrice ?? rawOrder.price ?? rawPosition.price) as number | string | undefined)
            : entryPrice),
      )
      const trade: TradeOrder = {
        // cTrader close/amend operations require the broker positionId, not the orderId.
        id: positionId || providerOrderId,
        symbol,
        type: side,
        lotSize: plan.lotSize,
        volumeLots: plan.lotSize,
        entryPrice: Number.isFinite(executionPrice) && executionPrice > 0 ? executionPrice : entryPrice,
        currentPrice: entryPrice,
        stopLoss: stopLossPrice,
        takeProfit: takeProfitPrice,
        plannedStopLossPrice: stopLossPrice,
        plannedTakeProfitPrice: takeProfitPrice,
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
        usedMargin: selectedMargin ?? undefined,
        stopLossPips: plan.stopDistancePips,
        takeProfitPips: plan.targetDistancePips,
      }
      onTradeOpened(trade)
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
        <div className="grid grid-cols-2 gap-px bg-shafx-border">
          <div className="bg-shafx-surface p-3"><div className="text-[8px] uppercase tracking-[0.12em] text-shafx-danger">Stop loss</div><div className="mt-1 font-mono text-sm">{activePosition.plannedStopLossPrice ? formatPrice(activePosition.plannedStopLossPrice, symbolSpec.pricePrecision) : '—'}</div><div className="mt-1 font-mono text-[8px] text-shafx-textMuted">{activePosition.stopLossPips ? activePosition.stopLossPips.toFixed(1) + ' pips' : '—'}</div></div>
          <div className="bg-shafx-surface p-3 text-right"><div className="text-[8px] uppercase tracking-[0.12em] text-shafx-success">Take profit</div><div className="mt-1 font-mono text-sm">{activePosition.plannedTakeProfitPrice ? formatPrice(activePosition.plannedTakeProfitPrice, symbolSpec.pricePrecision) : '—'}</div><div className="mt-1 font-mono text-[8px] text-shafx-textMuted">{activePosition.takeProfitPips ? activePosition.takeProfitPips.toFixed(1) + ' pips' : '—'}</div></div>
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
      instrument?.providerSymbol &&
      quote &&
      Number.isFinite(Number(quote.bid)) &&
      Number.isFinite(Number(quote.ask)) &&
      Number(quote.bid) > 0 &&
      Number(quote.ask) > 0,
    )
    const canTrade = Boolean(cTraderReady && brokerQuoteReady && plan.valid && !marginLoading)
    return (
      <div className="bg-[#080D13] p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <div><div className="text-[10px] font-semibold uppercase tracking-[0.16em]">SHAFX CFD • manual</div><div className="mt-0.5 font-mono text-[8px] text-shafx-textMuted">{symbol} • {timeframe} • Deriv cTrader</div></div>
          <div className="rounded-full border border-shafx-accent/25 bg-shafx-accent/10 px-2 py-1 text-[7px] font-bold tracking-wide text-shafx-accent">{quoteLoading ? 'UPDATING' : brokerQuoteReady ? 'LIVE PRICE' : 'WAITING'}</div>
        </div>

        {aiSetup && <div className="mt-2 flex items-center gap-2 rounded-xl border border-shafx-accent/20 bg-shafx-accent/[0.05] px-2.5 py-2 text-[8px] text-shafx-accent"><CheckCircle2 className="h-3.5 w-3.5" />AI reviewed setup loaded — SHAFX still waits for your manual confirm.</div>}

        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <button type="button" onClick={() => chooseSide('BUY')} className={'min-h-12 border px-3 text-left ' + (side === 'BUY' ? 'border-shafx-success bg-shafx-success/[0.12]' : 'border-shafx-border bg-shafx-surface')}><span className={'text-[10px] font-bold ' + (side === 'BUY' ? 'text-shafx-success' : 'text-shafx-textMuted')}><ArrowUpRight className="mr-1 inline h-3.5 w-3.5" />BUY</span><span className="mt-1 block font-mono text-[8px] text-shafx-textMuted">ASK {quote?.ask ? formatPrice(quote.ask, effectiveSymbol.pricePrecision) : formatPrice(askPrice || currentPrice, effectiveSymbol.pricePrecision)}</span></button>
          <button type="button" onClick={() => chooseSide('SELL')} className={'min-h-12 border px-3 text-left ' + (side === 'SELL' ? 'border-shafx-danger bg-shafx-danger/[0.12]' : 'border-shafx-border bg-shafx-surface')}><span className={'text-[10px] font-bold ' + (side === 'SELL' ? 'text-shafx-danger' : 'text-shafx-textMuted')}><ArrowDownRight className="mr-1 inline h-3.5 w-3.5" />SELL</span><span className="mt-1 block font-mono text-[8px] text-shafx-textMuted">BID {quote?.bid ? formatPrice(quote.bid, effectiveSymbol.pricePrecision) : formatPrice(bidPrice || currentPrice, effectiveSymbol.pricePrecision)}</span></button>
        </div>

        <div className="mt-3 rounded-2xl border border-shafx-border bg-shafx-surface">
          <div className="border-b border-shafx-border px-3 py-2.5"><div className="flex items-center justify-between gap-2"><span className="text-[8px] font-semibold uppercase tracking-[0.14em]">Risk Window</span><span className="font-mono text-[8px] text-shafx-textMuted">{accountCurrency} account</span></div><div className="mt-2 grid grid-cols-4 gap-1.5"><div className="rounded-lg border border-shafx-border bg-shafx-bg p-2"><div className="text-[6px] uppercase tracking-[0.12em] text-shafx-textMuted">Risk</div><div className="mt-1 font-mono text-[10px] font-semibold text-shafx-danger">{formatCurrency(riskWindowRisk, accountCurrency)}</div></div><div className="rounded-lg border border-shafx-border bg-shafx-bg p-2"><div className="text-[6px] uppercase tracking-[0.12em] text-shafx-textMuted">Stop</div><div className="mt-1 font-mono text-[10px] font-semibold">{Number.isFinite(stopPips) ? stopPips.toFixed(1) : '—'}p</div></div><div className="rounded-lg border border-shafx-border bg-shafx-bg p-2"><div className="text-[6px] uppercase tracking-[0.12em] text-shafx-textMuted">Target</div><div className="mt-1 font-mono text-[10px] font-semibold">{formatCurrency(rewardWindow, accountCurrency)}</div></div><div className="rounded-lg border border-shafx-border bg-shafx-bg p-2"><div className="text-[6px] uppercase tracking-[0.12em] text-shafx-textMuted">R:R</div><div className="mt-1 font-mono text-[10px] font-semibold">1:{Number.isFinite(riskRatio) ? riskRatio.toFixed(2) : '—'}</div></div></div></div>
          <div className="grid grid-cols-2 gap-px bg-shafx-border">
            <div className="bg-shafx-surface p-3"><div className="text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Sizing</div><button type="button" onClick={() => setRiskSizing((value) => !value)} className="mt-1 rounded-lg border border-shafx-accent/25 bg-shafx-accent/[0.05] px-2 py-1 font-mono text-[7px] font-semibold text-shafx-accent">{riskSizing ? 'RISK-SIZED' : 'FIXED LOTS'}</button></div>
            <label className="bg-shafx-surface p-3"><span className="block text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">{riskSizing ? 'Risk amount' : 'Lots'}</span><div className="mt-1 flex items-center gap-1"><span className="font-mono text-[8px] text-shafx-textMuted">{riskSizing ? accountCurrency : ''}</span><input aria-label={riskSizing ? 'Risk amount' : 'Lots'} type="number" min="0.01" step={riskSizing ? '0.50' : String(effectiveSymbol.lotStep || 0.01)} value={riskSizing ? riskAmount : lotsInput} onChange={(event) => riskSizing ? setRiskAmount(event.target.value) : setLotsInput(event.target.value)} className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none" /></div></label>
          </div>
          <div className="grid grid-cols-2 gap-px bg-shafx-border">
            <label className="bg-shafx-surface p-3"><span className="block text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Stop distance</span><div className="mt-1 flex items-center gap-1"><input aria-label="Stop distance" type="number" min="1" step="1" value={stopPipsInput} onChange={(event) => setStopPipsInput(event.target.value)} className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none" /><span className="font-mono text-[8px] text-shafx-textMuted">pips</span></div></label>
            <label className="bg-shafx-surface p-3"><span className="block text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Target distance</span><div className="mt-1 flex items-center gap-1"><input aria-label="Target distance" type="number" min="1" step="1" value={targetPipsInput} onChange={(event) => setTargetPipsInput(event.target.value)} className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none" /><span className="font-mono text-[8px] text-shafx-textMuted">pips</span></div></label>
          </div>
          <div className="grid grid-cols-2 gap-px bg-shafx-border">
            <div className="bg-shafx-surface p-3"><div className="text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Volume</div><div className="mt-1 font-mono text-lg font-semibold">{plan.valid ? plan.lotSize.toFixed(2) : '—'} <span className="text-[8px] text-shafx-textMuted">lot</span></div></div>
            <div className="bg-shafx-surface p-3 text-right"><div className="text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Pip value</div><div className="mt-1 font-mono text-lg font-semibold">{formatCurrency(plan.pipValuePerLot * Math.max(plan.lotSize, 0), accountCurrency)}<span className="ml-1 text-[8px] text-shafx-textMuted">/pip</span></div></div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-shafx-border bg-shafx-surface p-2.5"><div className="text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Broker margin</div><div className="mt-1 font-mono text-sm font-semibold">{marginLoading ? 'Checking…' : selectedMargin !== null ? formatCurrency(selectedMargin, accountCurrency) : '—'}</div><div className="mt-1 text-[7px] leading-3.5 text-shafx-textMuted">cTrader estimates this from the live symbol and volume.</div></div>
          <div className="rounded-xl border border-shafx-border bg-shafx-surface p-2.5"><div className="text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Price plan</div><div className="mt-1 font-mono text-[9px]">Entry {formatPrice(entryPrice, effectiveSymbol.pricePrecision)}</div><div className="mt-1 grid grid-cols-2 gap-2 text-[8px]"><span className="text-shafx-danger">SL {formatPrice(stopLossPrice, effectiveSymbol.pricePrecision)}</span><span className="text-right text-shafx-success">TP {formatPrice(takeProfitPrice, effectiveSymbol.pricePrecision)}</span></div></div>
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

{(error || !plan.valid) && <div className="mt-3 rounded-xl border border-shafx-danger/25 bg-shafx-danger/10 px-3 py-2 text-[8px] leading-4 text-shafx-danger">{error || plan.error}</div>}

        <button type="button" onClick={() => void place()} disabled={!canTrade || state === 'placing'} className={'mt-3 flex min-h-12 w-full items-center justify-center gap-2 text-[9px] font-bold ' + (side === 'BUY' ? 'bg-shafx-success text-[#07110E]' : 'bg-shafx-danger text-white') + ' disabled:opacity-45'}>
          {state === 'placing'
            ? <><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> PLACING {side}…</>
            : !cTraderReady
              ? <><ArrowUpRight className="h-3.5 w-3.5" /> CONNECT cTRADER TO TRADE</>
              : !brokerQuoteReady
                ? <><LoaderCircle className="h-3.5 w-3.5" /> WAITING FOR cTRADER PRICE…</>
                : <><CheckCircle2 className="h-3.5 w-3.5" /> {connection?.environment === 'demo' ? 'CONFIRM PRACTICE ' : 'LIVE LOCKED '} {side}</>}
        </button>

        {connection?.environment !== 'demo' && <div className="mt-2 text-center text-[7px] uppercase tracking-[0.14em] text-shafx-warning">Live execution is deliberately locked until the SHAFX release gate passes.</div>}
      </div>
    )
  }

  return renderPlanningTicket()
}
