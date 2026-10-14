import React, { useMemo } from 'react'
import { Activity, BrainCircuit, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'
import type { Timeframe } from '../../types'
import { useSignalBotMarketData, type SignalBotMarketSource } from '../../engine/bot/useSignalBotMarketData'
import { buildSignalRadar } from '../../engine/bot/signalRadar'

interface Props {
  symbol: string
  timeframe: Timeframe
  marketSource: SignalBotMarketSource | null
  onReviewSetup?: (setup?: import('../../engine/setup/types').SetupCandidate | null) => void
}

const sourceLabel = (source: SignalBotMarketSource | null): string => {
  if (source?.providerId === 'ctrader') return 'cTrader candles'
  if (source?.providerId === 'deriv') return 'Deriv public candles'
  return source?.providerId ? source.providerId + ' candles' : 'No provider selected'
}

export const SignalDeskPanel: React.FC<Props> = ({ symbol, timeframe, marketSource, onReviewSetup }) => {
  const marketData = useSignalBotMarketData(symbol, marketSource)
  const radarFrames = marketData.frames
  const scannerPrice = radarFrames[timeframe]?.[radarFrames[timeframe]!.length - 1]?.close
    ?? radarFrames.M1?.[radarFrames.M1.length - 1]?.close
    ?? 0
  const radar = useMemo(() => buildSignalRadar(radarFrames, symbol, scannerPrice), [radarFrames, symbol, scannerPrice])
  const lastUpdated = marketData.updatedAt === null
    ? '—'
    : new Date(marketData.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const statusLabel = marketData.status === 'ready'
    ? 'SCANNING'
    : marketData.status === 'partial'
      ? 'PARTIAL DATA'
      : marketData.status === 'loading'
        ? 'LOADING'
        : marketData.status === 'unavailable'
          ? 'UNAVAILABLE'
          : 'DATA ERROR'
  const statusTone = marketData.status === 'ready'
    ? 'border-shafx-success/25 bg-shafx-success/10 text-shafx-success'
    : marketData.status === 'partial'
      ? 'border-shafx-warning/25 bg-shafx-warning/10 text-shafx-warning'
      : 'border-shafx-border bg-shafx-bg text-shafx-textMuted'

  return (
    <section className="space-y-4 rounded-2xl border border-shafx-border bg-shafx-surface p-4 shadow-[0_14px_36px_rgba(0,0,0,.16)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-shafx-accent" />
            <h3 className="text-sm font-semibold">SHAFX Signal Bot</h3>
            <span className="rounded-md border border-shafx-accent/25 bg-shafx-accent/10 px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-shafx-accent">INDEPENDENT</span>
          </div>
          <p className="mt-1 text-[9px] leading-4 text-shafx-textMuted">Read-only market scanner. It never opens, modifies or closes trades and does not feed the Trade Bot.</p>
        </div>
        <span className={'rounded-full border px-2 py-1 font-mono text-[8px] font-bold ' + statusTone}>{statusLabel}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-shafx-border bg-shafx-bg p-3">
          <span className="block text-[8px] uppercase tracking-[0.12em] text-shafx-textMuted">Market</span>
          <strong className="mt-1 block font-mono text-sm">{symbol}</strong>
          <span className="mt-0.5 block text-[8px] text-shafx-textMuted">{sourceLabel(marketSource)} • {timeframe}</span>
        </div>
        <div className="rounded-xl border border-shafx-border bg-shafx-bg p-3">
          <span className="block text-[8px] uppercase tracking-[0.12em] text-shafx-textMuted">Scanner price</span>
          <strong className="mt-1 block font-mono text-sm">{scannerPrice > 0 ? scannerPrice.toFixed(symbol.includes('JPY') ? 3 : 5) : '—'}</strong>
          <span className="mt-0.5 block text-[8px] text-shafx-textMuted">Updated {lastUpdated}</span>
        </div>
      </div>

      <div className="rounded-xl border border-shafx-border bg-shafx-bg/70 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-shafx-textMuted"><Activity className="h-3.5 w-3.5" /> Signal Radar</div>
          <span className="font-mono text-[8px] font-bold text-shafx-accent">{radar.alignment}% ALIGN</span>
        </div>
        <div className="mt-1 text-[8px] text-shafx-textMuted">{radar.scanned.length}/8 timeframes have enough candles • score is not a guaranteed win probability</div>
        {marketData.error && (
          <div role="status" className="mt-2 rounded-lg border border-shafx-warning/25 bg-shafx-warning/[0.06] px-2.5 py-2 text-[8px] leading-4 text-shafx-textMuted">{marketData.error}</div>
        )}
        <div className="mt-3 space-y-1.5">
          {radar.opportunities.map((opportunity, index) => (
            <div key={opportunity.timeframe} className="flex items-center gap-2 rounded-lg border border-shafx-border bg-shafx-bg px-2.5 py-2">
              <span className="font-mono text-[8px] font-bold">{index + 1}. {opportunity.timeframe}</span>
              <span className={opportunity.direction === 'BUY' ? 'font-mono text-[8px] font-bold text-shafx-success' : 'font-mono text-[8px] font-bold text-shafx-danger'}>{opportunity.direction}</span>
              <span className="ml-auto font-mono text-[8px] text-shafx-textMuted">Score {opportunity.signalStrength}</span>
              <button type="button" onClick={() => onReviewSetup?.(opportunity.setup)} className="min-h-8 rounded-md border border-shafx-accent/25 px-2 text-[8px] font-semibold text-shafx-accent hover:bg-shafx-accent/10">Review</button>
            </div>
          ))}
          {!radar.opportunities.length && (
            <div className="rounded-lg border border-shafx-border bg-shafx-bg px-2.5 py-2 text-[8px] text-shafx-textMuted">
              {marketData.status === 'loading'
                ? 'WAIT — loading this provider’s timeframe histories.'
                : marketData.status === 'unavailable'
                  ? 'WAIT — a supported provider/account selection is required.'
                  : marketData.status === 'error'
                    ? 'WAIT — no reliable timeframe history is available. No signal has been invented.'
                    : 'WAIT — no qualified setup across the available timeframes.'}
            </div>
          )}
        </div>
      </div>

      {radar.botPlan.opportunity ? (
        <div className="rounded-xl border border-shafx-accent/25 bg-shafx-accent/[0.05] p-3">
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-shafx-accent"><Sparkles className="h-3.5 w-3.5" /> Highest-ranked setup</div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[9px]">
            <div><span className="block text-shafx-textMuted">Direction</span><b className={radar.botPlan.opportunity.direction === 'BUY' ? 'text-shafx-success' : 'text-shafx-danger'}>{radar.botPlan.opportunity.direction}</b></div>
            <div><span className="block text-shafx-textMuted">Signal timeframe</span><b className="font-mono">{radar.botPlan.analysisTimeframe ?? '—'}</b></div>
            <div><span className="block text-shafx-textMuted">Score</span><b className="font-mono">{radar.botPlan.opportunity.signalStrength}/100</b></div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[9px]">
            <div><span className="block text-shafx-textMuted">Entry reference</span><b className="font-mono">{radar.botPlan.opportunity.setup.entryPrice}</b></div>
            <div><span className="block text-shafx-textMuted">Stop reference</span><b className="font-mono text-shafx-danger">{radar.botPlan.opportunity.setup.stopLoss}</b></div>
            <div><span className="block text-shafx-textMuted">Target reference</span><b className="font-mono text-shafx-success">{radar.botPlan.opportunity.setup.takeProfit}</b></div>
          </div>
          <button type="button" onClick={() => onReviewSetup?.(radar.botPlan.opportunity?.setup)} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-shafx-success/25 bg-shafx-success/[0.06] text-[9px] font-semibold text-shafx-success"><ShieldCheck className="h-3.5 w-3.5" />Review setup in Manual Trade</button>
        </div>
      ) : (
        <div className="rounded-xl border border-shafx-border bg-shafx-bg p-3 text-[9px] text-shafx-textMuted">No qualified signal is being promoted. The scanner will wait for validated market conditions.</div>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-shafx-border bg-shafx-bg/70 p-3">
        <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0 text-shafx-textMuted" />
        <p className="text-[8px] leading-4 text-shafx-textMuted">Independent data loop • refresh target 15 seconds • source: {sourceLabel(marketSource)}. If this scanner fails, the separate Trade Bot remains unaffected.</p>
      </div>
    </section>
  )
}
