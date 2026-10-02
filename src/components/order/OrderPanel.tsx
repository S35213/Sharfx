import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
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

  return (
    <section className="overflow-hidden rounded-2xl border border-shafx-border bg-shafx-surface shadow-[0_18px_50px_rgba(0,0,0,.22)]">
      <div className="border-b border-shafx-border bg-shafx-bg/80 px-3 py-2.5 sm:px-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-shafx-accent shadow-[0_0_10px_rgba(139,92,246,.7)]" /><h3 className="text-sm font-semibold">TradeDock</h3><span className="rounded border border-shafx-border px-1.5 py-0.5 font-mono text-[7px] font-bold uppercase tracking-[.16em] text-shafx-textMuted">SHARFX</span></div><p className="mt-0.5 text-[8px] text-shafx-textMuted">Fast manual execution · Deriv Multiplier</p></div>
          <div className="text-right"><div className="font-mono text-[8px] font-bold text-shafx-success">{connection ? 'CONNECTED' : 'OFFLINE'}</div><div className="font-mono text-[8px] text-shafx-textMuted">{symbol} · M5</div></div>
        </div>
      </div>
      <div className="space-y-2.5 p-2.5 sm:p-3.5">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div className="rounded-xl border border-shafx-border bg-shafx-bg px-3 py-2.5"><div className="flex items-center justify-between gap-2"><span className="text-[8px] font-semibold uppercase tracking-[.14em] text-shafx-textMuted">Market</span><span className="font-mono text-[8px] text-shafx-textMuted">{accountLabel}</span></div><div className="mt-1 flex items-end justify-between gap-2"><b className="font-mono text-sm">{symbol}</b><span className="font-mono text-xs tabular-nums text-shafx-text">{selectedEntry.toFixed(symbolSpec.pricePrecision)}</span></div></div>
          <div className="min-w-[92px] rounded-xl border border-shafx-border bg-shafx-bg px-3 py-2.5 text-right"><span className="text-[8px] uppercase tracking-[.14em] text-shafx-textMuted">Balance</span><b className="mt-1 block font-mono text-xs tabular-nums">{accountCurrency} {Number.isFinite(accountBalance) ? accountBalance.toFixed(2) : '0.00'}</b></div>
        </div>

        <div className="rounded-2xl border border-shafx-border bg-shafx-bg/70 p-2">
          <div className="mb-2 flex items-center justify-between px-1"><div><div className="text-[8px] font-semibold uppercase tracking-[.15em] text-shafx-textMuted">Trade direction</div><div className="mt-0.5 text-[8px] text-shafx-textMuted">One tap requests the live broker quote.</div></div><span className={"rounded-md px-2 py-1 font-mono text-[8px] font-bold " + (side === 'BUY' ? 'bg-shafx-success/10 text-shafx-success' : 'bg-shafx-danger/10 text-shafx-danger')}>{side === 'BUY' ? 'UP' : 'DOWN'}</span></div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void requestQuote('BUY')} disabled={busy || state === 'opened'} aria-label="Buy up" className="group min-h-[74px] rounded-xl border border-shafx-success/25 bg-shafx-success/[.07] px-3 py-2 text-left transition hover:border-shafx-success/50 hover:bg-shafx-success/[.11] disabled:cursor-wait disabled:opacity-60"><div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-xs font-bold text-shafx-success"><ArrowUpRight className="h-4 w-4" />BUY</span><span className="font-mono text-[8px] text-shafx-textMuted">UP</span></div><div className="mt-1 font-mono text-sm tabular-nums">{askPrice.toFixed(symbolSpec.pricePrecision)}</div><div className="mt-1 text-[7px] text-shafx-textMuted">Rise / Multiplier</div></button>
            <button type="button" onClick={() => void requestQuote('SELL')} disabled={busy || state === 'opened'} aria-label="Sell down" className="group min-h-[74px] rounded-xl border border-shafx-danger/25 bg-shafx-danger/[.07] px-3 py-2 text-left transition hover:border-shafx-danger/50 hover:bg-shafx-danger/[.11] disabled:cursor-wait disabled:opacity-60"><div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-xs font-bold text-shafx-danger"><ArrowDownRight className="h-4 w-4" />SELL</span><span className="font-mono text-[8px] text-shafx-textMuted">DOWN</span></div><div className="mt-1 font-mono text-sm tabular-nums">{bidPrice.toFixed(symbolSpec.pricePrecision)}</div><div className="mt-1 text-[7px] text-shafx-textMuted">Fall / Multiplier</div></button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-shafx-border bg-shafx-bg p-2.5"><div className="flex items-center justify-between"><span className="text-[8px] font-semibold uppercase tracking-[.14em] text-shafx-textMuted">Stake</span><span className="font-mono text-[8px] text-shafx-textMuted">{balanceShare.toFixed(1)}% balance</span></div><div className="mt-1.5 flex items-center rounded-lg border border-shafx-border bg-shafx-surface px-2.5"><span className="font-mono text-[9px] text-shafx-textMuted">{accountCurrency}</span><input aria-label="Stake" type="number" min="1" step="0.01" value={stake} onChange={(e) => chooseStake(e.target.value)} className="min-w-0 flex-1 bg-transparent px-2 py-2 font-mono text-sm outline-none" /></div><div className="mt-1.5 flex gap-1">{QUICK_STAKES.map((value) => <button key={value} type="button" disabled={Number(value) > accountBalance} onClick={() => chooseStake(value)} className={"min-h-7 flex-1 rounded-md border text-[7px] font-bold " + (stake === value ? 'border-shafx-accent/40 bg-shafx-accent/10 text-shafx-accent' : 'border-shafx-border bg-shafx-surface text-shafx-textMuted')}>{value}</button>)}</div></div>
          <div className="rounded-xl border border-shafx-border bg-shafx-bg p-2.5"><div className="flex items-center justify-between"><span className="text-[8px] font-semibold uppercase tracking-[.14em] text-shafx-textMuted">Multiplier</span><span className="font-mono text-[8px] text-shafx-textMuted">Risk engine</span></div><div className="mt-1.5 flex items-center rounded-lg border border-shafx-border bg-shafx-surface px-2.5"><input aria-label="Multiplier" type="number" min="1" max="10000" step="1" value={multiplier} onChange={(e) => chooseMultiplier(e.target.value)} className="min-w-0 flex-1 bg-transparent py-2 font-mono text-sm outline-none" /><span className="font-mono text-[9px] text-shafx-textMuted">×</span></div><div className="mt-1.5 flex gap-1">{QUICK_MULTIPLIERS.map((value) => <button key={value} type="button" onClick={() => chooseMultiplier(value)} className={"min-h-7 flex-1 rounded-md border text-[7px] font-bold " + (multiplier === value ? 'border-shafx-accent/40 bg-shafx-accent/10 text-shafx-accent' : 'border-shafx-border bg-shafx-surface text-shafx-textMuted')}>{value}×</button>)}</div></div>
        </div>

        <button type="button" role="switch" aria-checked={protectionEnabled} onClick={() => applyProtectionPreset(!protectionEnabled)} className={"flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left " + (protectionEnabled ? 'border-shafx-accent/30 bg-shafx-accent/[.06]' : 'border-shafx-border bg-shafx-bg/60')}><span className="flex items-center gap-2"><ShieldCheck className={"h-4 w-4 " + (protectionEnabled ? 'text-shafx-accent' : 'text-shafx-textMuted')} /><span><b className="block text-[9px]">SHARFX Protection</b><span className="block text-[7px] text-shafx-textMuted">{protectionEnabled ? 'Max loss + target profit are active' : 'Optional · tap to add trade limits'}</span></span></span><span className={"rounded-full px-2.5 py-1 font-mono text-[7px] font-bold " + (protectionEnabled ? 'bg-shafx-accent/15 text-shafx-accent' : 'bg-shafx-border/60 text-shafx-textMuted')}>{protectionEnabled ? 'ON' : 'OFF'}</span></button>

        {protectionEnabled && <div className="grid grid-cols-2 gap-2 rounded-xl border border-shafx-border bg-shafx-bg p-2.5"><label className="text-[8px] text-shafx-textMuted">Max loss<input type="number" min="0" step="0.01" value={stopLossAmount} onChange={(e) => { setStopLossAmount(e.target.value); setQuote(null); setState('idle') }} className="mt-1 w-full rounded-lg border border-shafx-danger/20 bg-shafx-surface px-2.5 py-2 font-mono text-xs outline-none" /></label><label className="text-[8px] text-shafx-textMuted">Target profit<input type="number" min="0" step="0.01" value={takeProfitAmount} onChange={(e) => { setTakeProfitAmount(e.target.value); setQuote(null); setState('idle') }} className="mt-1 w-full rounded-lg border border-shafx-success/20 bg-shafx-surface px-2.5 py-2 font-mono text-xs outline-none" /></label><div className="col-span-2 text-[7px] text-shafx-textMuted">Preset: max loss 50% of stake · target profit 100% of stake. Deriv validates the final contract limits.</div></div>}

        {aiSetup && <div className="flex items-center justify-between gap-2 rounded-xl border border-shafx-accent/20 bg-shafx-accent/[.04] px-3 py-2"><span className="flex items-center gap-2 text-[8px]"><Sparkles className="h-3 w-3 text-shafx-accent" /><b>SHARFX setup</b><span className="text-shafx-textMuted">{aiSetup.direction} · {aiSetup.confidence}%</span></span><span className="font-mono text-[8px] text-shafx-textMuted">Entry {aiSetup.entryPrice}</span></div>}

        {state === 'quoting' && <div className="flex items-center gap-2 rounded-xl border border-shafx-accent/20 bg-shafx-accent/[.05] p-3 text-[8px] text-shafx-textMuted"><LoaderCircle className="h-4 w-4 animate-spin text-shafx-accent" /><span><b className="text-shafx-text">Getting live quote…</b> Deriv is validating this market and trade size.</span></div>}

        {quote && <div className="rounded-2xl border border-shafx-accent/25 bg-shafx-accent/[.05] p-3"><div className="flex items-center justify-between gap-2"><div><div className="text-[9px] font-bold tracking-[.12em]">ORDER PREVIEW</div><div className="mt-0.5 text-[7px] text-shafx-textMuted">Nothing is purchased until you confirm.</div></div><span className={"rounded-md px-2 py-1 font-mono text-[8px] font-bold " + (quote.side === 'BUY' ? 'bg-shafx-success/10 text-shafx-success' : 'bg-shafx-danger/10 text-shafx-danger')}>{quote.side === 'BUY' ? 'BUY UP' : 'SELL DOWN'}</span></div><div className="mt-2 grid grid-cols-3 gap-1.5"><div className="rounded-lg bg-shafx-bg px-2 py-2"><span className="block text-[7px] text-shafx-textMuted">Stake</span><b className="font-mono text-[9px]">{quote.stake.toFixed(2)}</b></div><div className="rounded-lg bg-shafx-bg px-2 py-2"><span className="block text-[7px] text-shafx-textMuted">Multiplier</span><b className="font-mono text-[9px]">{quote.multiplier}×</b></div><div className="rounded-lg bg-shafx-bg px-2 py-2"><span className="block text-[7px] text-shafx-textMuted">Profit</span><b className="font-mono text-[9px] text-shafx-success">{quotePotentialProfit !== null ? (quotePotentialProfit >= 0 ? '+' : '') + quotePotentialProfit.toFixed(2) : '—'}</b></div></div><button type="button" onClick={() => void confirmBuy()} disabled={state === 'buying' || state === 'opened'} className="mt-2.5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-shafx-primary px-4 text-[9px] font-bold text-white disabled:opacity-60">{state === 'buying' ? <><LoaderCircle className="h-4 w-4 animate-spin" />PLACING TRADE…</> : state === 'opened' ? <><CheckCircle2 className="h-4 w-4" />TRADE OPEN</> : <>CONFIRM {quote.side === 'BUY' ? 'BUY UP' : 'SELL DOWN'} <ArrowUpRight className="h-3.5 w-3.5" /></>}</button></div>}

        {!connection && <div className="rounded-xl border border-shafx-danger/20 bg-shafx-danger/10 p-2.5 text-[8px] text-shafx-danger">Connect a Deriv demo account before placing a manual trade.</div>}
        {stakeValue > accountBalance && <div className="text-[8px] text-shafx-danger">Stake exceeds the selected account balance.</div>}
        {stopValue > stakeValue && <div className="text-[8px] text-shafx-danger">Max loss cannot exceed the opening stake.</div>}
        {state === 'opened' && <div className="rounded-xl border border-shafx-success/25 bg-shafx-success/[.05] p-3 text-[8px] text-shafx-success"><div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" />Trade opened through Deriv</div><div className="mt-1 text-shafx-textMuted">Contract ID: <span className="font-mono text-shafx-text">{openedContractId || 'assigned by Deriv'}</span></div></div>}
        {state === 'error' && <div className="rounded-xl border border-shafx-danger/25 bg-shafx-danger/10 p-3"><div className="flex items-center gap-2 text-[9px] font-bold text-shafx-danger"><AlertCircle className="h-4 w-4" />Trade step failed</div><div className="mt-1 break-words text-[8px] leading-4 text-shafx-danger">{error}</div></div>}
        {!quote && state !== 'quoting' && state !== 'error' && <div className="flex items-center gap-2 px-1 text-[7px] leading-4 text-shafx-textMuted"><Clock3 className="h-3 w-3 shrink-0" /><span><b className="text-shafx-text">SHARFX flow:</b> choose Buy/Sell → live quote → confirm → open position. The chart timeframe (M5) is separate from the broker contract duration.</span></div>}
      </div>
    </section>
  )
}
