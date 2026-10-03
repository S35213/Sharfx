import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  LoaderCircle,
  ShieldCheck,
} from 'lucide-react'
import type { SymbolSpec, Timeframe, TradeSide, TradeOrder } from '../../types'
import type { SetupCandidate } from '../../engine/setup/types'
import { buyDerivProposal, getDerivQuote, type DerivOrderConnection, type DerivProposalQuote } from '../../data/deriv/derivTrading'

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
  onTradeOpened: (order: TradeOrder) => void
  aiSetup?: SetupCandidate | null
}

type TradeState = 'idle' | 'quoting' | 'quoted' | 'buying' | 'opened' | 'error'

const toPositiveNumber = (value: string): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const QUICK_STAKES = ['1.00', '5.00', '10.00', '25.00']
const QUICK_MULTIPLIERS = ['100', '200', '300', '500', '800']

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
  onTradeOpened,
  aiSetup,
}) => {
  const [side, setSide] = useState<TradeSide>(aiSetup?.direction ?? 'BUY')
  const [stake, setStake] = useState('1.00')
  const [multiplier, setMultiplier] = useState('100')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [stopLossAmount, setStopLossAmount] = useState('')
  const [takeProfitAmount, setTakeProfitAmount] = useState('')
  const [quote, setQuote] = useState<DerivProposalQuote | null>(null)
  const [state, setState] = useState<TradeState>('idle')
  const [error, setError] = useState('')
  const [openedContractId, setOpenedContractId] = useState('')

  useEffect(() => {
    setSide(aiSetup?.direction ?? 'BUY')
    setQuote(null)
    setState('idle')
    setError('')
    setOpenedContractId('')
  }, [symbol, timeframe, aiSetup?.direction])

  const stakeValue = toPositiveNumber(stake)
  const multiplierValue = toPositiveNumber(multiplier)
  const stopValue = toPositiveNumber(stopLossAmount)
  const takeValue = toPositiveNumber(takeProfitAmount)
  const stakeFitsBalance = Number.isFinite(accountBalance) && stakeValue >= 1 && stakeValue <= accountBalance + 1e-8
  const exitsValid = stopValue >= 0 && stopValue <= stakeValue + 1e-8 && takeValue >= 0
  const inputsValid =
    Boolean(connection) &&
    stakeFitsBalance &&
    Number.isFinite(multiplierValue) &&
    multiplierValue > 0 &&
    multiplierValue <= 10000 &&
    exitsValid

  const selectedEntry = side === 'BUY' ? askPrice : bidPrice
  const balanceShare = accountBalance > 0 ? (stakeValue / accountBalance) * 100 : 0
  const quotePotentialProfit = useMemo(() => {
    if (!quote || !Number.isFinite(quote.payout)) return null
    return Number((Number(quote.payout) - quote.stake).toFixed(2))
  }, [quote])

  const resetQuote = (): void => {
    setQuote(null)
    setState('idle')
    setError('')
    setOpenedContractId('')
  }

  const chooseStake = (value: string): void => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric) || numeric > accountBalance) return
    setStake(value)
    resetQuote()
    if (stopLossAmount) setStopLossAmount(Math.min(Number(stopLossAmount), numeric).toFixed(2))
  }

  const chooseMultiplier = (value: string): void => {
    setMultiplier(value)
    resetQuote()
  }

  const requestQuote = async (requestedSide: TradeSide = side): Promise<void> => {
    if (!connection || !inputsValid) {
      setError(!connection ? 'Connect a Deriv demo account first.' : 'Check stake, multiplier, and protection values.')
      setState('error')
      return
    }

    setSide(requestedSide)
    setState('quoting')
    setError('')
    setQuote(null)
    setOpenedContractId('')

    try {
      const nextQuote = await getDerivQuote({
        connection,
        symbol,
        side: requestedSide,
        stake: stakeValue,
        currency: accountCurrency,
        multiplier: multiplierValue,
        stopLossAmount: advancedOpen && stopValue > 0 ? stopValue : undefined,
        takeProfitAmount: advancedOpen && takeValue > 0 ? takeValue : undefined,
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
      onTradeOpened({ ...order, chartTimeframe: timeframe })
      setOpenedContractId(String(order.providerOrderId || order.id))
      setState('opened')
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : 'Unable to place the Deriv contract.')
    }
  }

  const busy = state === 'quoting' || state === 'buying'
  const accountLabel = connection?.environment === 'live' ? 'LIVE' : connection ? 'DEMO' : 'OFFLINE'

  return (
    <section className="overflow-hidden rounded-xl border border-shafx-border bg-shafx-surface shadow-[0_14px_34px_rgba(0,0,0,.22)]">
      <header className="flex items-center justify-between border-b border-shafx-border px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-shafx-primary/10 text-shafx-primary">
            <ArrowUpRight className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold tracking-wide">TRADE</span>
              <span className="rounded border border-shafx-border px-1 py-0.5 font-mono text-[7px] font-bold text-shafx-textMuted">DERIV</span>
            </div>
            <div className="truncate font-mono text-[8px] text-shafx-textMuted">{symbol} · {timeframe} · Multiplier</div>
          </div>
        </div>
        <div className="text-right">
          <div className={"font-mono text-[8px] font-bold " + (connection ? 'text-shafx-success' : 'text-shafx-danger')}>{accountLabel}</div>
          <div className="font-mono text-[8px] text-shafx-textMuted">{accountCurrency} {Number.isFinite(accountBalance) ? accountBalance.toFixed(2) : '0.00'}</div>
        </div>
      </header>

      <div className="p-2.5 sm:p-3">
        <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-shafx-bg p-1">
          <button
            type="button"
            onClick={() => void requestQuote('BUY')}
            disabled={busy || state === 'opened'}
            className={"min-h-14 rounded-md border px-2.5 py-2 text-left transition " + (side === 'BUY' ? 'border-shafx-success/50 bg-shafx-success/[.09]' : 'border-transparent bg-transparent')}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-[9px] font-bold text-shafx-success"><ArrowUpRight className="h-3.5 w-3.5" />BUY UP</span>
              <span className="font-mono text-[7px] text-shafx-textMuted">LONG</span>
            </div>
            <div className="mt-1 font-mono text-xs tabular-nums">{askPrice.toFixed(symbolSpec.pricePrecision)}</div>
          </button>
          <button
            type="button"
            onClick={() => void requestQuote('SELL')}
            disabled={busy || state === 'opened'}
            className={"min-h-14 rounded-md border px-2.5 py-2 text-left transition " + (side === 'SELL' ? 'border-shafx-danger/50 bg-shafx-danger/[.09]' : 'border-transparent bg-transparent')}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-[9px] font-bold text-shafx-danger"><ArrowDownRight className="h-3.5 w-3.5" />SELL DOWN</span>
              <span className="font-mono text-[7px] text-shafx-textMuted">SHORT</span>
            </div>
            <div className="mt-1 font-mono text-xs tabular-nums">{bidPrice.toFixed(symbolSpec.pricePrecision)}</div>
          </button>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <label className="rounded-lg border border-shafx-border bg-shafx-bg px-2.5 py-2">
            <span className="block text-[7px] font-semibold uppercase tracking-[.12em] text-shafx-textMuted">Stake</span>
            <div className="mt-1 flex items-center">
              <span className="font-mono text-[8px] text-shafx-textMuted">{accountCurrency}</span>
              <input aria-label="Stake" type="number" min="1" step="0.01" value={stake} onChange={(e) => chooseStake(e.target.value)} className="min-w-0 flex-1 bg-transparent px-1.5 font-mono text-sm outline-none" />
            </div>
            <div className="mt-1 flex gap-1">
              {QUICK_STAKES.map((value) => (
                <button key={value} type="button" disabled={Number(value) > accountBalance} onClick={() => chooseStake(value)} className={"flex-1 rounded border py-1 font-mono text-[7px] " + (stake === value ? 'border-shafx-primary/40 bg-shafx-primary/10 text-shafx-primary' : 'border-shafx-border text-shafx-textMuted')}>
                  {value}
                </button>
              ))}
            </div>
          </label>

          <label className="rounded-lg border border-shafx-border bg-shafx-bg px-2.5 py-2">
            <span className="block text-[7px] font-semibold uppercase tracking-[.12em] text-shafx-textMuted">Multiplier</span>
            <div className="mt-1 flex items-center">
              <input aria-label="Multiplier" type="number" min="1" max="10000" step="1" value={multiplier} onChange={(e) => chooseMultiplier(e.target.value)} className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none" />
              <span className="font-mono text-[9px] text-shafx-textMuted">×</span>
            </div>
            <div className="mt-1 flex gap-1">
              {QUICK_MULTIPLIERS.map((value) => (
                <button key={value} type="button" onClick={() => chooseMultiplier(value)} className={"flex-1 rounded border py-1 font-mono text-[7px] " + (multiplier === value ? 'border-shafx-primary/40 bg-shafx-primary/10 text-shafx-primary' : 'border-shafx-border text-shafx-textMuted')}>
                  {value}
                </button>
              ))}
            </div>
          </label>
        </div>

        <div className="mt-2 flex items-center justify-between rounded-lg border border-shafx-border bg-shafx-bg px-2.5 py-2">
          <div className="font-mono text-[7px] text-shafx-textMuted">
            <span>ENTRY </span><b className="text-shafx-text">{selectedEntry.toFixed(symbolSpec.pricePrecision)}</b>
            <span className="mx-2">•</span>
            <span>RISK </span><b className="text-shafx-text">{accountCurrency} {stakeValue.toFixed(2)}</b>
            <span className="mx-2">•</span>
            <span>{balanceShare.toFixed(1)}% BAL</span>
          </div>
          {quotePotentialProfit !== null && <span className="font-mono text-[8px] font-bold text-shafx-success">+{quotePotentialProfit.toFixed(2)} est.</span>}
        </div>

        <button type="button" onClick={() => { setAdvancedOpen((v) => !v); resetQuote() }} className="mt-2 flex w-full items-center justify-between border-b border-shafx-border py-1.5 text-left">
          <span className="flex items-center gap-1.5 text-[8px] font-semibold"><ShieldCheck className="h-3.5 w-3.5 text-shafx-textMuted" />Protection <span className="font-normal text-shafx-textMuted">optional</span></span>
          <ChevronDown className={"h-3.5 w-3.5 text-shafx-textMuted transition-transform " + (advancedOpen ? 'rotate-180' : '')} />
        </button>

        {advancedOpen && (
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <label className="rounded-lg border border-shafx-border bg-shafx-bg px-2.5 py-2 text-[7px] text-shafx-textMuted">
              Stop loss
              <input aria-label="Stop loss amount" type="number" min="0" step="0.01" value={stopLossAmount} onChange={(e) => { setStopLossAmount(e.target.value); resetQuote() }} placeholder="Optional" className="mt-1 w-full bg-transparent font-mono text-xs text-shafx-text outline-none" />
            </label>
            <label className="rounded-lg border border-shafx-border bg-shafx-bg px-2.5 py-2 text-[7px] text-shafx-textMuted">
              Take profit
              <input aria-label="Take profit amount" type="number" min="0" step="0.01" value={takeProfitAmount} onChange={(e) => { setTakeProfitAmount(e.target.value); resetQuote() }} placeholder="Optional" className="mt-1 w-full bg-transparent font-mono text-xs text-shafx-text outline-none" />
            </label>
          </div>
        )}

        {!connection && <div className="mt-2 rounded-lg border border-shafx-danger/20 bg-shafx-danger/10 px-2.5 py-2 text-[8px] text-shafx-danger">Connect your Deriv demo account before trading.</div>}
        {stakeValue > accountBalance && <div className="mt-2 text-[8px] text-shafx-danger">Stake exceeds available balance.</div>}
        {stopValue > stakeValue && <div className="mt-2 text-[8px] text-shafx-danger">Stop loss cannot exceed stake.</div>}

        {state === 'quoting' && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-shafx-primary/20 bg-shafx-primary/[.05] px-2.5 py-2 text-[8px] text-shafx-textMuted">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin text-shafx-primary" />Requesting live Deriv price…
          </div>
        )}

        {quote && (
          <div className="mt-2 rounded-lg border border-shafx-primary/25 bg-shafx-primary/[.05] p-2.5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[8px] font-bold uppercase tracking-[.12em]">Order review</div>
                <div className="mt-0.5 font-mono text-[7px] text-shafx-textMuted">{quote.side === 'BUY' ? 'BUY UP' : 'SELL DOWN'} · {quote.multiplier}× · {accountCurrency} {quote.stake.toFixed(2)}</div>
              </div>
              <span className="font-mono text-[8px] text-shafx-success">{quotePotentialProfit !== null ? '+' + quotePotentialProfit.toFixed(2) : '—'}</span>
            </div>
            <button type="button" onClick={() => void confirmBuy()} disabled={state === 'buying' || state === 'opened'} className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-shafx-primary px-3 text-[8px] font-bold text-white disabled:opacity-60">
              {state === 'buying' ? <><LoaderCircle className="h-3.5 w-3.5 animate-spin" />PLACING…</> : state === 'opened' ? <><CheckCircle2 className="h-3.5 w-3.5" />TRADE OPEN</> : <>CONFIRM {quote.side === 'BUY' ? 'BUY UP' : 'SELL DOWN'} <ArrowUpRight className="h-3.5 w-3.5" /></>}
            </button>
          </div>
        )}

        {state === 'opened' && (
          <div className="mt-2 rounded-lg border border-shafx-success/25 bg-shafx-success/[.05] px-2.5 py-2 text-[8px] text-shafx-success">
            <div className="flex items-center gap-1.5 font-semibold"><CheckCircle2 className="h-3.5 w-3.5" />Trade opened through Deriv</div>
            <div className="mt-0.5 font-mono text-[7px] text-shafx-textMuted">Contract {openedContractId || 'assigned by Deriv'}</div>
          </div>
        )}

        {state === 'error' && (
          <div className="mt-2 rounded-lg border border-shafx-danger/25 bg-shafx-danger/10 px-2.5 py-2">
            <div className="flex items-center gap-1.5 text-[8px] font-bold text-shafx-danger"><AlertCircle className="h-3.5 w-3.5" />ORDER FAILED</div>
            <div className="mt-0.5 break-words text-[8px] leading-4 text-shafx-danger">{error}</div>
          </div>
        )}

        {aiSetup && (
          <div className="mt-2 flex items-center justify-between border-t border-shafx-border pt-2 font-mono text-[7px] text-shafx-textMuted">
            <span>SHAFX setup · {aiSetup.direction} · {aiSetup.confidence}%</span>
            <span>Entry {aiSetup.entryPrice}</span>
          </div>
        )}

        <div className="mt-2 text-center font-mono text-[6px] uppercase tracking-[.12em] text-shafx-textMuted">{timeframe} is chart context · Deriv Multiplier controls the contract</div>
      </div>
    </section>
  )
}
