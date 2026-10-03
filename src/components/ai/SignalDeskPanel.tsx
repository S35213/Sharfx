import React from 'react'
import { BrainCircuit, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react'
import type { MarketAnalysis } from '../../types'
import type { SetupCandidate } from '../../engine/setup/types'

interface Props {
  symbol: string
  timeframe: string
  currentPrice: number
  analysis: MarketAnalysis
  setup?: SetupCandidate | null
  accountBalance: number
  accountCurrency: string
  connected: boolean
  onReviewSetup?: (setup?: SetupCandidate | null) => void
}

export const SignalDeskPanel: React.FC<Props> = ({
  symbol,
  timeframe,
  currentPrice,
  analysis,
  setup,
  accountBalance,
  accountCurrency,
  connected,
  onReviewSetup,
}) => (
  <section className="space-y-4 rounded-2xl border border-shafx-border bg-shafx-surface p-4 shadow-[0_14px_36px_rgba(0,0,0,.16)]">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-shafx-accent" />
          <h3 className="text-sm font-semibold">SHAFX Signal Desk</h3>
          <span className="rounded-md border border-shafx-accent/25 bg-shafx-accent/10 px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-shafx-accent">REBUILD</span>
        </div>
        <p className="mt-1 text-[9px] leading-4 text-shafx-textMuted">The SHAFX core idea stays: read the market, explain the setup, let the trader review it, then send a broker-native order.</p>
      </div>
      <span className="rounded-full border border-shafx-warning/25 bg-shafx-warning/10 px-2 py-1 font-mono text-[8px] font-bold text-shafx-warning">AUTO-TRADE PAUSED</span>
    </div>

    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-xl border border-shafx-border bg-shafx-bg p-3"><span className="block text-[8px] uppercase tracking-[0.12em] text-shafx-textMuted">Market</span><strong className="mt-1 block font-mono text-sm">{symbol}</strong><span className="mt-0.5 block text-[8px] text-shafx-textMuted">{timeframe} • {currentPrice.toFixed(5)}</span></div>
      <div className="rounded-xl border border-shafx-border bg-shafx-bg p-3"><span className="block text-[8px] uppercase tracking-[0.12em] text-shafx-textMuted">Deriv account</span><strong className={connected ? 'mt-1 block text-sm text-shafx-success' : 'mt-1 block text-sm text-shafx-danger'}>{connected ? 'Connected' : 'Not connected'}</strong><span className="mt-0.5 block font-mono text-[8px] text-shafx-textMuted">{accountCurrency} {accountBalance.toFixed(2)}</span></div>
    </div>

    <div className="grid grid-cols-3 gap-2 text-[9px]">
      <div className="rounded-xl border border-shafx-border bg-shafx-bg p-2.5"><span className="block text-shafx-textMuted">Bias</span><b className={analysis.bias === 'Bullish' ? 'text-shafx-success' : analysis.bias === 'Bearish' ? 'text-shafx-danger' : 'text-shafx-text'}>{analysis.bias}</b></div>
      <div className="rounded-xl border border-shafx-border bg-shafx-bg p-2.5"><span className="block text-shafx-textMuted">Structure</span><b>{analysis.structure.type}</b></div>
      <div className="rounded-xl border border-shafx-border bg-shafx-bg p-2.5"><span className="block text-shafx-textMuted">Liquidity zones</span><b>{analysis.liquidity.zones.length}</b></div>
    </div>

    <div className="rounded-xl border border-shafx-border bg-shafx-bg/70 p-3">
      <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-shafx-textMuted"><LockKeyhole className="h-3.5 w-3.5" />Execution boundary</div>
      <p className="mt-2 text-[9px] leading-4 text-shafx-textMuted">The old scanning bot is no longer allowed to open broker trades in this testing project. SHAFX intelligence is still available for review; the new Deriv bridge is tested separately so a broker error cannot be hidden behind a strategy gate.</p>
    </div>

    {setup ? (
      <div className="rounded-xl border border-shafx-accent/25 bg-shafx-accent/[0.05] p-3">
        <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-shafx-accent"><Sparkles className="h-3.5 w-3.5" />Current SHAFX setup</div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-[9px]">
          <div><span className="block text-shafx-textMuted">Direction</span><b className={setup.direction === 'BUY' ? 'text-shafx-success' : 'text-shafx-danger'}>{setup.direction}</b></div>
          <div><span className="block text-shafx-textMuted">Confidence</span><b className="font-mono">{setup.confidence}%</b></div>
          <div><span className="block text-shafx-textMuted">Entry</span><b className="font-mono">{setup.entryPrice}</b></div>
        </div>
        <button type="button" onClick={() => onReviewSetup?.(setup)} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-shafx-success/25 bg-shafx-success/[0.06] text-[9px] font-semibold text-shafx-success"><ShieldCheck className="h-3.5 w-3.5" />Review setup in Manual Trade</button>
      </div>
    ) : (
      <div className="rounded-xl border border-shafx-border bg-shafx-bg p-3 text-[9px] text-shafx-textMuted">No active SHAFX setup is being promoted to execution. Use Market Analysis / AI to review a setup, then the Manual Trade panel handles the Deriv proposal.</div>
    )}
  </section>
)
