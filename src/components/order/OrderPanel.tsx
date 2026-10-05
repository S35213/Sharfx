import React, { useEffect, useMemo, useState } from 'react'
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

const MIN_SHAFX_STAKE = 10
const QUICK_STAKES = ['10.00', '25.00', '50.00', '100.00']
const QUICK_MULTIPLIERS = ['100', '200', '300', '500', '800']

const toNumberOrNull = (value: string): number | null => {
  const parsed = Number(value)
  return value.trim() !== '' && Number.isFinite(parsed) ? parsed : null
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

const lineFor = (id: string, price: number | null | undefined, label: string, color: string, lineWidth: 1 | 2 = 1): ChartAnnotation | null => {
  if (!Number.isFinite(price) || Number(price) <= 0) return null
  return { id, price: Number(price), label, color, lineWidth }
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
  const [stake, setStake] = useState('10.00')
  const [multiplier, setMultiplier] = useState('100')
  const [slPrice, setSlPrice] = useState('')
  const [tpPrice, setTpPrice] = useState('')
  const [quote, setQuote] = useState<DerivProposalQuote | null>(null)
  const [state, setState] = useState<TicketState>('planning')
  const [error, setError] = useState('')
  const [now, setNow] = useState(0)

  useEffect(() => {
    setSide(aiSetup?.direction ?? 'BUY')
    setSlPrice(aiSetup?.stopLoss ? String(aiSetup.stopLoss) : '')
    setTpPrice(aiSetup?.takeProfit ? String(aiSetup.takeProfit) : '')
    setQuote(null)
    setState('planning')
    setError('')
  }, [symbol, aiSetup?.direction, aiSetup?.stopLoss, aiSetup?.takeProfit])

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
  const entryPrice = side === 'BUY'
    ? (askPrice > 0 ? askPrice : currentPrice)
    : (bidPrice > 0 ? bidPrice : currentPrice)
  const plan = useMemo<TradePlanDraft>(() => calculateTradePlan({
    accountBalance,
    entryPrice,
    slPrice: toNumberOrNull(slPrice),
    tpPrice: toNumberOrNull(tpPrice),
    stake: Number.isFinite(stakeValue) ? stakeValue : 0,
    multiplier: Number.isFinite(multiplierValue) ? multiplierValue : 0,
    symbolSpec,
    side,
  }), [accountBalance, entryPrice, slPrice, tpPrice, stakeValue, multiplierValue, symbolSpec, side])

  const draftLines = useMemo<ChartAnnotation[]>(() => {
    if (activePosition) {
      return [
        lineFor(activePosition.id + '-entry', activePosition.entryPrice, 'ENTRY', '#2962FF', 2),
        lineFor(activePosition.id + '-sl', activePosition.plannedStopLossPrice, 'SL', '#F6465D', 1),
        lineFor(activePosition.id + '-tp', activePosition.plannedTakeProfitPrice, 'TP', '#0ECB81', 1),
      ].filter((line): line is ChartAnnotation => Boolean(line))
    }
    return [
      lineFor('plan-entry', entryPrice, 'ENTRY', '#2962FF', 2),
      lineFor('plan-sl', plan.slPrice, 'SL', '#F6465D', 1),
      lineFor('plan-tp', plan.tpPrice, 'TP', '#0ECB81', 1),
    ].filter((line): line is ChartAnnotation => Boolean(line))
  }, [activePosition, entryPrice, plan.slPrice, plan.tpPrice])

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
    if (!Number.isFinite(stakeValue) || stakeValue < MIN_SHAFX_STAKE) {
      setError('SHAFX minimum multiplier stake is 10 ' + accountCurrency + '.')
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
        stopLossAmount: plan.estimatedSlAmount ?? undefined,
        takeProfitAmount: plan.estimatedTpAmount ?? undefined,
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
      <section className="overflow-hidden border border-shafx-border bg-shafx-surface">
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
            {isProfit ? '+' : ''}{formatCurrency(profit, accountCurrency)}
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
            <div><span className="text-shafx-textMuted">Stake</span><div className="mt-0.5 font-mono">{formatCurrency(activePosition.stake ?? 0, accountCurrency)}</div></div>
            <div><span className="text-shafx-textMuted">Multiplier</span><div className="mt-0.5 font-mono">{activePosition.multiplier ?? '—'}×</div></div>
            <div><span className="text-shafx-textMuted">Age</span><div className="mt-0.5 flex items-center gap-1 font-mono"><Clock3 className="h-3 w-3 text-shafx-textMuted" />{getTradeAge(activePosition.openTime, now)}</div></div>
          </div>

          <div className="grid grid-cols-2 gap-3 px-3 py-2.5 text-[9px] sm:px-4">
            <div>
              <span className="text-shafx-danger">Stop Loss</span>
              <div className="mt-0.5 font-mono">{slAmount > 0 ? formatCurrency(slAmount, accountCurrency) : 'None'}</div>
              {activePosition.plannedStopLossPrice && <div className="mt-0.5 font-mono text-[8px] text-shafx-textMuted">{formatPrice(activePosition.plannedStopLossPrice, symbolSpec.pricePrecision)}</div>}
            </div>
            <div className="text-right">
              <span className="text-shafx-success">Take Profit</span>
              <div className="mt-0.5 font-mono">{tpAmount > 0 ? formatCurrency(tpAmount, accountCurrency) : 'None'}</div>
              {activePosition.plannedTakeProfitPrice && <div className="mt-0.5 font-mono text-[8px] text-shafx-textMuted">{formatPrice(activePosition.plannedTakeProfitPrice, symbolSpec.pricePrecision)}</div>}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
            <div className="text-[8px] text-shafx-textMuted">Contract ID · <span className="font-mono text-shafx-text">{activePosition.providerOrderId || activePosition.id}</span></div>
            <button type="button" onClick={() => void handleClose()} className="inline-flex min-h-9 items-center gap-1.5 border border-shafx-danger/40 bg-shafx-danger/10 px-3 text-[9px] font-semibold text-shafx-danger transition hover:bg-shafx-danger/20">
              <XCircle className="h-3.5 w-3.5" /> CLOSE
            </button>
          </div>
        </div>
      </section>
    )
  }

  const quotePotentialProfit = quote?.potentialProfit
  const quoteCommission = Number(quote?.commission ?? 0)
  const quoteProtectionSL = Number(quote?.stopLossAmount ?? plan.estimatedSlAmount ?? 0)
  const quoteProtectionTP = Number(quote?.takeProfitAmount ?? plan.estimatedTpAmount ?? 0)
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

        <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden border border-shafx-border bg-shafx-border">
          <button type="button" onClick={() => chooseSide('BUY')} disabled={busy} className={'min-h-12 bg-shafx-surface px-3 py-2 text-left transition ' + (side === 'BUY' ? 'ring-1 ring-inset ring-shafx-success/70' : 'hover:bg-shafx-bg')}>
            <span className="flex items-center gap-1.5 text-[9px] font-semibold text-shafx-success"><ArrowUpRight className="h-3.5 w-3.5" />BUY UP</span>
            <span className="mt-1 block font-mono text-sm tabular-nums">{formatPrice(entryPrice, symbolSpec.pricePrecision)}</span>
          </button>
          <button type="button" onClick={() => chooseSide('SELL')} disabled={busy} className={'min-h-12 bg-shafx-surface px-3 py-2 text-left transition ' + (side === 'SELL' ? 'ring-1 ring-inset ring-shafx-danger/70' : 'hover:bg-shafx-bg')}>
            <span className="flex items-center gap-1.5 text-[9px] font-semibold text-shafx-danger"><ArrowDownRight className="h-3.5 w-3.5" />SELL DOWN</span>
            <span className="mt-1 block font-mono text-sm tabular-nums">{formatPrice(entryPrice, symbolSpec.pricePrecision)}</span>
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 font-mono text-[8px] text-shafx-textMuted">
          <span>MARKET {formatPrice(currentPrice, symbolSpec.pricePrecision)}</span>
          {marketMetrics.hasSpread
            ? <span>BID {formatPrice(marketMetrics.bid ?? 0, symbolSpec.pricePrecision)} · ASK {formatPrice(marketMetrics.ask ?? 0, symbolSpec.pricePrecision)} · {marketMetrics.spreadPips?.toFixed(1)} pips</span>
            : <span>SPREAD — · Deriv public feed provides one market price here</span>}
        </div>
      </header>

      <div className="divide-y divide-shafx-border">
        <div className="grid grid-cols-2 gap-px bg-shafx-border">
          <label className="bg-shafx-surface px-3 py-2.5">
            <span className="block text-[8px] uppercase tracking-[0.12em] text-shafx-textMuted">Stake</span>
            <div className="mt-1 flex items-center gap-1">
              <span className="font-mono text-[8px] text-shafx-textMuted">{accountCurrency}</span>
              <input aria-label="Stake" type="number" min={MIN_SHAFX_STAKE} step="0.01" value={stake} onChange={(e) => chooseStake(e.target.value)} className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none" />
            </div>
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
              <input aria-label="Multiplier" type="number" min="1" max="10000" step="1" value={multiplier} onChange={(e) => chooseMultiplier(e.target.value)} className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none" />
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
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em]">Trade Plan</span>
            <span className="font-mono text-[7px] text-shafx-textMuted">Pips = chart distance</span>
          </div>

          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-2 text-[9px]">
            <span className="text-shafx-textMuted">Entry</span>
            <span className="font-mono tabular-nums">{formatPrice(entryPrice, symbolSpec.pricePrecision)}</span>
            <span className="text-[7px] uppercase text-shafx-textMuted">market</span>

            <label className="contents">
              <span className="text-shafx-danger">Stop Loss</span>
              <input aria-label="Stop Loss price" type="number" step={symbolSpec.pipSize} value={slPrice} onChange={(e) => { setSlPrice(e.target.value); resetQuote() }} placeholder="—" className="w-28 border border-shafx-border bg-shafx-bg px-2 py-1.5 text-right font-mono text-[10px] outline-none focus:border-shafx-primary" />
              <span className="text-right font-mono text-[7px] text-shafx-textMuted">{plan.slDistancePips !== null ? plan.slDistancePips.toFixed(1) + ' pips' : 'none'}</span>
            </label>

            <label className="contents">
              <span className="text-shafx-success">Take Profit</span>
              <input aria-label="Take Profit price" type="number" step={symbolSpec.pipSize} value={tpPrice} onChange={(e) => { setTpPrice(e.target.value); resetQuote() }} placeholder="—" className="w-28 border border-shafx-border bg-shafx-bg px-2 py-1.5 text-right font-mono text-[10px] outline-none focus:border-shafx-primary" />
              <span className="text-right font-mono text-[7px] text-shafx-textMuted">{plan.tpDistancePips !== null ? plan.tpDistancePips.toFixed(1) + ' pips' : 'none'}</span>
            </label>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 text-[8px]">
            <div className="border-t border-shafx-border pt-2">
              <div className="text-shafx-textMuted">Estimated SL exposure</div>
              <div className="mt-0.5 font-mono text-shafx-danger">{plan.estimatedSlAmount !== null ? formatCurrency(plan.estimatedSlAmount, accountCurrency) : '—'} {plan.estimatedSlAmount !== null ? '(' + plan.estimatedRiskPercent.toFixed(2) + '% balance)' : ''}</div>
            </div>
            <div className="border-t border-shafx-border pt-2 text-right">
              <div className="text-shafx-textMuted">Estimated TP target</div>
              <div className="mt-0.5 font-mono text-shafx-success">{plan.estimatedTpAmount !== null ? formatCurrency(plan.estimatedTpAmount, accountCurrency) : '—'} {plan.estimatedRiskRewardRatio !== null ? '(1:' + plan.estimatedRiskRewardRatio.toFixed(2) + ')' : ''}</div>
            </div>
          </div>

          <div className="mt-2 text-[7px] leading-4 text-shafx-textMuted">
            These protection amounts are estimates derived from price distance, stake, and multiplier. Deriv is authoritative for the contract; the proposal/contract response wins over frontend arithmetic.
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
                <span className="text-shafx-textMuted">Proposal stake</span><span className="text-right font-mono">{formatCurrency(quote.stake, accountCurrency)}</span>
                <span className="text-shafx-textMuted">Commission</span><span className="text-right font-mono">{quoteCommission > 0 ? formatCurrency(quoteCommission, accountCurrency) : '—'}</span>
                <span className="text-shafx-textMuted">Potential result*</span><span className="text-right font-mono text-shafx-success">{quotePotentialProfit !== undefined ? (quotePotentialProfit >= 0 ? '+' : '') + formatCurrency(quotePotentialProfit, accountCurrency) : '—'}</span>
                <span className="text-shafx-textMuted">SL request</span><span className="text-right font-mono text-shafx-danger">{quoteProtectionSL > 0 ? formatCurrency(quoteProtectionSL, accountCurrency) : 'None'}</span>
                <span className="text-shafx-textMuted">TP request</span><span className="text-right font-mono text-shafx-success">{quoteProtectionTP > 0 ? formatCurrency(quoteProtectionTP, accountCurrency) : 'None'}</span>
              </div>

              <div className="mt-2 text-[7px] leading-4 text-shafx-textMuted">*Potential result is the proposal's payout result, not the selected TP target.</div>

              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => void confirmBuy()} disabled={busy} className="flex min-h-10 flex-1 items-center justify-center gap-2 bg-shafx-primary px-3 text-[8px] font-semibold text-white disabled:opacity-60">
                  <CheckCircle2 className="h-3.5 w-3.5" /> CONFIRM {side === 'BUY' ? 'BUY UP' : 'SELL DOWN'}
                </button>
                <button type="button" onClick={resetQuote} disabled={busy} className="min-h-10 border border-shafx-border px-3 text-[8px] font-semibold text-shafx-textMuted disabled:opacity-50">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {state !== 'quoted' && (
          <div className="px-3 py-2.5">
            <button type="button" onClick={() => void requestQuote()} disabled={busy || !connection || Boolean(plan.validationError)} className="flex min-h-10 w-full items-center justify-center gap-2 bg-shafx-primary px-3 text-[8px] font-semibold text-white disabled:opacity-50">
              {state === 'buying' ? <><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> PLACING…</> : <>GET LIVE DERIV QUOTE <ArrowUpRight className="h-3.5 w-3.5" /></>}
            </button>
          </div>
        )}

        <div className="border-t border-shafx-border px-3 py-2 text-[7px] leading-4 text-shafx-textMuted sm:px-4">
          Stake is your Deriv exposure. Multiplier controls price sensitivity. SHAFX shows pips as chart distance only; the broker receives monetary protection amounts.
        </div>
      </div>
    </section>
  )
}
