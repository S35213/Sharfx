import React, { useEffect, useMemo, useState } from 'react'
import { Activity, CircleStop, Play, ShieldCheck } from 'lucide-react'
import type { SymbolSpec, Timeframe } from '../../types'
import type { SetupCandidate } from '../../engine/setup/types'
import { evaluateTradeBotDecision } from '../../engine/bot/tradeBotDecision'
import { useTradeBotMarketData, type TradeBotMarketSource } from '../../engine/bot/useTradeBotMarketData'
import { formatCurrency, formatPrice } from '../../lib/format'

interface Props {
  symbol: string
  timeframe: Timeframe
  marketSource: TradeBotMarketSource | null
  accountBalance: number
  accountCurrency: string
  symbolSpec: SymbolSpec
  onReviewSetup?: (setup?: SetupCandidate | null) => void
}

export const TradeBotPanel: React.FC<Props> = ({
  symbol, timeframe, marketSource, accountBalance, accountCurrency, symbolSpec, onReviewSetup,
}) => {
  const [running, setRunning] = useState(false)
  const [cycles, setCycles] = useState(0)
  const market = useTradeBotMarketData(symbol, marketSource, running)
  const decision = useMemo(() => evaluateTradeBotDecision({
    frames: market.frames,
    symbol,
    timeframe,
    accountBalance,
    accountCurrency,
    symbolSpec,
  }), [market.frames, symbol, timeframe, accountBalance, accountCurrency, symbolSpec])

  useEffect(() => {
    if (running && market.updatedAt !== null) setCycles((previous) => previous + 1)
  }, [running, market.updatedAt])

  const statusLabel = !running ? 'STOPPED' : market.status === 'ready' ? 'MONITORING' : market.status === 'partial' ? 'PARTIAL DATA' : market.status === 'loading' ? 'LOADING' : market.status === 'unavailable' ? 'BLOCKED' : 'DATA ERROR'
  const statusTone = decision.status === 'READY' && running
    ? 'border-shafx-success/30 bg-shafx-success/10 text-shafx-success'
    : decision.status === 'BLOCKED'
      ? 'border-shafx-danger/30 bg-shafx-danger/10 text-shafx-danger'
      : 'border-shafx-border bg-shafx-bg text-shafx-textMuted'
  const updatedAt = market.updatedAt ? new Date(market.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'
  const canStart = marketSource?.providerId === 'ctrader' &&
    marketSource.environment === 'demo' &&
    Boolean(marketSource.connectionId && marketSource.accountId) &&
    accountBalance > 0

  const start = (): void => {
    setCycles(0)
    setRunning(true)
  }
  const stop = (): void => setRunning(false)

  return (
    <section className="space-y-4 rounded-2xl border border-shafx-border bg-shafx-surface p-4 shadow-[0_14px_36px_rgba(0,0,0,.16)]">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-shafx-accent" />
            <h3 className="text-sm font-semibold">SHAFX Trade Bot</h3>
            <span className="rounded-md border border-shafx-accent/25 bg-shafx-accent/10 px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-shafx-accent">INDEPENDENT</span>
          </div>
          <p className="mt-1 text-[9px] leading-4 text-shafx-textMuted">Separate market loader, decision state and risk gate. No Signal Bot output is consumed.</p>
        </div>
        <span className={'rounded-full border px-2 py-1 font-mono text-[8px] font-bold ' + statusTone}>{statusLabel}</span>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-shafx-border bg-shafx-bg p-3">
          <span className="block text-[8px] uppercase tracking-[0.12em] text-shafx-textMuted">Selected market</span>
          <strong className="mt-1 block font-mono text-sm">{symbol}</strong>
          <span className="mt-0.5 block text-[8px] text-shafx-textMuted">{timeframe} • cTrader practice only</span>
        </div>
        <div className="rounded-xl border border-shafx-border bg-shafx-bg p-3">
          <span className="block text-[8px] uppercase tracking-[0.12em] text-shafx-textMuted">Risk ceiling</span>
          <strong className="mt-1 block font-mono text-sm">{formatCurrency(decision.riskBudget, accountCurrency)}</strong>
          <span className="mt-0.5 block text-[8px] text-shafx-textMuted">Lower of 0.5% balance or 10</span>
        </div>
      </div>

      {market.error && <div role="status" className="rounded-lg border border-shafx-warning/25 bg-shafx-warning/[0.06] px-3 py-2 text-[9px] leading-4 text-shafx-textMuted">{market.error}</div>}

      <div className="rounded-xl border border-shafx-border bg-shafx-bg/70 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-shafx-textMuted"><ShieldCheck className="h-3.5 w-3.5" /> Independent decision</div>
          <span className="font-mono text-[8px] font-bold text-shafx-accent">{market.updatedAt ? 'Updated ' + updatedAt : 'No data yet'}</span>
        </div>
        <div className="mt-3 rounded-lg border border-shafx-border bg-shafx-bg p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[9px] font-bold">{decision.status}</span>
            <span className="font-mono text-[8px] text-shafx-textMuted">HTF {decision.higherTimeframeBias}</span>
          </div>
          <p className="mt-2 text-[9px] leading-4 text-shafx-textMuted">{decision.reason}</p>
          {decision.setup && (
            <div className="mt-3 grid grid-cols-2 gap-2 text-[9px]">
              <div><span className="block text-shafx-textMuted">Direction</span><b className={decision.setup.direction === 'BUY' ? 'text-shafx-success' : 'text-shafx-danger'}>{decision.setup.direction}</b></div>
              <div><span className="block text-shafx-textMuted">Setup score</span><b>{decision.setup.confidence} / 100</b></div>
              <div><span className="block text-shafx-textMuted">Entry reference</span><b className="font-mono">{formatPrice(decision.setup.entryPrice, symbolSpec.pricePrecision)}</b></div>
              <div><span className="block text-shafx-textMuted">Risk / reward</span><b className="font-mono">{decision.riskPlan?.riskRewardRatio.toFixed(2) ?? '—'} : 1</b></div>
              <div><span className="block text-shafx-textMuted">Stop loss</span><b className="font-mono">{formatPrice(decision.setup.stopLoss, symbolSpec.pricePrecision)}</b></div>
              <div><span className="block text-shafx-textMuted">Take profit</span><b className="font-mono">{formatPrice(decision.setup.takeProfit, symbolSpec.pricePrecision)}</b></div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-shafx-warning/25 bg-shafx-warning/[0.05] px-3 py-2 text-[9px] leading-4 text-shafx-textMuted">
        Execution is intentionally gated in this stage. A READY decision is not an order; the manual ticket must refresh the broker quote and re-check risk before any practice trade.
      </div>

      <div className="flex flex-wrap gap-2">
        {!running ? (
          <button type="button" onClick={start} disabled={!canStart} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-shafx-accent px-3 text-[9px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">
            <Play className="h-3.5 w-3.5" /> Start analysis
          </button>
        ) : (
          <button type="button" onClick={stop} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-shafx-danger/35 bg-shafx-danger/10 px-3 text-[9px] font-bold text-shafx-danger">
            <CircleStop className="h-3.5 w-3.5" /> Stop bot
          </button>
        )}
        {decision.status === 'READY' && decision.setup && (
          <button type="button" onClick={() => onReviewSetup?.(decision.setup)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-shafx-accent/30 px-3 text-[9px] font-bold text-shafx-accent hover:bg-shafx-accent/10">
            Review in trade ticket
          </button>
        )}
      </div>
      <p className="text-[8px] leading-4 text-shafx-textMuted">Analysis cycles: {cycles} • refresh target 15 seconds • no auto-start • no automatic orders</p>
    </section>
  )
}
