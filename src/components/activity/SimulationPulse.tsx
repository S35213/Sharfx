import React, { useEffect, useRef, useState } from 'react'
import { Activity, Bot, Radio, TrendingDown, TrendingUp } from 'lucide-react'
import type { TradeOrder } from '../../types'
import { buildSimulationPulseStats } from './simulationPulse'

interface Props {
  selectedSymbol: string
  openPositions: TradeOrder[]
  tradeHistory: TradeOrder[]
  botOrderIds: string[]
  botRunning: boolean
}

const formatTime = (value: string): string => {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  const pad = (number: number, width = 2): string => String(number).padStart(width, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

type MarketTick = { id: string; time: number; side: 'BUY' | 'SELL'; lots: number; price: number }


export const SimulationPulse: React.FC<Props> = ({ selectedSymbol, openPositions, tradeHistory, botOrderIds, botRunning }) => {
  const marketOpenPositions = openPositions.filter((trade) => trade.symbol === selectedSymbol)
  const marketTradeHistory = tradeHistory.filter((trade) => trade.symbol === selectedSymbol)
  const marketBotOrderIds = new Set(botOrderIds.filter((id) => [...marketOpenPositions, ...marketTradeHistory].some((trade) => trade.id === id)))
  const stats = buildSimulationPulseStats({ openPositions: marketOpenPositions, tradeHistory: marketTradeHistory, botOrderIds: [...marketBotOrderIds], botRunning })
  const tapeScrollRef = useRef<HTMLDivElement | null>(null)
  const autoScrollTapeRef = useRef(true)
  const initialPrice = marketOpenPositions[0]?.entryPrice ?? marketTradeHistory[0]?.exitPrice ?? marketTradeHistory[0]?.entryPrice ?? 1.085
  const [marketTicks, setMarketTicks] = useState<MarketTick[]>(() => Array.from({ length: 8 }, (_, index) => ({
    id: 'seed-' + index,
    time: Date.now() - (7 - index) * 1100,
    side: index % 4 < 2 ? 'BUY' : 'SELL',
    lots: Number((0.05 + ((index * 17) % 70) / 100).toFixed(2)),
    price: Number((initialPrice + Math.sin(index * 0.9) * 0.00012).toFixed(5)),
  })))

  useEffect(() => {
    let sequence = 0
    const timer = window.setInterval(() => {
      sequence += 1
      const tapeElement = tapeScrollRef.current
      autoScrollTapeRef.current = !tapeElement || tapeElement.scrollHeight - tapeElement.scrollTop - tapeElement.clientHeight < 28
      setMarketTicks((previous) => {
        const last = previous[previous.length - 1]
        const side = sequence % 4 < 2 ? 'BUY' as const : 'SELL' as const
        const base = last?.price ?? initialPrice
        const price = Number((base + Math.sin(sequence * 0.8) * 0.00006).toFixed(5))
        const lots = Number((0.05 + ((sequence * 19) % 90) / 100).toFixed(2))
        return [...previous, { id: 'tick-' + Date.now() + '-' + sequence, time: Date.now(), side, lots, price }].slice(-8)
      })
    }, 950)
    return () => window.clearInterval(timer)
  }, [initialPrice])

  useEffect(() => {
    if (!autoScrollTapeRef.current) return
    const element = tapeScrollRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [marketTicks])
  const ids = new Set(botOrderIds)
  const activity = [
    ...marketOpenPositions.filter((trade) => ids.has(trade.id)).map((trade) => ({ trade, state: 'OPEN' as const, time: trade.openTime })),
    ...marketTradeHistory.filter((trade) => ids.has(trade.id)).map((trade) => ({ trade, state: 'CLOSED' as const, time: trade.closeTime ?? trade.openTime })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 5)

  return (
    <section className="rounded-2xl border border-shafx-border bg-shafx-surface p-3.5 text-sm shadow-[0_14px_36px_rgba(0,0,0,.22)] sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-shafx-accent/10 text-shafx-accent">
            <Radio className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-semibold">Simulation pulse • {selectedSymbol}</h3>
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
            <div className="rounded-lg border border-dashed border-shafx-border px-3 py-3 text-[10px] text-shafx-textMuted">No bot executions yet. The market tape below continues to show simulated activity.</div>
          ) : activity.map(({ trade, state, time }) => (
            <div key={trade.id + state} className="flex items-center gap-2 rounded-lg border border-shafx-border/80 bg-shafx-surface/60 px-2.5 py-2">
              <span className={state === 'OPEN' ? 'rounded-md bg-shafx-success/10 px-1.5 py-1 text-[8px] font-bold text-shafx-success' : 'rounded-md bg-shafx-accent/10 px-1.5 py-1 text-[8px] font-bold text-shafx-accent'}>{state}</span>
              <span className={trade.type === 'BUY' ? 'text-[9px] font-semibold text-shafx-success' : 'text-[9px] font-semibold text-shafx-danger'}>{trade.type}</span>
              <span className="min-w-0 flex-1 truncate text-[10px] text-shafx-text">{trade.symbol} • {trade.lotSize.toFixed(2)} lots • {state === 'OPEN' ? 'Entry ' + trade.entryPrice : 'Exit ' + (trade.exitPrice ?? '—')}</span>
              <span className="text-right text-[8px] tabular leading-3 text-shafx-textMuted">{state === 'OPEN' ? 'Opened ' : 'Closed '}{formatTime(time)}{state === 'CLOSED' && <><br /><span>Open {formatTime(trade.openTime)}</span></>}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-shafx-border bg-shafx-bg p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-shafx-textMuted">Market order tape</div>
            <div className="text-[9px] text-shafx-textMuted">Synthetic {selectedSymbol} simulator flow • updates every ~1s</div>
          </div>
          <span className="rounded-full border border-shafx-warning/20 bg-shafx-warning/5 px-2 py-1 text-[8px] font-semibold text-shafx-warning">SIMULATED</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-shafx-success/20 bg-shafx-success/5 p-2"><span className="block text-[8px] text-shafx-textMuted">BUY</span><strong className="font-mono text-xs text-shafx-success">{marketTicks.filter((tick) => tick.side === 'BUY').length} orders • {marketTicks.filter((tick) => tick.side === 'BUY').reduce((sum, tick) => sum + tick.lots, 0).toFixed(2)} lots</strong></div>
          <div className="rounded-lg border border-shafx-danger/20 bg-shafx-danger/5 p-2"><span className="block text-[8px] text-shafx-textMuted">SELL</span><strong className="font-mono text-xs text-shafx-danger">{marketTicks.filter((tick) => tick.side === 'SELL').length} orders • {marketTicks.filter((tick) => tick.side === 'SELL').reduce((sum, tick) => sum + tick.lots, 0).toFixed(2)} lots</strong></div>
        </div>
        <div ref={tapeScrollRef} className="mt-2 max-h-[250px] space-y-1 overflow-y-auto">
          {marketTicks.map((tick) => <div key={tick.id} className="grid grid-cols-[76px_46px_1fr_74px] items-center gap-1 rounded-lg border border-shafx-border/70 bg-shafx-surface/60 px-2 py-1.5 text-[9px]">
            <span className="font-mono tabular text-shafx-textMuted">{formatTime(new Date(tick.time).toISOString())}</span>
            <span className={tick.side === 'BUY' ? 'font-semibold text-shafx-success' : 'font-semibold text-shafx-danger'}>{tick.side}</span>
            <span className="font-mono tabular">{tick.lots.toFixed(2)} lots</span>
            <span className={tick.side === 'BUY' ? 'text-right font-mono text-shafx-success' : 'text-right font-mono text-shafx-danger'}>{tick.price.toFixed(5)}</span>
          </div>)}
        </div>
      </div>

      <p className="mt-3 text-[9px] leading-4 text-shafx-textMuted">Bot events above are real for this SHAFX simulator session. The market order tape is synthetic and is not a count of real people or a cross-user trading population.</p>
    </section>
  )
}

function Metric({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string; tone: 'accent' | 'success' | 'muted' | 'info' }) {
  const toneClass = tone === 'accent' ? 'text-shafx-accent' : tone === 'success' ? 'text-shafx-success' : tone === 'info' ? 'text-shafx-info' : 'text-shafx-text'
  return <div className="rounded-xl border border-shafx-border bg-shafx-bg p-2.5"><div className="flex items-center gap-1.5 text-[9px] text-shafx-textMuted"><Icon className={"h-3.5 w-3.5 " + toneClass} />{label}</div><div className={"mt-1.5 font-mono text-base font-semibold tabular " + toneClass}>{value}</div></div>
}
