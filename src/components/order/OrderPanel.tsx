import React, { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowDownCircle, ArrowUpCircle, CheckCircle2, CircleDollarSign, Clock3, ShieldCheck, Sparkles } from 'lucide-react'
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

type QuoteState = 'idle' | 'quoting' | 'quoted' | 'buying' | 'opened' | 'error'

const toPositiveNumber = (value: string): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

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
  const [stopLossAmount, setStopLossAmount] = useState('')
  const [takeProfitAmount, setTakeProfitAmount] = useState('')
  const [quote, setQuote] = useState<DerivProposalQuote | null>(null)
  const [state, setState] = useState<QuoteState>('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    setSide(aiSetup?.direction ?? 'BUY')
    setQuote(null)
    setState('idle')
    setError('')
  }, [symbol, aiSetup?.direction])

  const stakeValue = toPositiveNumber(stake)
  const multiplierValue = toPositiveNumber(multiplier)
  const stopValue = toPositiveNumber(stopLossAmount)
  const takeValue = toPositiveNumber(takeProfitAmount)
  const accountHasMinimum = Number.isFinite(accountBalance) && accountBalance >= 1
  const stakeFitsBalance = Number.isFinite(accountBalance) && stakeValue >= 1 && stakeValue <= accountBalance + 1e-8
  const protectionValid = stopValue >= 0 && stopValue <= stakeValue + 1e-8 && takeValue >= 0
  const inputsValid = Boolean(connection) && accountHasMinimum && stakeFitsBalance && Number.isFinite(multiplierValue) && multiplierValue > 0 && multiplierValue <= 10000 && protectionValid

  const selectedEntry = side === 'BUY' ? askPrice : bidPrice
  const quotePotentialProfit = useMemo(() => {
    if (!quote || !Number.isFinite(quote.payout)) return null
    return Number((Number(quote.payout) - quote.stake).toFixed(2))
  }, [quote])

  const applyShafxRiskGuard = (): void => {
    if (!Number.isFinite(stakeValue) || stakeValue < 1) return
    setStopLossAmount(Math.max(0.01, stakeValue * 0.5).toFixed(2))
    setTakeProfitAmount(Math.max(0.01, stakeValue).toFixed(2))
  }

  const requestQuote = async (): Promise<void> => {
    if (!connection || !inputsValid) return
    setState('quoting')
    setError('')
    setQuote(null)
    try {
      const nextQuote = await getDerivQuote({
        connection,
        symbol,
        side,
        stake: stakeValue,
        currency: accountCurrency,
        multiplier: multiplierValue,
        stopLossAmount: stopValue > 0 ? stopValue : undefined,
        takeProfitAmount: takeValue > 0 ? takeValue : undefined,
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
      setState('opened')
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : 'Unable to buy the Deriv contract.')
    }
  }

  const busy = state === 'quoting' || state === 'buying'
  const buttonLabel = state === 'quoting' ? 'Getting Deriv quote…' : 'GET DERIV QUOTE'
  const accountLabel = connection ? (connection.environment === 'demo' ? 'DEMO' : 'REAL') : 'NOT CONNECTED'

  return (
    <section className="space-y-4 rounded-2xl border border-shafx-border bg-shafx-surface p-4 shadow-[0_14px_36px_rgba(0,0,0,.16)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Manual Trade</h3>
            <span className="rounded-md border border-shafx-accent/25 bg-shafx-accent/10 px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-shafx-accent">Deriv Multiplier</span>
          </div>
          <p className="mt-1 text-[10px] leading-4 text-shafx-textMuted">SHAFX analyzes the market; Deriv validates the trade. No bot gate is required for a manual order.</p>
        </div>
        <span className={connection ? 'rounded-full border border-shafx-success/25 bg-shafx-success/10 px-2 py-1 font-mono text-[8px] font-bold text-shafx-success' : 'rounded-full border border-shafx-danger/25 bg-shafx-danger/10 px-2 py-1 font-mono text-[8px] font-bold text-shafx-danger'}>{accountLabel}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-shafx-border bg-shafx-bg p-3">
          <span className="block text-[8px] font-semibold uppercase tracking-[0.12em] text-shafx-textMuted">Account</span>
          <strong className="mt-1 block font-mono text-sm tabular-nums">{accountCurrency} {Number.isFinite(accountBalance) ? accountBalance.toFixed(2) : '0.00'}</strong>
        </div>
        <div className="rounded-xl border border-shafx-border bg-shafx-bg p-3">
          <span className="block text-[8px] font-semibold uppercase tracking-[0.12em] text-shafx-textMuted">{symbol} price</span>
          <strong className="mt-1 block font-mono text-sm tabular-nums">{selectedEntry.toFixed(symbolSpec.pricePrecision)}</strong>
        </div>
      </div>

      {aiSetup && (
        <div className="rounded-xl border border-shafx-accent/25 bg-shafx-accent/[0.06] p-3">
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-shafx-accent"><Sparkles className="h-3.5 w-3.5" />SHAFX setup</div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[9px]">
            <div><span className="block text-shafx-textMuted">Direction</span><b className={aiSetup.direction === 'BUY' ? 'text-shafx-success' : 'text-shafx-danger'}>{aiSetup.direction}</b></div>
            <div><span className="block text-shafx-textMuted">Entry</span><b className="font-mono">{aiSetup.entryPrice}</b></div>
            <div><span className="block text-shafx-textMuted">Confidence</span><b className="font-mono">{aiSetup.confidence}%</b></div>
          </div>
          <div className="mt-2 flex items-start gap-2 text-[8px] leading-4 text-shafx-textMuted"><ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-shafx-success" />The setup keeps its price levels for analysis. Deriv Multiplier protection below is monetary (stake-based), so SHAFX does not pretend a Forex lot/price stop is the same broker control.</div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => { setSide('BUY'); setQuote(null); setState('idle') }} aria-pressed={side === 'BUY'} className={side === 'BUY' ? 'min-h-16 rounded-xl bg-shafx-success px-3 text-left text-white' : 'min-h-16 rounded-xl border border-shafx-success/30 bg-shafx-bg px-3 text-left text-shafx-success'}>
          <span className="flex items-center justify-between gap-2 text-xs font-semibold"><span className="flex items-center gap-1.5"><ArrowUpCircle className="h-4 w-4" />BUY</span><span className="font-mono text-[9px] opacity-80">ASK</span></span>
          <span className="mt-1 block font-mono text-sm tabular-nums">{askPrice.toFixed(symbolSpec.pricePrecision)}</span>
        </button>
        <button type="button" onClick={() => { setSide('SELL'); setQuote(null); setState('idle') }} aria-pressed={side === 'SELL'} className={side === 'SELL' ? 'min-h-16 rounded-xl bg-shafx-danger px-3 text-left text-white' : 'min-h-16 rounded-xl border border-shafx-danger/30 bg-shafx-bg px-3 text-left text-shafx-danger'}>
          <span className="flex items-center justify-between gap-2 text-xs font-semibold"><span className="flex items-center gap-1.5"><ArrowDownCircle className="h-4 w-4" />SELL</span><span className="font-mono text-[9px] opacity-80">BID</span></span>
          <span className="mt-1 block font-mono text-sm tabular-nums">{bidPrice.toFixed(symbolSpec.pricePrecision)}</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="mb-1 block text-[10px] text-shafx-textMuted">Stake</span><div className="relative"><CircleDollarSign className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-shafx-textMuted" /><input type="number" min="1" step="0.01" value={stake} onChange={(e) => { setStake(e.target.value); setQuote(null); setState('idle') }} className="w-full rounded-lg border border-shafx-border bg-shafx-bg py-2.5 pl-8 pr-2 font-mono text-sm focus:border-shafx-primary focus:outline-none" /></div></label>
        <label className="block"><span className="mb-1 block text-[10px] text-shafx-textMuted">Multiplier</span><input type="number" min="1" max="10000" step="1" value={multiplier} onChange={(e) => { setMultiplier(e.target.value); setQuote(null); setState('idle') }} className="w-full rounded-lg border border-shafx-border bg-shafx-bg px-2 py-2.5 font-mono text-sm focus:border-shafx-primary focus:outline-none" /><span className="mt-1 block text-[8px] text-shafx-textMuted">Deriv validates the allowed value when the proposal is requested.</span></label>
      </div>

      <div className="rounded-xl border border-shafx-border bg-shafx-bg/70 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-semibold">Risk guard</div>
            <div className="mt-0.5 text-[8px] text-shafx-textMuted">Optional monetary protection for the Multiplier contract.</div>
          </div>
          <button type="button" onClick={applyShafxRiskGuard} className="rounded-lg border border-shafx-accent/25 bg-shafx-accent/10 px-2.5 py-2 text-[8px] font-semibold text-shafx-accent">Use SHAFX guard</button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block"><span className="mb-1 block text-[10px] text-shafx-textMuted">Max loss ({accountCurrency})</span><input type="number" min="0" step="0.01" value={stopLossAmount} onChange={(e) => { setStopLossAmount(e.target.value); setQuote(null); setState('idle') }} placeholder="Optional" className="w-full rounded-lg border border-shafx-border bg-shafx-bg px-2 py-2.5 font-mono text-sm text-shafx-danger focus:border-shafx-primary focus:outline-none" /></label>
          <label className="block"><span className="mb-1 block text-[10px] text-shafx-textMuted">Target profit ({accountCurrency})</span><input type="number" min="0" step="0.01" value={takeProfitAmount} onChange={(e) => { setTakeProfitAmount(e.target.value); setQuote(null); setState('idle') }} placeholder="Optional" className="w-full rounded-lg border border-shafx-border bg-shafx-bg px-2 py-2.5 font-mono text-sm text-shafx-success focus:border-shafx-primary focus:outline-none" /></label>
        </div>
        {stopValue > stakeValue && <div className="mt-2 text-[8px] text-shafx-danger">Max loss cannot exceed the opening stake.</div>}
      </div>

      {!connection && <div className="flex items-start gap-2 rounded-lg border border-shafx-danger/20 bg-shafx-danger/10 p-3 text-[9px] text-shafx-danger"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Connect a Deriv demo account before requesting a broker proposal.</div>}
      {connection && !accountHasMinimum && <div className="flex items-start gap-2 rounded-lg border border-shafx-danger/20 bg-shafx-danger/10 p-3 text-[9px] text-shafx-danger"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Deriv Multiplier testing starts at a 1 {accountCurrency} stake. Your current account balance is below that.</div>}
      {stakeValue > accountBalance && <div className="text-[8px] text-shafx-danger">Stake exceeds the selected account balance.</div>}

      {quote && (
        <div className="rounded-2xl border border-shafx-success/25 bg-shafx-success/[0.04] p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[10px] font-semibold"><CheckCircle2 className="h-4 w-4 text-shafx-success" />DERIV PROPOSAL</div>
            <span className="font-mono text-[8px] text-shafx-textMuted">{quote.contractType}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[9px]">
            <div className="rounded-lg border border-shafx-border bg-shafx-bg px-2.5 py-2"><span className="block text-shafx-textMuted">Stake</span><b className="font-mono">{quote.stake.toFixed(2)} {quote.currency}</b></div>
            <div className="rounded-lg border border-shafx-border bg-shafx-bg px-2.5 py-2"><span className="block text-shafx-textMuted">Multiplier</span><b className="font-mono">{quote.multiplier}×</b></div>
            <div className="rounded-lg border border-shafx-border bg-shafx-bg px-2.5 py-2"><span className="block text-shafx-textMuted">Ask / buy cost</span><b className="font-mono">{quote.askPrice.toFixed(2)} {quote.currency}</b></div>
            <div className="rounded-lg border border-shafx-border bg-shafx-bg px-2.5 py-2"><span className="block text-shafx-textMuted">Commission</span><b className="font-mono">{typeof quote.commission === 'number' ? quote.commission.toFixed(2) : '—'} {quote.currency}</b></div>
            <div className="rounded-lg border border-shafx-border bg-shafx-bg px-2.5 py-2"><span className="block text-shafx-textMuted">Potential payout</span><b className="font-mono">{typeof quote.payout === 'number' ? quote.payout.toFixed(2) : '—'} {quote.currency}</b></div>
            <div className="rounded-lg border border-shafx-border bg-shafx-bg px-2.5 py-2"><span className="block text-shafx-textMuted">Potential profit</span><b className="font-mono text-shafx-success">{quotePotentialProfit !== null ? (quotePotentialProfit >= 0 ? '+' : '') + quotePotentialProfit.toFixed(2) : '—'} {quote.currency}</b></div>
          </div>
          <div className="mt-3 rounded-lg border border-shafx-border bg-shafx-bg/70 p-2.5 text-[8px] text-shafx-textMuted">
            <div className="font-semibold uppercase tracking-[0.12em] text-shafx-text">Broker checks passed</div>
            <div className="mt-1">✓ Account • ✓ Market • ✓ Contract • ✓ Proposal</div>
            <div className="mt-1 font-mono">Proposal ID: {quote.proposalId}</div>
          </div>
          <button type="button" onClick={confirmBuy} disabled={state === 'buying' || state === 'opened'} className={state === 'opened' ? 'mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-shafx-success/20 text-[10px] font-semibold text-shafx-success' : 'mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-shafx-success px-3 text-[10px] font-semibold text-white disabled:opacity-60'}>
            {state === 'buying' ? 'Confirming with Deriv…' : state === 'opened' ? 'Trade opened' : 'CONFIRM ' + quote.side}
          </button>
        </div>
      )}

      {state === 'opened' && <div className="rounded-xl border border-shafx-success/25 bg-shafx-success/[0.05] p-3 text-[9px] text-shafx-success"><div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" />SHAFX manual trade opened through Deriv.</div><div className="mt-1 flex items-center gap-1.5 text-shafx-textMuted"><Clock3 className="h-3 w-3" />The contract now appears in Open Positions below the chart.</div></div>}
      {state === 'error' && <div className="flex items-start gap-2 rounded-xl border border-shafx-danger/20 bg-shafx-danger/10 p-3 text-[9px] text-shafx-danger"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><div><div className="font-semibold">Trade step failed</div><div className="mt-0.5 break-words">{error}</div></div></div>}

      <button type="button" onClick={() => void requestQuote()} disabled={busy || !inputsValid || state === 'opened'} className={inputsValid && !busy && state !== 'opened' ? 'flex min-h-12 w-full items-center justify-center rounded-xl bg-shafx-primary px-3 text-[10px] font-semibold text-white shadow-[0_10px_26px_rgba(41,98,255,.18)] disabled:opacity-50' : 'flex min-h-12 w-full items-center justify-center rounded-xl bg-shafx-border px-3 text-[10px] font-semibold text-shafx-textMuted disabled:opacity-60'}>
        {buttonLabel}
      </button>

      {!quote && state !== 'error' && <div className="rounded-lg border border-shafx-border bg-shafx-bg/60 p-2.5 text-[8px] leading-4 text-shafx-textMuted">Flow: <b className="text-shafx-text">Connect → validate account → validate market → request Deriv proposal → confirm → buy → contract ID.</b></div>}
    </section>
  )
}
