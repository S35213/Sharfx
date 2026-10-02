import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Gauge,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  Target,
  Wallet,
  Zap,
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
  const [multiplier, setMultiplier] = useState('100')
  const [protectionEnabled, setProtectionEnabled] = useState(false)
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
  const protectionValid = stopValue >= 0 && stopValue <= stakeValue + 1e-8 && takeValue >= 0
  const inputsValid =
    Boolean(connection) &&
    accountHasMinimum &&
    stakeFitsBalance &&
    Number.isFinite(multiplierValue) &&
    multiplierValue > 0 &&
    multiplierValue <= 10000 &&
    protectionValid

  const selectedEntry = side === 'BUY' ? askPrice : bidPrice
  const quotePotentialProfit = useMemo(() => {
    if (!quote || !Number.isFinite(quote.payout)) return null
    return Number((Number(quote.payout) - quote.stake).toFixed(2))
  }, [quote])

  const balanceShare = Number.isFinite(accountBalance) && accountBalance > 0
    ? (stakeValue / accountBalance) * 100
    : 0

  const applyProtectionPreset = (enabled: boolean, nextStake = stakeValue): void => {
    setProtectionEnabled(enabled)
    if (!enabled) {
      setStopLossAmount('')
      setTakeProfitAmount('')
      return
    }
    const safeStake = Math.max(0.01, nextStake)
    setStopLossAmount(Math.max(0.01, safeStake * 0.5).toFixed(2))
    setTakeProfitAmount(Math.max(0.01, safeStake).toFixed(2))
  }

  const chooseStake = (value: string): void => {
    const numeric = Number(value)
    const next = Number.isFinite(numeric) && numeric <= accountBalance ? value : stake
    setStake(next)
    setQuote(null)
    setState('idle')
    setError('')
    if (protectionEnabled) applyProtectionPreset(true, Number(next))
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
        ? 'Connect a Deriv demo account before placing a manual trade.'
        : 'Check the stake, multiplier, and protection values before continuing.')
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
        stopLossAmount: protectionEnabled && stopValue > 0 ? stopValue : undefined,
        takeProfitAmount: protectionEnabled && takeValue > 0 ? takeValue : undefined,
      })
      setQuote(nextQuote)
      setState('quoted')
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : 'Unable to get a Deriv proposal.')
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
  const accountLabel = connection ? (connection.environment === 'demo' ? 'DEMO ACCOUNT' : 'REAL ACCOUNT') : 'NOT CONNECTED'
  const sideAccent = side === 'BUY' ? 'text-shafx-success' : 'text-shafx-danger'

  return (
    <section className="space-y-3 rounded-2xl border border-shafx-border bg-shafx-surface p-3 shadow-[0_14px_36px_rgba(0,0,0,.16)] sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">Manual Trade</h3>
            <span className="rounded-md border border-shafx-accent/25 bg-shafx-accent/10 px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-shafx-accent">SHARFX Order Ticket</span>
          </div>
          <p className="mt-1 text-[10px] leading-4 text-shafx-textMuted">
            Trade through Deriv’s Multiplier engine without turning SHARFX into a MetaTrader clone.
          </p>
        </div>
        <span className={connection
          ? 'shrink-0 rounded-full border border-shafx-success/25 bg-shafx-success/10 px-2 py-1 font-mono text-[8px] font-bold text-shafx-success'
          : 'shrink-0 rounded-full border border-shafx-danger/25 bg-shafx-danger/10 px-2 py-1 font-mono text-[8px] font-bold text-shafx-danger'}>
          {accountLabel}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-shafx-border bg-shafx-bg p-2.5">
          <span className="flex items-center gap-1 text-[8px] font-semibold uppercase tracking-[0.12em] text-shafx-textMuted"><Wallet className="h-3 w-3" />Balance</span>
          <strong className="mt-1 block truncate font-mono text-sm tabular-nums">{accountCurrency} {Number.isFinite(accountBalance) ? accountBalance.toFixed(2) : '0.00'}</strong>
        </div>
        <div className="rounded-xl border border-shafx-border bg-shafx-bg p-2.5">
          <span className="text-[8px] font-semibold uppercase tracking-[0.12em] text-shafx-textMuted">Market</span>
          <strong className="mt-1 block truncate font-mono text-sm">{symbol}</strong>
        </div>
        <div className="rounded-xl border border-shafx-border bg-shafx-bg p-2.5">
          <span className="text-[8px] font-semibold uppercase tracking-[0.12em] text-shafx-textMuted">Entry</span>
          <strong className="mt-1 block truncate font-mono text-sm tabular-nums">{selectedEntry.toFixed(symbolSpec.pricePrecision)}</strong>
        </div>
      </div>

      {aiSetup && (
        <div className="rounded-xl border border-shafx-accent/25 bg-shafx-accent/[0.06] p-3">
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-shafx-accent"><Sparkles className="h-3.5 w-3.5" />SHARFX setup context</div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[9px]">
            <div><span className="block text-shafx-textMuted">Direction</span><b className={aiSetup.direction === 'BUY' ? 'text-shafx-success' : 'text-shafx-danger'}>{aiSetup.direction}</b></div>
            <div><span className="block text-shafx-textMuted">Entry</span><b className="font-mono">{aiSetup.entryPrice}</b></div>
            <div><span className="block text-shafx-textMuted">Confidence</span><b className="font-mono">{aiSetup.confidence}%</b></div>
          </div>
          <div className="mt-2 flex items-start gap-2 text-[8px] leading-4 text-shafx-textMuted"><ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-shafx-success" />This is SHARFX analysis context. The actual broker order is still priced and validated by Deriv.</div>
        </div>
      )}

      <div className="rounded-2xl border border-shafx-border bg-shafx-bg/70 p-2.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.13em] text-shafx-textMuted">Direction</div>
            <div className="mt-0.5 text-[9px] text-shafx-textMuted">Choose the side and SHARFX immediately requests the broker quote.</div>
          </div>
          <span className={"font-mono text-[8px] font-bold " + sideAccent}>{side === 'BUY' ? 'MULTUP' : 'MULTDOWN'}</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void requestQuote('BUY')}
            disabled={busy || state === 'opened'}
            aria-label="Buy up"
            className={side === 'BUY'
              ? 'min-h-20 rounded-xl border border-shafx-success/30 bg-shafx-success/10 px-3 py-2.5 text-left ring-1 ring-shafx-success/20 disabled:cursor-wait disabled:opacity-70'
              : 'min-h-20 rounded-xl border border-shafx-border bg-shafx-bg px-3 py-2.5 text-left hover:border-shafx-success/40 disabled:opacity-50'}
          >
            <span className="flex items-center justify-between gap-2 text-xs font-semibold text-shafx-success">
              <span className="flex items-center gap-1.5"><ArrowUpRight className="h-4 w-4" />BUY UP</span>
              <span className="font-mono text-[8px] opacity-80">ASK</span>
            </span>
            <span className="mt-1 block font-mono text-sm tabular-nums text-shafx-text">{askPrice.toFixed(symbolSpec.pricePrecision)}</span>
            <span className="mt-1 block text-[8px] text-shafx-textMuted">Click to get a live proposal</span>
          </button>

          <button
            type="button"
            onClick={() => void requestQuote('SELL')}
            disabled={busy || state === 'opened'}
            aria-label="Sell down"
            className={side === 'SELL'
              ? 'min-h-20 rounded-xl border border-shafx-danger/30 bg-shafx-danger/10 px-3 py-2.5 text-left ring-1 ring-shafx-danger/20 disabled:cursor-wait disabled:opacity-70'
              : 'min-h-20 rounded-xl border border-shafx-border bg-shafx-bg px-3 py-2.5 text-left hover:border-shafx-danger/40 disabled:opacity-50'}
          >
            <span className="flex items-center justify-between gap-2 text-xs font-semibold text-shafx-danger">
              <span className="flex items-center gap-1.5"><ArrowDownRight className="h-4 w-4" />SELL DOWN</span>
              <span className="font-mono text-[8px] opacity-80">BID</span>
            </span>
            <span className="mt-1 block font-mono text-sm tabular-nums text-shafx-text">{bidPrice.toFixed(symbolSpec.pricePrecision)}</span>
            <span className="mt-1 block text-[8px] text-shafx-textMuted">Click to get a live proposal</span>
          </button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1.15fr_.85fr]">
        <div className="rounded-xl border border-shafx-border bg-shafx-bg/70 p-3">
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-shafx-textMuted"><CircleDollarSign className="h-3.5 w-3.5" />Trade size</div>
          <div className="mt-2 grid grid-cols-[1fr_auto] items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-[9px] text-shafx-textMuted">Stake ({accountCurrency})</span>
              <input
                aria-label="Stake"
                type="number"
                min="1"
                step="0.01"
                value={stake}
                onChange={(e) => chooseStake(e.target.value)}
                className="w-full rounded-lg border border-shafx-border bg-shafx-surface px-3 py-2.5 font-mono text-sm focus:border-shafx-primary focus:outline-none"
              />
            </label>
            <div className="pb-1 text-right text-[8px] text-shafx-textMuted">
              <div>Share of balance</div>
              <b className="font-mono text-shafx-text">{balanceShare.toFixed(2)}%</b>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUICK_STAKES.map((value) => {
              const disabled = Number(value) > accountBalance
              return (
                <button key={value} type="button" disabled={disabled} onClick={() => chooseStake(value)} className={"min-h-8 rounded-lg border px-2.5 text-[8px] font-semibold " + (stake === value ? 'border-shafx-accent/40 bg-shafx-accent/10 text-shafx-accent' : 'border-shafx-border bg-shafx-surface text-shafx-textMuted hover:text-shafx-text') + (disabled ? ' opacity-30' : '')}>{accountCurrency} {value}</button>
              )
            })}
          </div>
        </div>

        <div className="rounded-xl border border-shafx-border bg-shafx-bg/70 p-3">
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-shafx-textMuted"><Gauge className="h-3.5 w-3.5" />Multiplier</div>
          <input
            aria-label="Multiplier"
            type="number"
            min="1"
            max="10000"
            step="1"
            value={multiplier}
            onChange={(e) => chooseMultiplier(e.target.value)}
            className="mt-2 w-full rounded-lg border border-shafx-border bg-shafx-surface px-3 py-2.5 font-mono text-sm focus:border-shafx-primary focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUICK_MULTIPLIERS.map((value) => (
              <button key={value} type="button" onClick={() => chooseMultiplier(value)} className={"min-h-8 rounded-lg border px-2.5 text-[8px] font-semibold " + (multiplier === value ? 'border-shafx-accent/40 bg-shafx-accent/10 text-shafx-accent' : 'border-shafx-border bg-shafx-surface text-shafx-textMuted hover:text-shafx-text')}>{value}×</button>
            ))}
          </div>
        </div>
      </div>

      <div className={"rounded-xl border p-3 " + (protectionEnabled ? 'border-shafx-accent/30 bg-shafx-accent/[0.045]' : 'border-shafx-border bg-shafx-bg/70')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <ShieldCheck className={"mt-0.5 h-4 w-4 " + (protectionEnabled ? 'text-shafx-accent' : 'text-shafx-textMuted')} />
            <div>
              <div className="text-[10px] font-semibold">SHARFX Protection</div>
              <div className="mt-0.5 text-[8px] leading-4 text-shafx-textMuted">Optional broker-side protection for this Multiplier contract.</div>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={protectionEnabled}
            onClick={() => applyProtectionPreset(!protectionEnabled)}
            className={"rounded-full border px-3 py-1.5 text-[8px] font-bold uppercase tracking-wide " + (protectionEnabled ? 'border-shafx-accent/40 bg-shafx-accent/10 text-shafx-accent' : 'border-shafx-border bg-shafx-surface text-shafx-textMuted')}
          >
            {protectionEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {protectionEnabled ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[9px] text-shafx-textMuted">Max loss ({accountCurrency})</span>
                <div className="flex items-center gap-1.5 rounded-lg border border-shafx-danger/20 bg-shafx-surface px-2">
                  <Target className="h-3.5 w-3.5 text-shafx-danger" />
                  <input type="number" min="0" step="0.01" value={stopLossAmount} onChange={(e) => { setStopLossAmount(e.target.value); setQuote(null); setState('idle') }} className="min-w-0 flex-1 bg-transparent py-2.5 font-mono text-sm outline-none" />
                </div>
              </label>
              <label className="block">
                <span className="mb-1 block text-[9px] text-shafx-textMuted">Target profit ({accountCurrency})</span>
                <div className="flex items-center gap-1.5 rounded-lg border border-shafx-success/20 bg-shafx-surface px-2">
                  <Zap className="h-3.5 w-3.5 text-shafx-success" />
                  <input type="number" min="0" step="0.01" value={takeProfitAmount} onChange={(e) => { setTakeProfitAmount(e.target.value); setQuote(null); setState('idle') }} className="min-w-0 flex-1 bg-transparent py-2.5 font-mono text-sm outline-none" />
                </div>
              </label>
            </div>
            <div className="mt-2 rounded-lg border border-shafx-accent/15 bg-shafx-accent/[0.035] p-2 text-[8px] leading-4 text-shafx-textMuted">
              SHARFX preset: max loss = 50% of stake; target profit = 100% of stake. You can change either value before requesting the proposal.
            </div>
          </>
        ) : (
          <div className="mt-2 text-[8px] leading-4 text-shafx-textMuted">Off means SHARFX will request the contract without adding these limit orders. Deriv still prices and validates the proposal.</div>
        )}

        {stopValue > stakeValue && <div className="mt-2 text-[8px] text-shafx-danger">Max loss cannot exceed the opening stake.</div>}
      </div>

      {!connection && (
        <div className="flex items-start gap-2 rounded-lg border border-shafx-danger/20 bg-shafx-danger/10 p-3 text-[9px] text-shafx-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Connect a Deriv demo account before placing a manual trade.
        </div>
      )}

      {connection && !accountHasMinimum && (
        <div className="flex items-start gap-2 rounded-lg border border-shafx-danger/20 bg-shafx-danger/10 p-3 text-[9px] text-shafx-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          SHARFX currently requires at least 1 {accountCurrency} for Multiplier testing.
        </div>
      )}

      {stakeValue > accountBalance && <div className="text-[8px] text-shafx-danger">Stake exceeds the selected account balance.</div>}

      {state === 'quoting' && (
        <div className="flex items-center gap-2 rounded-xl border border-shafx-accent/20 bg-shafx-accent/[0.04] p-3 text-[9px] text-shafx-textMuted">
          <LoaderCircle className="h-4 w-4 animate-spin text-shafx-accent" />
          <span><b className="text-shafx-text">Getting live broker price…</b> Deriv is checking the selected market, stake, multiplier and protection.</span>
        </div>
      )}

      {quote && (
        <div className="rounded-2xl border border-shafx-accent/25 bg-shafx-accent/[0.04] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-semibold"><CheckCircle2 className={"h-4 w-4 " + (quote.side === 'BUY' ? 'text-shafx-success' : 'text-shafx-danger')} />TRADE REVIEW</div>
              <div className="mt-1 text-[8px] text-shafx-textMuted">Deriv proposal received. Nothing has been purchased yet.</div>
            </div>
            <span className={"rounded-full border px-2 py-1 font-mono text-[8px] font-bold " + (quote.side === 'BUY' ? 'border-shafx-success/25 bg-shafx-success/10 text-shafx-success' : 'border-shafx-danger/25 bg-shafx-danger/10 text-shafx-danger')}>
              {quote.side === 'BUY' ? 'BUY UP' : 'SELL DOWN'}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-shafx-border bg-shafx-bg px-2.5 py-2"><span className="block text-shafx-textMuted">Stake</span><b className="font-mono">{quote.stake.toFixed(2)} {quote.currency}</b></div>
            <div className="rounded-lg border border-shafx-border bg-shafx-bg px-2.5 py-2"><span className="block text-shafx-textMuted">Multiplier</span><b className="font-mono">{quote.multiplier}×</b></div>
            <div className="rounded-lg border border-shafx-border bg-shafx-bg px-2.5 py-2"><span className="block text-shafx-textMuted">Broker price</span><b className="font-mono">{quote.askPrice.toFixed(2)} {quote.currency}</b></div>
            <div className="rounded-lg border border-shafx-border bg-shafx-bg px-2.5 py-2"><span className="block text-shafx-textMuted">Entry spot</span><b className="font-mono">{typeof quote.spot === 'number' ? quote.spot.toFixed(symbolSpec.pricePrecision) : '—'}</b></div>
            <div className="rounded-lg border border-shafx-border bg-shafx-bg px-2.5 py-2"><span className="block text-shafx-textMuted">Potential payout</span><b className="font-mono">{typeof quote.payout === 'number' ? quote.payout.toFixed(2) : '—'} {quote.currency}</b></div>
            <div className="rounded-lg border border-shafx-border bg-shafx-bg px-2.5 py-2"><span className="block text-shafx-textMuted">Potential profit</span><b className="font-mono text-shafx-success">{quotePotentialProfit !== null ? (quotePotentialProfit >= 0 ? '+' : '') + quotePotentialProfit.toFixed(2) : '—'} {quote.currency}</b></div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="rounded-lg border border-shafx-border bg-shafx-bg/70 p-2.5 text-[8px] leading-4 text-shafx-textMuted">
              <div className="font-semibold uppercase tracking-[0.12em] text-shafx-text">Order path</div>
              <div className="mt-1">Market ✓ • Account ✓ • Proposal ✓ {protectionEnabled ? '• Protection ✓' : ''}</div>
              <div className="mt-1 font-mono break-all">Proposal: {quote.proposalId}</div>
            </div>
            <button
              type="button"
              onClick={() => void confirmBuy()}
              disabled={state === 'buying' || state === 'opened'}
              className={state === 'opened'
                ? 'flex min-h-12 items-center justify-center gap-2 rounded-xl bg-shafx-success/20 px-5 text-[10px] font-semibold text-shafx-success'
                : 'flex min-h-12 items-center justify-center gap-2 rounded-xl bg-shafx-primary px-5 text-[10px] font-semibold text-white shadow-[0_10px_26px_rgba(41,98,255,.2)] disabled:opacity-60'}
            >
              {state === 'buying'
                ? <><LoaderCircle className="h-4 w-4 animate-spin" />Placing…</>
                : state === 'opened'
                  ? 'Trade placed'
                  : <>Place {quote.side === 'BUY' ? 'BUY UP' : 'SELL DOWN'} <ArrowUpRight className="h-3.5 w-3.5" /></>}
            </button>
          </div>
        </div>
      )}

      {state === 'opened' && (
        <div className="rounded-xl border border-shafx-success/25 bg-shafx-success/[0.05] p-3 text-[9px] text-shafx-success">
          <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" />Trade opened through Deriv.</div>
          <div className="mt-1 text-shafx-textMuted">Contract ID: <span className="font-mono text-shafx-text">{openedContractId || 'assigned by Deriv'}</span></div>
          <div className="mt-1 flex items-center gap-1.5 text-shafx-textMuted"><Clock3 className="h-3 w-3" />It is now available in Open Positions for monitoring and closing.</div>
        </div>
      )}

      {state === 'error' && (
        <div className="flex items-start gap-2 rounded-xl border border-shafx-danger/20 bg-shafx-danger/10 p-3 text-[9px] text-shafx-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div><div className="font-semibold">Trade step failed</div><div className="mt-0.5 break-words">{error}</div></div>
        </div>
      )}

      {!quote && state !== 'quoting' && state !== 'error' && (
        <div className="rounded-lg border border-shafx-border bg-shafx-bg/60 p-2.5 text-[8px] leading-4 text-shafx-textMuted">
          <b className="text-shafx-text">How SHARFX manual trading works:</b> choose Buy Up or Sell Down → review Deriv’s live proposal → place the contract → monitor it in Open Positions. SHARFX adds the trader workflow; Deriv remains the execution venue.
        </div>
      )}
    </section>
  )
}
