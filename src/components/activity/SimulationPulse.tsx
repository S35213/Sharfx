import React from 'react'
import { Activity, Bot, Radio, TrendingDown, TrendingUp } from 'lucide-react'
import type { TradeOrder } from '../../types'
import { buildSimulationPulseStats } from './simulationPulse'

interface Props {
  openPositions: TradeOrder[]
  tradeHistory: TradeOrder[]
  botOrderIds: string[]
  botRunning: boolean
}

const formatTime = (value: string): string => {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export const SimulationPulse: React.FC<Props> = ({ openPositions, tradeHistory, botOrderIds, botRunning }) => {
  const stats = buildSimulationPulseStats({ openPositions, tradeHistory, botOrderIds, botRunning })
  const ids = new Set(botOrderIds)
  const activity = [
    ...openPositions.filter((trade) => ids.has(trade.id)).map((trade) => ({ trade, state: 'OPEN' as const, time: trade.openTime })),
    ...tradeHistory.filter((trade) => ids.has(trade.id)).map((trade) => ({ trade, state: 'CLOSED' as const, time: trade.closeTime ?? trade.openTime })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 5)

  return (
    <section className="rounded-2xl border border-shafx-border bg-shafx-surface p-3.5 text-sm shadow-[0_14px_36px_rgba(0,0,0,.22)] sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-shafx-accent/10 text-shafx-accent">
            <Radio className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-semibold">Simulation pulse</h3>
            <p className="text-[10px] text-shafx-textMuted">Live simulator activity from this SHAFX session.</p>
          </div>
        </div>
        <span className="rounded-full border border-shafx-success/20 bg-shafx-success/5 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-shafx-success">SIMULATED</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric icon={Bot} label="Bots running" value={String(stats.botRunning)} tone="accent" />
        <Metric icon={TrendingUp} label="Open bot positions" value={String(stats.openBotPositions)} tone="success" />
        <Metric icon={TrendingDown} label="Closed bot trades" value={String(stats.closedBotTrades)} tone="muted" />
        <Metric icon={Activity} label="Active simulators" value={String(stats.activeSimulatorSessions)} tone="info" />
      </div>

      <div className="mt-3 rounded-xl border border-shafx-border bg-shafx-bg p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-shafx-textMuted">Activity feed</div>
          <div className="text-[9px] text-shafx-textMuted">{botRunning ? 'Scanner online' : 'Scanner idle'}</div>
        </div>
        <div className="mt-2 space-y-1.5">
          {activity.length === 0 ? (
            <div className="rounded-lg border border-dashed border-shafx-border px-3 py-3 text-[10px] text-shafx-textMuted">Start the simulator bot to see real bot open/close events here.</div>
          ) : activity.map(({ trade, state, time }) => (
            <div key={trade.id} className="flex items-center gap-2 rounded-lg border border-shafx-border/80 bg-shafx-surface/60 px-2.5 py-2">
              <span className={state === 'OPEN' ? 'rounded-md bg-shafx-success/10 px-1.5 py-1 text-[8px] font-bold text-shafx-success' : 'rounded-md bg-shafx-accent/10 px-1.5 py-1 text-[8px] font-bold text-shafx-accent'}>{state}</span>
              <span className={trade.type === 'BUY' ? 'text-[9px] font-semibold text-shafx-success' : 'text-[9px] font-semibold text-shafx-danger'}>{trade.type}</span>
              <span className="min-w-0 flex-1 truncate text-[10px] text-shafx-text">{trade.symbol} • {trade.lotSize.toFixed(2)} lots</span>
              <span className="text-[9px] tabular text-shafx-textMuted">{formatTime(time)}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 text-[9px] leading-4 text-shafx-textMuted">The session counter is real for this signed-in simulator session. A cross-user SHAFX network presence count is not fabricated and can be connected later to a shared presence service.</p>
    </section>
  )
}

function Metric({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string; tone: 'accent' | 'success' | 'muted' | 'info' }) {
  const toneClass = tone === 'accent' ? 'text-shafx-accent' : tone === 'success' ? 'text-shafx-success' : tone === 'info' ? 'text-shafx-info' : 'text-shafx-text'
  return <div className="rounded-xl border border-shafx-border bg-shafx-bg p-2.5"><div className="flex items-center gap-1.5 text-[9px] text-shafx-textMuted"><Icon className={"h-3.5 w-3.5 " + toneClass} />{label}</div><div className={"mt-1.5 font-mono text-base font-semibold tabular " + toneClass}>{value}</div></div>
}
