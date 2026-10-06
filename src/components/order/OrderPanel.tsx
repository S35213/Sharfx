import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  XCircle,
} from 'lucide-react'
import type { SymbolSpec, Timeframe, TradeOrder, TradePlanDraft, TradeSide } from '../../types'
import type { SetupCandidate } from '../../engine/setup/types'
import { calculateTradePlan } from '../../lib/tradePlanCalculator'
import { formatCurrency, formatPrice } from '../../lib/format'
import { buyDerivProposal, getDerivQuote, type DerivOrderConnection, type DerivProposalQuote } from '../../data/deriv/derivTrading'
import type { ChartAnnotation } from '../chart/CandlestickChart'

interface Props {
  symbol: string
  currentPrice: number
  bidPrice?: number
  askPrice?: number
  accountBalance: number
  accountCurrency: string
  symbolSpec: SymbolSpec
  timeframe: Timeframe
  connection: DerivOrderConnection | null
  activePosition?: TradeOrder | null
  onTradeOpened: (order: TradeOrder) => void
  onTradeClosed?: (id: string) => void | Promise<void>
  onTradeLinesChange?: (lines: ChartAnnotation[]) => void
  aiSetup?: SetupCandidate | null
}

type TicketState = 'planning' | 'quoting' | 'quoted' | 'buying' | 'error'

const MIN_STAKE = 1
const MAX_STAKE = 2000
const QUICK_STAKES = ['1.00', '5.00', '10.00', '20.00', '50.00', '100.00', '500.00', '2000.00']
const QUICK_MULTIPLIERS = ['100', '200', '300', '500', '800', '1000', '1500', '2000', '3000', '4000']
const STOP_LOSS_RATIOS = [0.1, 0.2, 0.4, 0.8]
const TAKE_PROFIT_MULTIPLES = [1, 2, 5, 10]
const DEFAULT_STOP_LOSS_RATIO = 0.2
const DEFAULT_TAKE_PROFIT_MULTIPLE = 5

const roundMoney = (value: number): number => Number(value.toFixed(2))

const formatLivePnl = (value: number, currency: string): string => {
  const absolute = Math.abs(value)
  const digits = absolute >= 1 ? 2 : absolute >= 0.1 ? 3 : 4
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

const getTradeAge = (openTime?: string, now = Date.now()): string => {
  if (!openTime) return '—'
  const opened = new Date(openTime).getTime()
  if (!Number.isFinite(opened)) return '—'
  const totalSeconds = Math.max(0, Math.floor((now - opened) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

const lineFor = (
  id: string,
  price: number | null | undefined,
  label: string,
  color: string,
  lineWidth: 1 | 2 = 1,
): ChartAnnotation | null => {
  if (!Number.isFinite(price) || Number(price) <= 0) return null
  return { id, price: Number(price), label, color, lineWidth }
}

const moneyLabel = (amount: number, currency: string): string => formatCurrency(roundMoney(amount), currency)

const protectionPrice = (entryPrice: number, amount: number, stake: number, multiplier: number, side: TradeSide, kind: 'sl' | 'tp'): number | null => {
  if (![entryPrice, amount, stake, multiplier].every(Number.isFinite) || entryPrice <= 0 || amount <= 0 || stake <= 0 || multiplier <= 0) return null
  const distance = (amount * entryPrice) / (multiplier * stake)
  if (!Number.isFinite(distance) || distance <= 0) return null
  if (kind === 'sl') return side === 'BUY' ? entryPrice - distance : entryPrice + distance
  return side === 'BUY' ? entryPrice + distance : entryPrice - distance
}

export const OrderPanel: React.FC<Props> = ({
  symbol,
  currentPrice,
  bidPrice = currentPrice,
  askPrice = currentPrice,
  accountBalance,
  accountCurrency,
  symbolSpec,
  timeframe,
  connection,
  activePosition = null,
  onTradeOpened,
  onTradeClosed,
  onTradeLinesChange,
  aiSetup,
}) => {
  const [side, setSide] = useState<TradeSide>(aiSetup?.direction ?? 'BUY')
  const [stake, setStake] = useState('1.00')
  const [multiplier, setMultiplier] = useState('100')
  const [stopLossEnabled, setStopLossEnabled] = useState(true)
  const [takeProfitEnabled, setTakeProfitEnabled] = useState(true)
  const [stopLossRatio, setStopLossRatio] = useState(DEFAULT_STOP_LOSS_RATIO)
  const [takeProfitMultiple, setTakeProfitMultiple] = useState(DEFAULT_TAKE_PROFIT_MULTIPLE)
  const [quote, setQuote] = useState<DerivProposalQuote | null>(null)
  const [state, setState] = useState<TicketState>('planning')
  const [error, setError] = useState('')
  const [now, setNow] = useState(0)
  const newTradeRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setSide(aiSetup?.direction ?? 'BUY')
    setQuote(null)
    setState('planning')
    setError('')
  }, [symbol, aiSetup?.direction])

  useEffect(() => {
    if (!activePosition) return
    setQuote(null)
    setState('planning')
    setError('')
  }, [activePosition?.providerOrderId])

  useEffect(() => {
    if (!activePosition?.openTime) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [activePosition?.openTime])

  const stakeValue = Number(stake)
  const multiplierValue = Number(multiplier)
  const stopLossAmount = stopLossEnabled && Number.isFinite(stakeValue) ? roundMoney(stakeValue * stopLossRatio) : 0
  const takeProfitAmount = takeProfitEnabled && Number.isFinite(stakeValue) ? roundMoney(stakeValue * takeProfitMultiple) : 0

  const entryPrice = side === 'BUY'
    ? (askPrice > 0 ? askPrice : currentPrice)
    : (bidPrice > 0 ? bidPrice : currentPrice)

  const stopLossPrice = useMemo(
    () => stopLossEnabled ? protectionPrice(entryPrice, stopLossAmount, stakeValue, multiplierValue, side, 'sl') : null,
    [entryPrice, multiplierValue, side, stakeValue, stopLossAmount, stopLossEnabled],
  )
  const takeProfitPrice = useMemo(
    () => takeProfitEnabled ? protectionPrice(entryPrice, takeProfitAmount, stakeValue, multiplierValue, side, 'tp') : null,
    [entryPrice, multiplierValue, side, stakeValue, takeProfitAmount, takeProfitEnabled],
  )

  const plan = useMemo<TradePlanDraft>(() => calculateTradePlan({
    accountBalance,
    entryPrice,
    slPrice: stopLossPrice,
    tpPrice: takeProfitPrice,
    stake: Number.isFinite(stakeValue) ? stakeValue : 0,
    multiplier: Number.isFinite(multiplierValue) ? multiplierValue : 0,
    symbolSpec,
    side,
  }), [accountBalance, entryPrice, multiplierValue, side, stakeValue, symbolSpec, takeProfitPrice, stopLossPrice])

  const draftLines = useMemo<ChartAnnotation[]>(() => {
    if (activePosition) {
      const entryColor = activePosition.type === 'BUY' ? '#22D3A5' : '#FF5C75'
      const entryLabel = activePosition.type === 'BUY' ? 'BUY ENTRY' : 'SELL ENTRY'
      return [
        lineFor(activePosition.id + '-entry', activePosition.entryPrice, entryLabel, entryColor, 2),
        lineFor(
          activePosition.id + '-sl',
          activePosition.plannedStopLossPrice,
          activePosition.stopLossAmount ? 'SL ' + moneyLabel(activePosition.stopLossAmount, accountCurrency) : 'SL',
          '#F6465D',
          1,
        ),
        lineFor(
          activePosition.id + '-tp',
          activePosition.plannedTakeProfitPrice,
          activePosition.takeProfitAmount ? 'TP ' + moneyLabel(activePosition.takeProfitAmount, accountCurrency) : 'TP',
          '#0ECB81',
          1,
        ),
      ].filter((line): line is ChartAnnotation => Boolean(line))
    }

    return [
      lineFor('plan-sl', plan.slPrice, 'SL ' + moneyLabel(stopLossAmount, accountCurrency), '#F6465D', 1),
      lineFor('plan-tp', plan.tpPrice, 'TP ' + moneyLabel(takeProfitAmount, accountCurrency), '#0ECB81', 1),
    ].filter((line): line is ChartAnnotation => Boolean(line))
  }, [activePosition, accountCurrency, plan.slPrice, plan.tpPrice, stopLossAmount, takeProfitAmount])

  useEffect(() => {
    onTradeLinesChange?.(draftLines)
  }, [draftLines, onTradeLinesChange])

  const marketMetrics = useMemo(() => {
    const validBid = Number.isFinite(bidPrice) && bidPrice > 0
    const validAsk = Number.isFinite(askPrice) && askPrice > 0
    const hasSpread = validBid && validAsk && Math.abs(askPrice - bidPrice) > 1e-12
    return {
      hasSpread,
      spreadPips: hasSpread ? Math.abs(askPrice - bidPrice) / symbolSpec.pipSize : null,
      bid: validBid ? bidPrice : null,
      ask: validAsk ? askPrice : null,
    }
  }, [askPrice, bidPrice, symbolSpec.pipSize])

  const resetQuote = (): void => {
    setQuote(null)
    setState('planning')
    setError('')
  }

  const chooseSide = (nextSide: TradeSide): void => {
    setSide(nextSide)
    resetQuote()
  }

  const chooseStake = (value: string): void => {
    setStake(value)
    resetQuote()
  }

  const chooseMultiplier = (value: string): void => {
    setMultiplier(value)
    resetQuote()
  }

  const requestQuote = async (): Promise<void> => {
    if (!connection) {
      setError('Connect a Deriv demo account before trading.')
      setState('error')
      return
    }
    if (plan.validationError) {
      setError(plan.validationError)
      setState('error')
      return
    }
    if (!Number.isFinite(stakeValue) || stakeValue < MIN_STAKE || stakeValue > MAX_STAKE) {
      setError('SHAFX stake must be between ' + formatCurrency(MIN_STAKE, accountCurrency) + ' and ' + formatCurrency(MAX_STAKE, accountCurrency) + '.')
      setState('error')
      return
    }

    setState('quoting')
    setQuote(null)
    setError('')
    try {
      const nextQuote = await getDerivQuote({
        connection,
        symbol,
        side,
        stake: stakeValue,
        currency: accountCurrency,
        multiplier: multiplierValue,
        stopLossAmount: stopLossAmount > 0 ? stopLossAmount : undefined,
        takeProfitAmount: takeProfitAmount > 0 ? takeProfitAmount : undefined,
      })
      setQuote(nextQuote)
      setState('quoted')
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : 'Unable to get a live Deriv proposal.')
    }
  }

  const confirmBuy = async (): Promise<void> => {
    if (!connection || !quote) return
    setState('buying')
    setError('')
    try {
      const order = await buyDerivProposal({ connection, quote })
      onTradeOpened({
        ...order,
        chartTimeframe: timeframe,
        plannedStopLossPrice: plan.slPrice,
        plannedTakeProfitPrice: plan.tpPrice,
      })
      setState('planning')
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : 'Unable to place the Deriv contract.')
    }
  }

  const startOppositeTrade = (): void => {
    if (!activePosition) return
    const opposite: TradeSide = activePosition.type === 'BUY' ? 'SELL' : 'BUY'
    chooseSide(opposite)
    window.setTimeout(() => newTradeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 0)
  }

  const handleClose = async (): Promise<void> => {
    if (!activePosition?.id || !onTradeClosed) return
    try {
      await onTradeClosed(activePosition.id)
      onTradeLinesChange?.([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to close the position.')
    }
  }

  if (activePosition) {
    const profit = Number(activePosition.profit ?? 0)
    const isProfit = profit >= 0
    const positionPrice = Number(activePosition.currentPrice ?? currentPrice)
    const slAmount = Number(activePosition.stopLossAmount ?? 0)
    const tpAmount = Number(activePosition.takeProfitAmount ?? 0)

    return (
      <div className="overflow-hidden border border-shafx-border bg-shafx-surface">
        <section className="overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-shafx-border px-3 py-2.5 sm:px-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">Position</span>
              <span className="font-mono text-[8px] text-shafx-success">LIVE</span>
            </div>
            <div className="mt-0.5 flex items-center gap-2 font-mono text-[8px] text-shafx-textMuted">
              <span>{symbol}</span>
              <span>•</span>
              <span>{activePosition.type === 'BUY' ? 'BUY UP' : 'SELL DOWN'}</span>
              <span>•</span>
              <span>{activePosition.providerOrderId || activePosition.id}</span>
            </div>
          </div>
          <div className={'text-right font-mono text-lg font-semibold tabular-nums ' + (isProfit ? 'text-shafx-success' : 'text-shafx-danger')}>
            {formatLivePnl(profit, accountCurrency)}
          </div>
        </header>

        <div className="divide-y divide-shafx-border">
          <div className="grid grid-cols-2 gap-x-4 px-3 py-2.5 sm:px-4">
            <div>
              <div className="text-[8px] uppercase tracking-[0.12em] text-shafx-textMuted">Entry</div>
              <div className="mt-0.5 font-mono text-sm tabular-nums">{formatPrice(activePosition.entryPrice, symbolSpec.pricePrecision)}</div>
            </div>
            <div className="text-right">
              <div className="text-[8px] uppercase tracking-[0.12em] text-shafx-textMuted">Current</div>
              <div className="mt-0.5 font-mono text-sm tabular-nums">{formatPrice(positionPrice, symbolSpec.pricePrecision)}</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 px-3 py-2.5 text-[9px] sm:px-4">
            <div>
              <span className="text-shafx-textMuted">Stake</span>
              <div className="mt-0.5 font-mono font-semibold">{formatCurrency(activePosition.stake ?? 0, accountCurrency)}</div>
            </div>
            <div>
              <span className="text-shafx-textMuted">Multiplier</span>
              <div className="mt-0.5 font-mono">{activePosition.multiplier ?? '—'}×</div>
            </div>
            <div>
              <span className="text-shafx-textMuted">Age</span>
              <div className="mt-0.5 flex items-center gap-1 font-mono"><Clock3 className="h-3 w-3 text-shafx-textMuted" />{getTradeAge(activePosition.openTime, now)}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 px-3 py-2.5 text-[9px] sm:px-4">
            <div>
              <span className="text-shafx-danger">Stop Loss</span>
              <div className="mt-0.5 font-mono">{slAmount > 0 ? formatCurrency(slAmount, accountCurrency) : 'None'}</div>
              {activePosition.plannedStopLossPrice && <div className="mt-0.5 font-mono text-[8px] text-shafx-textMuted">chart ≈ {formatPrice(activePosition.plannedStopLossPrice, symbolSpec.pricePrecision)}</div>}
            </div>
            <div className="text-right">
              <span className="text-shafx-success">Take Profit</span>
              <div className="mt-0.5 font-mono">{tpAmount > 0 ? formatCurrency(tpAmount, accountCurrency) : 'None'}</div>
              {activePosition.plannedTakeProfitPrice && <div className="mt-0.5 font-mono text-[8px] text-shafx-textMuted">chart ≈ {formatPrice(activePosition.plannedTakeProfitPrice, symbolSpec.pricePrecision)}</div>}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
            <div className="max-w-[68%] text-[8px] leading-4 text-shafx-textMuted">
              Broker-managed protection stays active if you close SHAFX.
              <span className="ml-1 font-mono text-shafx-text">#{activePosition.providerOrderId || activePosition.id}</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={startOppositeTrade} className="min-h-9 border border-shafx-accent/35 bg-shafx-accent/[0.06] px-2.5 text-[8px] font-semibold text-shafx-accent transition hover:bg-shafx-accent/[0.1]">
                TRADE AGAINST • {activePosition.type === 'BUY' ? 'SELL DOWN' : 'BUY UP'}
              </button>
              <button type="button" onClick={() => void handleClose()} className="inline-flex min-h-9 items-center gap-1.5 border border-shafx-danger/40 bg-shafx-danger/10 px-3 text-[8px] font-semibold text-shafx-danger transition hover:bg-shafx-danger/20">
                <XCircle className="h-3.5 w-3.5" /> CLOSE
              </button>
            </div>
          </div>
        </div>
      </section>

      <div ref={newTradeRef} className="border-t border-shafx-border bg-[#080D13]">
        <div className="border-b border-shafx-border px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-shafx-textMuted">New trade</span>
            <span className="font-mono text-[8px] text-shafx-textMuted">{symbol} • {timeframe}</span>
          </div>
          {activePosition && side !== activePosition.type && (
            <div className="mt-2 border border-shafx-accent/25 bg-shafx-accent/[0.05] px-2.5 py-2 text-[8px] text-shafx-accent">
              <strong className="font-semibold">TRADE AGAINST READY.</strong> Current {activePosition.type} remains open; this ticket is set to {side === 'BUY' ? 'BUY UP' : 'SELL DOWN'}.
            </div>
          )}
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <button type="button" onClick={() => chooseSide('BUY')} disabled={state === 'quoting' || state === 'buying'} aria-pressed={side === 'BUY'} className={'min-h-11 border px-2.5 text-left ' + (side === 'BUY' ? 'border-shafx-success bg-shafx-success/[0.12]' : 'border-shafx-border bg-shafx-surface')}>
              <span className={'text-[9px] font-bold ' + (side === 'BUY' ? 'text-shafx-success' : 'text-shafx-textMuted')}>BUY</span>
              <span className="ml-1.5 text-[7px] text-shafx-textMuted">ASK {marketMetrics.ask ? formatPrice(marketMetrics.ask, symbolSpec.pricePrecision) : '—'}</span>
            </button>
            <button type="button" onClick={() => chooseSide('SELL')} disabled={state === 'quoting' || state === 'buying'} aria-pressed={side === 'SELL'} className={'min-h-11 border px-2.5 text-left ' + (side === 'SELL' ? 'border-shafx-danger bg-shafx-danger/[0.12]' : 'border-shafx-border bg-shafx-surface')}>
              <span className={'text-[9px] font-bold ' + (side === 'SELL' ? 'text-shafx-danger' : 'text-shafx-textMuted')}>SELL</span>
              <span className="ml-1.5 text-[7px] text-shafx-textMuted">BID {marketMetrics.bid ? formatPrice(marketMetrics.bid, symbolSpec.pricePrecision) : '—'}</span>
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="border border-shafx-border bg-shafx-surface px-2 py-2">
              <span className="block text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Stake</span>
              <span className="mt-1 flex items-center gap-1"><span className="font-mono text-[7px] text-shafx-textMuted">{accountCurrency}</span><input aria-label="Stake" type="number" min={MIN_STAKE} step="1" value={stake} onChange={(e) => chooseStake(e.target.value)} className="min-w-0 flex-1 bg-transparent font-mono text-[10px] outline-none" /></span>
            </label>
            <label className="border border-shafx-border bg-shafx-surface px-2 py-2">
              <span className="block text-[7px] uppercase tracking-[0.12em] text-shafx-textMuted">Multiplier</span>
              <select aria-label="Multiplier" value={multiplier} onChange={(e) => chooseMultiplier(e.target.value)} className="mt-1 w-full bg-transparent font-mono text-[10px] outline-none">
                {QUICK_MULTIPLIERS.map((value) => <option key={value} value={value}>{value}×</option>)}
              </select>
            </label>
          </div>
        </div>

        {quote ? (
          <div className="px-3 py-2.5">
            <div className="flex items-center justify-between border border-shafx-border bg-shafx-surface px-2.5 py-2 text-[8px]">
              <span className="font-semibold">LIVE {side} QUOTE</span>
              <span className="font-mono text-shafx-textMuted">{formatCurrency(Number(quote.stake), accountCurrency)} • {quote.multiplier}×</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[8px]">
              <div><span className="text-shafx-textMuted">Protection SL</span><div className="mt-0.5 font-mono text-shafx-danger">{quote.stopLossAmount ? formatCurrency(quote.stopLossAmount, accountCurrency) : 'None'}</div></div>
              <div className="text-right"><span className="text-shafx-textMuted">Protection TP</span><div className="mt-0.5 font-mono text-shafx-success">{quote.takeProfitAmount ? formatCurrency(quote.takeProfitAmount, accountCurrency) : 'None'}</div></div>
            </div>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => void confirmBuy()} disabled={state === 'quoting' || state === 'buying'} className={'flex min-h-10 flex-1 items-center justify-center text-[9px] font-bold ' + (side === 'BUY' ? 'bg-shafx-success text-[#07110E]' : 'bg-shafx-danger text-white')}>{side}</button>
              <button type="button" onClick={resetQuote} disabled={false} className="min-h-10 border border-shafx-border px-3 text-[8px] text-shafx-textMuted">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="px-3 py-2.5">
            <button type="button" onClick={() => void requestQuote()} disabled={state === 'quoting' || state === 'buying' || !connection || Boolean(plan.validationError)} className={'flex min-h-11 w-full items-center justify-center gap-2 text-[9px] font-bold ' + (side === 'BUY' ? 'bg-shafx-success text-[#07110E]' : 'bg-shafx-danger text-white')}>
              {state === 'buying' ? 'PLACING ' + side + '…' : 'GET LIVE ' + side + ' QUOTE'} <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        </div>
      </div>
    )
  }

  const quotePotentialProfit = quote?.potentialProfit
  const quoteCommission = Number(quote?.commission ?? 0)
  const quoteProtectionSL = Number(quote?.stopLossAmount ?? (stopLossEnabled ? stopLossAmount : 0))
  const quoteProtectionTP = Number(quote?.takeProfitAmount ?? (takeProfitEnabled ? takeProfitAmount : 0))
  const busy = state === 'quoting' || state === 'buying'

  return (
    <section className="overflow-hidden border border-shafx-border bg-shafx-surface">
      <header className="border-b border-shafx-border px-3 py-2.5 sm:px-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em]">Trade Ticket</div>
            <div className="mt-0.5 font-mono text-[8px] text-shafx-textMuted">{symbol} · {timeframe} · DERIV MULTIPLIER</div>
          </div>
          <div className="text-right">
            <div className={'font-mono text-[8px] font-semibold ' + (connection ? 'text-shafx-success' : 'text-shafx-danger')}>{connection ? 'DEMO CONNECTED' : 'OFFLINE'}</div>
            <div className="font-mono text-[8px] text-shafx-textMuted">{accountCurrency} {Number.isFinite(accountBalance) ? accountBalance.toFixed(2) : '0.00'}</div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => chooseSide('BUY')}
            disabled={busy}
            aria-pressed={side === 'BUY'}
            className={'min-h-14 border px-3 py-2 text-left transition ' + (side === 'BUY'
              ? 'border-shafx-success bg-shafx-success/[0.12] shadow-[inset_0_0_0_1px_rgba(34,211,165,.18)]'
              : 'border-shafx-border bg-shafx-surface hover:border-shafx-success/40 hover:bg-shafx-bg')}
          >
            <span className="flex items-center justify-between gap-2">
              <span className={'flex items-center gap-1.5 text-[10px] font-bold tracking-wide ' + (side === 'BUY' ? 'text-shafx-success' : 'text-shafx-textMuted')}><ArrowUpRight className="h-3.5 w-3.5" />BUY</span>
              {side === 'BUY' && <span className="text-[7px] font-semibold uppercase tracking-[0.12em] text-shafx-success">Selected</span>}
            </span>
            <span className="mt-1 block text-[8px] text-shafx-textMuted">UP • ASK {marketMetrics.ask ? formatPrice(marketMetrics.ask, symbolSpec.pricePrecision) : '—'}</span>
          </button>
          <button
            type="button"
            onClick={() => chooseSide('SELL')}
            disabled={busy}
            aria-pressed={side === 'SELL'}
            className={'min-h-14 border px-3 py-2 text-left transition ' + (side === 'SELL'
              ? 'border-shafx-danger bg-shafx-danger/[0.12] shadow-[inset_0_0_0_1px_rgba(255,92,117,.18)]'
              : 'border-shafx-border bg-shafx-surface hover:border-shafx-danger/40 hover:bg-shafx-bg')}
          >
            <span className="flex items-center justify-between gap-2">
              <span className={'flex items-center gap-1.5 text-[10px] font-bold tracking-wide ' + (side === 'SELL' ? 'text-shafx-danger' : 'text-shafx-textMuted')}><ArrowDownRight className="h-3.5 w-3.5" />SELL</span>
              {side === 'SELL' && <span className="text-[7px] font-semibold uppercase tracking-[0.12em] text-shafx-danger">Selected</span>}
            </span>
            <span className="mt-1 block text-[8px] text-shafx-textMuted">DOWN • BID {marketMetrics.bid ? formatPrice(marketMetrics.bid, symbolSpec.pricePrecision) : '—'}</span>
          </button>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2 border-t border-shafx-border pt-2 font-mono text-[8px]">
          <div><span className="text-shafx-textMuted">ENTRY</span><span className={'ml-1.5 font-semibold ' + (side === 'BUY' ? 'text-shafx-success' : 'text-shafx-danger')}>{formatPrice(entryPrice, symbolSpec.pricePrecision)}</span></div>
          <div className="text-center"><span className="text-shafx-textMuted">BID</span><span className="ml-1.5 text-shafx-danger">{marketMetrics.bid ? formatPrice(marketMetrics.bid, symbolSpec.pricePrecision) : '—'}</span></div>
          <div className="text-right"><span className="text-shafx-textMuted">ASK</span><span className="ml-1.5 text-shafx-success">{marketMetrics.ask ? formatPrice(marketMetrics.ask, symbolSpec.pricePrecision) : '—'}</span></div>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[8px] text-shafx-textMuted">
          <span>MARKET {formatPrice(currentPrice, symbolSpec.pricePrecision)}</span>
          {marketMetrics.hasSpread ? <span>{marketMetrics.spreadPips?.toFixed(1)} pips spread</span> : <span>Deriv market price</span>}
        </div>
      </header>

      <div className="divide-y divide-shafx-border">
        <div className="grid grid-cols-2 gap-px bg-shafx-border">
          <label className="bg-shafx-surface px-3 py-2.5">
            <span className="block text-[8px] uppercase tracking-[0.12em] text-shafx-textMuted">Stake</span>
            <div className="mt-1 flex items-center gap-1">
              <span className="font-mono text-[8px] text-shafx-textMuted">{accountCurrency}</span>
              <input
                aria-label="Stake"
                type="number"
                min={MIN_STAKE}
                max={MAX_STAKE}
                step="1"
                value={stake}
                onChange={(e) => chooseStake(e.target.value)}
                onBlur={() => { const value = Number(stake); if (!Number.isFinite(value) || value < MIN_STAKE) chooseStake(MIN_STAKE.toFixed(2)); else if (value > MAX_STAKE) chooseStake(MAX_STAKE.toFixed(2)) }}
                className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none"
              />
            </div>
            <div className="mt-1 text-[7px] text-shafx-textMuted">Range 1 – 2,000 {accountCurrency}</div>
            <div className="mt-1 flex gap-1 overflow-x-auto">
              {QUICK_STAKES.map((value) => (
                <button key={value} type="button" onClick={() => chooseStake(value)} disabled={Number(value) > accountBalance} className={'flex-1 border px-1.5 py-1 font-mono text-[7px] ' + (stake === value ? 'border-shafx-primary/40 bg-shafx-primary/10 text-shafx-primary' : 'border-shafx-border text-shafx-textMuted disabled:opacity-40')}>
                  {value}
                </button>
              ))}
            </div>
          </label>

          <label className="bg-shafx-surface px-3 py-2.5">
            <span className="block text-[8px] uppercase tracking-[0.12em] text-shafx-textMuted">Multiplier</span>
            <div className="mt-1 flex items-center">
              <input aria-label="Multiplier" type="number" min="1" max="4000" step="1" value={multiplier} onChange={(e) => chooseMultiplier(e.target.value)} className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none" />
              <span className="font-mono text-[10px] text-shafx-textMuted">×</span>
            </div>
            <div className="mt-1 flex gap-1 overflow-x-auto">
              {QUICK_MULTIPLIERS.map((value) => (
                <button key={value} type="button" onClick={() => chooseMultiplier(value)} className={'flex-1 border px-1.5 py-1 font-mono text-[7px] ' + (multiplier === value ? 'border-shafx-primary/40 bg-shafx-primary/10 text-shafx-primary' : 'border-shafx-border text-shafx-textMuted')}>
                  {value}
                </button>
              ))}
            </div>
          </label>
        </div>

        <div className="px-3 py-2.5 sm:px-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <span className="text-[9px] font-semibold uppercase tracking-[0.14em]">Auto Exits</span>
              <span className="ml-2 font-mono text-[7px] text-shafx-textMuted">OPTIONAL · RECOMMENDED</span>
            </div>
            <span className="font-mono text-[7px] text-shafx-textMuted">{stopLossEnabled ? moneyLabel(stopLossAmount, accountCurrency) + ' SL' : 'SL OFF'} · {takeProfitEnabled ? moneyLabel(takeProfitAmount, accountCurrency) + ' TP' : 'TP OFF'}</span>
          </div>

          <div className="mb-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { setStopLossEnabled((value) => !value); resetQuote() }}
              className={'flex min-h-8 items-center justify-between border px-2 font-mono text-[8px] ' + (stopLossEnabled ? 'border-shafx-danger/40 bg-shafx-danger/10 text-shafx-danger' : 'border-shafx-border text-shafx-textMuted')}
            >
              <span>STOP LOSS</span><span>{stopLossEnabled ? 'ON' : 'OFF'}</span>
            </button>
            <button
              type="button"
              onClick={() => { setTakeProfitEnabled((value) => !value); resetQuote() }}
              className={'flex min-h-8 items-center justify-between border px-2 font-mono text-[8px] ' + (takeProfitEnabled ? 'border-shafx-success/40 bg-shafx-success/10 text-shafx-success' : 'border-shafx-border text-shafx-textMuted')}
            >
              <span>TAKE PROFIT</span><span>{takeProfitEnabled ? 'ON' : 'OFF'}</span>
            </button>
          </div>

          <div className="space-y-3 text-[8px]">
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-semibold text-shafx-danger">Stop Loss</span>
                <span className="font-mono text-shafx-danger">{stopLossEnabled ? moneyLabel(stopLossAmount, accountCurrency) : 'None'}</span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {STOP_LOSS_RATIOS.map((ratio) => {
                  const amount = roundMoney(stakeValue * ratio)
                  return (
                    <button key={ratio} type="button" onClick={() => { setStopLossEnabled(true); setStopLossRatio(ratio); resetQuote() }} disabled={!stopLossEnabled || !Number.isFinite(stakeValue) || stakeValue <= 0} className={'border px-1.5 py-1.5 font-mono text-[7px] ' + (stopLossRatio === ratio && stopLossEnabled ? 'border-shafx-danger/45 bg-shafx-danger/10 text-shafx-danger' : 'border-shafx-border text-shafx-textMuted') + ' disabled:opacity-40'}>
                      {Math.round(ratio * 100)}% · {moneyLabel(amount, accountCurrency)}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-semibold text-shafx-success">Take Profit</span>
                <span className="font-mono text-shafx-success">{takeProfitEnabled ? moneyLabel(takeProfitAmount, accountCurrency) : 'None'}</span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {TAKE_PROFIT_MULTIPLES.map((multiple) => {
                  const amount = roundMoney(stakeValue * multiple)
                  return (
                    <button key={multiple} type="button" onClick={() => { setTakeProfitEnabled(true); setTakeProfitMultiple(multiple); resetQuote() }} disabled={!takeProfitEnabled || !Number.isFinite(stakeValue) || stakeValue <= 0} className={'border px-1.5 py-1.5 font-mono text-[7px] ' + (takeProfitMultiple === multiple && takeProfitEnabled ? 'border-shafx-success/45 bg-shafx-success/10 text-shafx-success' : 'border-shafx-border text-shafx-textMuted') + ' disabled:opacity-40'}>
                      {multiple}× · {moneyLabel(amount, accountCurrency)}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 text-[8px]">
            <div className="border-t border-shafx-border pt-2">
              <div className="text-shafx-textMuted">Chart SL ≈</div>
              <div className="mt-0.5 font-mono text-shafx-danger">{plan.slPrice !== null ? formatPrice(plan.slPrice, symbolSpec.pricePrecision) : '—'} <span className="text-[7px] text-shafx-textMuted">· {plan.slDistancePips !== null ? plan.slDistancePips.toFixed(1) + ' pips' : '—'}</span></div>
            </div>
            <div className="border-t border-shafx-border pt-2 text-right">
              <div className="text-shafx-textMuted">Chart TP ≈</div>
              <div className="mt-0.5 font-mono text-shafx-success">{plan.tpPrice !== null ? formatPrice(plan.tpPrice, symbolSpec.pricePrecision) : '—'} <span className="text-[7px] text-shafx-textMuted">· {plan.tpDistancePips !== null ? plan.tpDistancePips.toFixed(1) + ' pips' : '—'}</span></div>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-shafx-border pt-2 text-[8px]">
            <span className="text-shafx-textMuted">Risk / Reward</span>
            <span className="font-mono font-semibold">{plan.estimatedRiskRewardRatio !== null ? '1:' + plan.estimatedRiskRewardRatio.toFixed(2) : '—'}</span>
          </div>

          <div className="mt-2 text-[7px] leading-4 text-shafx-textMuted">
            SL and TP are optional. When enabled they are monetary targets that scale with the stake. When disabled, SHAFX sends no corresponding limit_order protection to Deriv; the contract remains open until you close it or Deriv stops it automatically.
          </div>
        </div>

        {(plan.validationError || state === 'error') && (
          <div className="px-3 py-2.5">
            <div className="flex items-start gap-2 border border-shafx-danger/25 bg-shafx-danger/10 px-2.5 py-2 text-[8px] leading-4 text-shafx-danger">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>{error || plan.validationError}</span>
            </div>
          </div>
        )}

        {state === 'quoting' && (
          <div className="flex items-center gap-2 px-3 py-2.5 text-[8px] text-shafx-textMuted">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin text-shafx-primary" /> Requesting live Deriv proposal…
          </div>
        )}

        {quote && state === 'quoted' && (
          <div className="px-3 py-2.5">
            <div className="border border-shafx-primary/25 bg-shafx-primary/[.04] p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[8px] font-semibold uppercase tracking-[0.14em]">Deriv proposal</div>
                  <div className="mt-0.5 font-mono text-[7px] text-shafx-textMuted">{quote.contractType} · {quote.multiplier}× · {formatCurrency(quote.stake, accountCurrency)}</div>
                </div>
                <div className="font-mono text-[8px] text-shafx-textMuted">Price refreshes on confirm</div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[8px]">
                <span className="text-shafx-textMuted">Stake</span><span className="text-right font-mono">{formatCurrency(quote.stake, accountCurrency)}</span>
                <span className="text-shafx-textMuted">Multiplier</span><span className="text-right font-mono">{quote.multiplier}×</span>
                <span className="font-semibold text-shafx-danger">Stop Loss</span><span className="text-right font-mono font-semibold text-shafx-danger">{quoteProtectionSL > 0 ? formatCurrency(quoteProtectionSL, accountCurrency) : 'None'}</span>
                <span className="font-semibold text-shafx-success">Take Profit</span><span className="text-right font-mono font-semibold text-shafx-success">{quoteProtectionTP > 0 ? formatCurrency(quoteProtectionTP, accountCurrency) : 'None'}</span>
                <span className="text-shafx-textMuted">Commission</span><span className="text-right font-mono">{quoteCommission > 0 ? formatCurrency(quoteCommission, accountCurrency) : '—'}</span>
                <span className="text-shafx-textMuted">Potential result*</span><span className="text-right font-mono text-shafx-success">{quotePotentialProfit !== undefined ? (quotePotentialProfit >= 0 ? '+' : '') + formatCurrency(quotePotentialProfit, accountCurrency) : '—'}</span>
              </div>

              <div className="mt-2 text-[7px] leading-4 text-shafx-textMuted">
                Protection is attached to the Deriv contract. *Potential result is the proposal payout result, not the selected TP target.
              </div>

              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => void confirmBuy()} disabled={false} className={'flex min-h-11 flex-1 items-center justify-center gap-2 px-3 text-[9px] font-semibold disabled:opacity-60 ' + (side === 'BUY' ? 'bg-shafx-success text-[#07110E] hover:bg-shafx-success/90' : 'bg-shafx-danger text-white hover:bg-shafx-danger/90')}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> {side === 'BUY' ? 'BUY' : 'SELL'}
                </button>
                <button type="button" onClick={resetQuote} disabled={busy} className="min-h-10 border border-shafx-border px-3 text-[8px] font-semibold text-shafx-textMuted disabled:opacity-50">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {state !== 'quoted' && (
          <div className="px-3 py-2.5">
            <button type="button" onClick={() => void requestQuote()} disabled={state === 'quoting' || state === 'buying' || !connection || Boolean(plan.validationError)} className={'flex min-h-11 w-full items-center justify-center gap-2 text-[9px] font-bold disabled:opacity-50 ' + (side === 'BUY' ? 'bg-shafx-success text-[#07110E] hover:bg-shafx-success/90' : 'bg-shafx-danger text-white hover:bg-shafx-danger/90')}>
              {state === 'buying' ? <><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> PLACING {side}…</> : <>GET LIVE {side} QUOTE <ArrowUpRight className="h-3.5 w-3.5" /></>}
            </button>
          </div>
        )}

        <div className="border-t border-shafx-border px-3 py-2 text-[7px] leading-4 text-shafx-textMuted sm:px-4">
          Broker-managed SL/TP remains active even if you close SHAFX. The contract continues at Deriv until it reaches an automatic exit or you close it manually.
        </div>
      </div>
    </section>
  )
}
