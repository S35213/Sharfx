import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Info,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import type { SymbolSpec, TradeSide, TradeOrder } from '../../types'
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
const QUICK_MULTIPLIERS = ['10', '25', '50', '100']

export const OrderPanel: React.FC<Props> = ({
  symbol,
  currentPrice,
  bidPrice = currentPrice,
  askPrice = currentPrice,
  accountBalance,
  accountCurrency,
  symbolSpec,
  connection,
  onTradeOpened,
  aiSetup,
}) => {
  const [side, setSide] = useState<TradeSide>(aiSetup?.direction ?? 'BUY')
  const [stake, setStake] = useState('1.00')
  const [multiplier, setMultiplier] = useState('25')
  const [exitsOpen, setExitsOpen] = useState(false)
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
  }, [symbol, aiSetup?.direction])

  const stakeValue = toPositiveNumber(stake)
  const multiplierValue = toPositiveNumber(multiplier)
  const stopValue = toPositiveNumber(stopLossAmount)
  const takeValue = toPositiveNumber(takeProfitAmount)
  const accountHasMinimum = Number.isFinite(accountBalance) && accountBalance >= 1
  const stakeFitsBalance = Number.isFinite(accountBalance) && stakeValue >= 1 && stakeValue <= accountBalance + 1e-8
  const exitsValid = stopValue >= 0 && stopValue <= stakeValue + 1e-8 && takeValue >= 0
  const inputsValid =
    Boolean(connection) &&
    accountHasMinimum &&
    stakeFitsBalance &&
    Number.isFinite(multiplierValue) &&
    multiplierValue > 0 &&
    multiplierValue <= 10000 &&
    exitsValid

  const selectedEntry = side === 'BUY' ? askPrice : bidPrice
  const balanceShare = Number.isFinite(accountBalance) && accountBalance > 0
    ? (stakeValue / accountBalance) * 100
    : 0

  const quotePotentialProfit = useMemo(() => {
    if (!quote || !Number.isFinite(quote.payout)) return null
    return Number((Number(quote.payout) - quote.stake).toFixed(2))
  }, [quote])

  const toggleExits = (): void => {
    setExitsOpen((open) => {
      if (open) {
        setStopLossAmount('')
        setTakeProfitAmount('')
        setQuote(null)
        setState('idle')
      }
      return !open
    })
  }

  const chooseStake = (value: string): void => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric) || numeric > accountBalance) return
    setStake(value)
    setQuote(null)
    setState('idle')
    setError('')
    if (exitsOpen && stopLossAmount) {
      setStopLossAmount(Math.min(Number(stopLossAmount), numeric).toFixed(2))
    }
  }

  const chooseMultiplier = (value: string): void => {
    setMultiplier(value)
    setQuote(null)
    setState('idle')
    setError('')
  }

  const requestQuote = async (requestedSide: TradeSide = side): Promise<void> => {
    if (!connection || !inputsValid) {
      setError(!connection
        ? 'Connect a Deriv demo account before placing a trade.'
        : 'Check your stake, multiplier, and exit rules.')
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
        stopLossAmount: exitsOpen && stopValue > 0 ? stopValue : undefined,
        takeProfitAmount: exitsOpen && takeValue > 0 ? takeValue : undefined,
      })
      setQuote(nextQuote)
      setState('quoted')
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : 'Unable to get a live Deriv price.')
    }
  }

  const confirmBuy = async (): Promise<void> => {
    if (!connection || !quote) return
    setState('buying')
    setError('')
    try {
      const order = await buyDerivProposal({ connection, quote })
      onTradeOpened(order)
      setOpenedContractId(String(order.providerOrderId || order.id))
      setState('opened')
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : 'Unable to place the Deriv contract.')
    }
  }

  const busy = state === 'quoting' || state === 'buying'
  const accountLabel = connection?.environment === 'live' ? 'LIVE' : connection ? 'DEMO' : 'OFFLINE'
  const accountTone = connection ? 'text-shafx-success' : 'text-shafx-danger'

  return (
    <section className="overflow-hidden rounded-2xl border border-shafx-border bg-shafx-surface shadow-[0_16px_40px_rgba(0,0,0,.2)]">
      <header className="flex items-center justify-between gap-3 border-b border-shafx-border bg-shafx-bg/80 px-3 py-3 sm:px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-shafx-accent shadow-[0_0_10px_rgba(139,92,246,.65)]" />
            <h3 className="text-sm font-semibold">SHAFX Order</h3>
            <span className="rounded-md border border-shafx-border px-1.5 py-0.5 font-mono text-[7px] font-bold uppercase tracking-[.15em] text-shafx-textMuted">MULTIPLIER</span>
          </div>
          <p className="mt-0.5 text-[8px] text-shafx-textMuted">A simple execution ticket built for SHAFX</p>
        </div>
        <div className="text-right">
          <div className={"font-mono text-[8px] font-bold " + accountTone}>{accountLabel}</div>
          <div className="font-mono text-[8px] text-shafx-textMuted">{symbol}</div>
        </div>
      </header>

      <div className="space-y-2.5 p-2.5 sm:p-3.5">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div className="rounded-xl border border-shafx-border bg-shafx-bg px-3 py-2.5">
            <div className="text-[8px] font-semibold uppercase tracking-[.14em] text-shafx-textMuted">Market</div>
            <div className="mt-1 flex items-end justify-between gap-2">
              <b className="font-mono text-sm">{symbol}</b>
              <span className="font-mono text-xs tabular-nums">{selectedEntry.toFixed(symbolSpec.pricePrecision)}</span>
            </div>
          </div>
          <div className="min-w-[96px] rounded-xl border border-shafx-border bg-shafx-bg px-3 py-2.5 text-right">
            <span className="text-[8px] uppercase tracking-[.14em] text-shafx-textMuted">Available</span>
            <b className="mt-1 block font-mono text-xs tabular-nums">{accountCurrency} {Number.isFinite(accountBalance) ? accountBalance.toFixed(2) : '0.00'}</b>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => void requestQuote('BUY')} disabled={busy || state === 'opened'} className="min-h-[76px] rounded-xl border border-shafx-success/30 bg-shafx-success/[.07] px-3 py-2.5 text-left transition hover:border-shafx-success/55 hover:bg-shafx-success/[.11] disabled:cursor-wait disabled:opacity-60">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-shafx-success"><ArrowUpRight className="h-4 w-4" />BUY UP</span>
              <span className="rounded-md bg-shafx-success/10 px-1.5 py-1 font-mono text-[7px] text-shafx-success">LONG</span>
            </div>
            <div className="mt-2 font-mono text-sm tabular-nums">{askPrice.toFixed(symbolSpec.pricePrecision)}</div>
            <div className="mt-0.5 text-[7px] text-shafx-textMuted">Tap for live price</div>
          </button>

          <button type="button" onClick={() => void requestQuote('SELL')} disabled={busy || state === 'opened'} className="min-h-[76px] rounded-xl border border-shafx-danger/30 bg-shafx-danger/[.07] px-3 py-2.5 text-left transition hover:border-shafx-danger/55 hover:bg-shafx-danger/[.11] disabled:cursor-wait disabled:opacity-60">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-shafx-danger"><ArrowDownRight className="h-4 w-4" />SELL DOWN</span>
              <span className="rounded-md bg-shafx-danger/10 px-1.5 py-1 font-mono text-[7px] text-shafx-danger">SHORT</span>
            </div>
            <div className="mt-2 font-mono text-sm tabular-nums">{bidPrice.toFixed(symbolSpec.pricePrecision)}</div>
            <div className="mt-0.5 text-[7px] text-shafx-textMuted">Tap for live price</div>
          </button>
        </div>

        <div className="rounded-xl border border-shafx-border bg-shafx-bg/70 p-2.5">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-[8px] font-semibold uppercase tracking-[.14em] text-shafx-textMuted">Trade setup</div>
              <div className="mt-0.5 text-[7px] text-shafx-textMuted">Stake is your maximum loss before Deriv stop-out.</div>
            </div>
            <span className="font-mono text-[8px] text-shafx-textMuted">{balanceShare.toFixed(1)}% of balance</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[8px] text-shafx-textMuted">Stake</span>
              <div className="mt-1 flex items-center rounded-lg border border-shafx-border bg-shafx-surface px-2.5">
                <span className="font-mono text-[9px] text-shafx-textMuted">{accountCurrency}</span>
                <input aria-label="Stake" type="number" min="1" step="0.01" value={stake} onChange={(e) => chooseStake(e.target.value)} className="min-w-0 flex-1 bg-transparent px-2 py-2 font-mono text-sm outline-none" />
              </div>
            </label>
            <label className="block">
              <span className="text-[8px] text-shafx-textMuted">Multiplier</span>
              <div className="mt-1 flex items-center rounded-lg border border-shafx-border bg-shafx-surface px-2.5">
                <input aria-label="Multiplier" type="number" min="1" max="10000" step="1" value={multiplier} onChange={(e) => chooseMultiplier(e.target.value)} className="min-w-0 flex-1 bg-transparent py-2 font-mono text-sm outline-none" />
                <span className="font-mono text-[9px] text-shafx-textMuted">×</span>
              </div>
            </label>
          </div>

          <div className="mt-1.5 flex gap-1.5">
            {QUICK_STAKES.map((value) => (
              <button key={value} type="button" disabled={Number(value) > accountBalance} onClick={() => chooseStake(value)} className={"min-h-7 flex-1 rounded-md border text-[7px] font-bold " + (stake === value ? 'border-shafx-accent/40 bg-shafx-accent/10 text-shafx-accent' : 'border-shafx-border bg-shafx-surface text-shafx-textMuted')}>
                {value}
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex gap-1.5">
            {QUICK_MULTIPLIERS.map((value) => (
              <button key={value} type="button" onClick={() => chooseMultiplier(value)} className={"min-h-7 flex-1 rounded-md border text-[7px] font-bold " + (multiplier === value ? 'border-shafx-accent/40 bg-shafx-accent/10 text-shafx-accent' : 'border-shafx-border bg-shafx-surface text-shafx-textMuted')}>
                {value}×
              </button>
            ))}
          </div>
        </div>

        <button type="button" onClick={toggleExits} aria-expanded={exitsOpen} className={"flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left " + (exitsOpen ? 'border-shafx-accent/25 bg-shafx-accent/[.05]' : 'border-shafx-border bg-shafx-bg/60')}>
          <span className="flex items-center gap-2">
            <ShieldCheck className={"h-4 w-4 " + (exitsOpen ? 'text-shafx-accent' : 'text-shafx-textMuted')} />
            <span>
              <b className="block text-[9px]">Auto exits</b>
              <span className="block text-[7px] text-shafx-textMuted">{exitsOpen ? 'Stop loss + take profit' : 'Optional risk controls'}</span>
            </span>
          </span>
          <ChevronDown className={"h-4 w-4 text-shafx-textMuted transition-transform " + (exitsOpen ? 'rotate-180' : '')} />
        </button>

        {exitsOpen && (
          <div className="rounded-xl border border-shafx-border bg-shafx-bg p-2.5">
            <div className="mb-2 flex items-start gap-2 text-[7px] leading-4 text-shafx-textMuted">
              <Info className="mt-0.5 h-3 w-3 shrink-0 text-shafx-accent" />
              <span><b className="text-shafx-text">Stop loss</b> closes the position when your loss reaches the amount you choose. <b className="text-shafx-text">Take profit</b> closes it when your target profit is reached.</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-[8px] text-shafx-textMuted">
                Stop loss
                <input aria-label="Stop loss amount" type="number" min="0" step="0.01" value={stopLossAmount} onChange={(e) => { setStopLossAmount(e.target.value); setQuote(null); setState('idle') }} placeholder="0.00" className="mt-1 w-full rounded-lg border border-shafx-danger/20 bg-shafx-surface px-2.5 py-2 font-mono text-xs outline-none" />
                <span className="mt-1 block text-[7px]">max {accountCurrency} {stakeValue.toFixed(2)}</span>
              </label>
              <label className="block text-[8px] text-shafx-textMuted">
                Take profit
                <input aria-label="Take profit amount" type="number" min="0" step="0.01" value={takeProfitAmount} onChange={(e) => { setTakeProfitAmount(e.target.value); setQuote(null); setState('idle') }} placeholder="0.00" className="mt-1 w-full rounded-lg border border-shafx-success/20 bg-shafx-surface px-2.5 py-2 font-mono text-xs outline-none" />
                <span className="mt-1 block text-[7px]">target profit amount</span>
              </label>
            </div>
          </div>
        )}

        {aiSetup && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-shafx-accent/20 bg-shafx-accent/[.04] px-3 py-2">
            <span className="flex items-center gap-2 text-[8px]"><Sparkles className="h-3 w-3 text-shafx-accent" /><b>SHAFX signal</b><span className="text-shafx-textMuted">{aiSetup.direction} · {aiSetup.confidence}%</span></span>
            <span className="font-mono text-[8px] text-shafx-textMuted">Entry {aiSetup.entryPrice}</span>
          </div>
        )}

        {state === 'quoting' && (
          <div className="flex items-center gap-2 rounded-xl border border-shafx-accent/20 bg-shafx-accent/[.05] p-3 text-[8px] text-shafx-textMuted">
            <LoaderCircle className="h-4 w-4 animate-spin text-shafx-accent" />
            <span><b className="text-shafx-text">Getting live price…</b> SHAFX is asking Deriv for a current proposal.</span>
          </div>
        )}

        {quote && (
          <div className="rounded-2xl border border-shafx-accent/25 bg-shafx-accent/[.05] p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[9px] font-bold tracking-[.12em]">REVIEW ORDER</div>
                <div className="mt-0.5 text-[7px] text-shafx-textMuted">Nothing is bought until you confirm.</div>
              </div>
              <span className={"rounded-md px-2 py-1 font-mono text-[8px] font-bold " + (quote.side === 'BUY' ? 'bg-shafx-success/10 text-shafx-success' : 'bg-shafx-danger/10 text-shafx-danger')}>
                {quote.side === 'BUY' ? 'BUY UP' : 'SELL DOWN'}
              </span>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <div className="rounded-lg bg-shafx-bg px-2 py-2"><span className="block text-[7px] text-shafx-textMuted">Entry</span><b className="font-mono text-[9px]">{quote.spot?.toFixed(symbolSpec.pricePrecision) ?? selectedEntry.toFixed(symbolSpec.pricePrecision)}</b></div>
              <div className="rounded-lg bg-shafx-bg px-2 py-2"><span className="block text-[7px] text-shafx-textMuted">Stake</span><b className="font-mono text-[9px]">{quote.stake.toFixed(2)}</b></div>
              <div className="rounded-lg bg-shafx-bg px-2 py-2"><span className="block text-[7px] text-shafx-textMuted">Multiplier</span><b className="font-mono text-[9px]">{quote.multiplier}×</b></div>
              <div className="rounded-lg bg-shafx-bg px-2 py-2"><span className="block text-[7px] text-shafx-textMuted">Est. profit</span><b className="font-mono text-[9px] text-shafx-success">{quotePotentialProfit !== null ? (quotePotentialProfit >= 0 ? '+' : '') + quotePotentialProfit.toFixed(2) : '—'}</b></div>
            </div>

            <button type="button" onClick={() => void confirmBuy()} disabled={state === 'buying' || state === 'opened'} className="mt-2.5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-shafx-primary px-4 text-[9px] font-bold text-white disabled:opacity-60">
              {state === 'buying' ? <><LoaderCircle className="h-4 w-4 animate-spin" />PLACING {quote.side === 'BUY' ? 'BUY UP' : 'SELL DOWN'}…</> : state === 'opened' ? <><CheckCircle2 className="h-4 w-4" />TRADE OPEN</> : <>CONFIRM {quote.side === 'BUY' ? 'BUY UP' : 'SELL DOWN'} <ArrowUpRight className="h-3.5 w-3.5" /></>}
            </button>
          </div>
        )}

        {!connection && (
          <div className="rounded-xl border border-shafx-danger/20 bg-shafx-danger/10 p-2.5 text-[8px] text-shafx-danger">
            Connect your Deriv demo account before placing an order.
          </div>
        )}
        {stakeValue > accountBalance && <div className="text-[8px] text-shafx-danger">Stake exceeds your available balance.</div>}
        {stopValue > stakeValue && <div className="text-[8px] text-shafx-danger">Stop loss cannot be greater than the opening stake.</div>}

        {state === 'opened' && (
          <div className="rounded-xl border border-shafx-success/25 bg-shafx-success/[.05] p-3 text-[8px] text-shafx-success">
            <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" />Trade opened through Deriv</div>
            <div className="mt-1 text-shafx-textMuted">Contract ID: <span className="font-mono text-shafx-text">{openedContractId || 'assigned by Deriv'}</span></div>
          </div>
        )}

        {state === 'error' && (
          <div className="rounded-xl border border-shafx-danger/25 bg-shafx-danger/10 p-3">
            <div className="flex items-center gap-2 text-[9px] font-bold text-shafx-danger"><AlertCircle className="h-4 w-4" />ORDER FAILED</div>
            <div className="mt-1 break-words text-[8px] leading-4 text-shafx-danger">{error}</div>
          </div>
        )}
      </div>
    </section>
  )
}
