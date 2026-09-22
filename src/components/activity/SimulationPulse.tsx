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
  marketBias?: 'Bullish' | 'Bearish' | 'Neutral'
  marketPrice?: number
  pricePrecision?: number
}

const formatTime = (value: string): string => {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  const pad = (number: number, width = 2): string => String(number).padStart(width, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

type MarketTick = { id: string; time: number; side: 'BUY' | 'SELL'; lots: number; price: number }

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

const randomNormal = (): number => {
  const u = Math.max(Number.EPSILON, Math.random())
  const v = Math.max(Number.EPSILON, Math.random())
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

const chooseTapeSide = (bias: 'Bullish' | 'Bearish' | 'Neutral', lastSide: MarketTick['side'] | null): MarketTick['side'] => {
  const base = bias === 'Bullish' ? 0.62 : bias === 'Bearish' ? 0.38 : 0.5
  const persistence = lastSide === 'BUY' ? 0.05 : lastSide === 'SELL' ? -0.05 : 0
  const noise = clamp(randomNormal() * 0.11, -0.22, 0.22)
  return Math.random() < clamp(base + persistence + noise, 0.12, 0.88) ? 'BUY' : 'SELL'
}

const chooseTapeLots = (): number => {
  const raw = Math.exp(Math.log(0.16) + randomNormal() * 0.70)
  return Number(clamp(raw, 0.03, 2.5).toFixed(2))
}

const chooseTapeDelay = (): number => {
  const gap = -Math.log(Math.max(1e-6, 1 - Math.random())) * 2800
  return Math.round(clamp(900 + gap, 900, 10000))
}

export const SimulationPulse: React.FC<Props> = ({ selectedSymbol, openPositions, tradeHistory, botOrderIds, botRunning, marketBias = 'Neutral', marketPrice = 1.085, pricePrecision = 5 }) => {
  const marketOpenPositions = openPositions.filter((trade) => trade.symbol === selectedSymbol)
  const marketTradeHistory = tradeHistory.filter((trade) => trade.symbol === selectedSymbol)
  const marketBotOrderIds = new Set(botOrderIds.filter((id) => [...marketOpenPositions, ...marketTradeHistory].some((trade) => trade.id === id)))
  const stats = buildSimulationPulseStats({ openPositions: marketOpenPositions, tradeHistory: marketTradeHistory, botOrderIds: [...marketBotOrderIds], botRunning })
  const tapeScrollRef = useRef<HTMLDivElement | null>(null)
  const autoScrollTapeRef = useRef(true)
  const initialPrice = marketPrice || marketOpenPositions[0]?.entryPrice || marketTradeHistory[0]?.exitPrice || marketTradeHistory[0]?.entryPrice || 1.085
  const priceRef = useRef(initialPrice)
  const biasRef = useRef(marketBias)
  const lastSideRef = useRef<MarketTick['side'] | null>(null)
  const [marketTicks, setMarketTicks] = useState<MarketTick[]>(() => Array.from({ length: 7 }, (_, index) => ({
    id: 'seed-' + index,
    time: Date.now() - (7 - index) * (700 + ((index * 613) % 2400)),
    side: chooseTapeSide(marketBias, null),
    lots: chooseTapeLots(),
    price: Number((initialPrice + Math.sin(index * 0.85) * 0.00012).toFixed(pricePrecision)),
  })))

  useEffect(() => {
    priceRef.current = initialPrice
    biasRef.current = marketBias
  }, [initialPrice, marketBias])

  useEffect(() => {
    let sequence = 0
    let cancelled = false
    let timeout: number | null = null

    const scheduleNext = (): void => {
      if (cancelled) return
      timeout = window.setTimeout(() => {
        sequence += 1
        const side = chooseTapeSide(biasRef.current, lastSideRef.current)
        const lots = chooseTapeLots()
        lastSideRef.current = side

        const tapeElement = tapeScrollRef.current
        autoScrollTapeRef.current = !tapeElement || tapeElement.scrollHeight - tapeElement.scrollTop - tapeElement.clientHeight < 28

        setMarketTicks((previous) => {
          const last = previous[previous.length - 1]
          const base = priceRef.current || last?.price || initialPrice
          const drift = 0.00006 * (
            0.45 * Math.sin(sequence * 0.73) +
            0.25 * Math.cos(sequence * 1.17) +
            (side === 'BUY' ? 0.14 : -0.14)
          )
          const nextPrice = Number((base + drift).toFixed(pricePrecision))
          return [...previous, {
            id: 'tick-' + Date.now() + '-' + sequence,
            time: Date.now(),
            side,
            lots,
            price: nextPrice,
          }].slice(-8)
        })

        scheduleNext()
      }, chooseTapeDelay())
    }

    scheduleNext()
    return () => {
      cancelled = true
      if (timeout !== null) window.clearTimeout(timeout)
    }
  }, [pricePrecision, selectedSymbol])

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
            <div className="text-[9px] text-shafx-textMuted">Synthetic {selectedSymbol} simulator flow • variable event cadence • market-bias coupled</div>
          </div>
          <span className="rounded-full border border-shafx-warning/20 bg-shafx-warning/5 px-2 py-1 text-[8px] font-semibold text-shafx-warning">SIMULATED</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-shafx-success/20 bg-shafx-success/5 p-2"><span className="block text-[8px] text-shafx-textMuted">BUY</span><strong className="font-mono text-xs text-shafx-success">{marketTicks.filter((tick) => tick.side === 'BUY').length} prints • {marketTicks.filter((tick) => tick.side === 'BUY').reduce((sum, tick) => sum + tick.lots, 0).toFixed(2)} lots</strong></div>
          <div className="rounded-lg border border-shafx-danger/20 bg-shafx-danger/5 p-2"><span className="block text-[8px] text-shafx-textMuted">SELL</span><strong className="font-mono text-xs text-shafx-danger">{marketTicks.filter((tick) => tick.side === 'SELL').length} prints • {marketTicks.filter((tick) => tick.side === 'SELL').reduce((sum, tick) => sum + tick.lots, 0).toFixed(2)} lots</strong></div>
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

      <p className="mt-3 text-[9px] leading-4 text-shafx-textMuted">Bot events above are real for this SHAFX simulator session. The market tape is synthetic: event timing, side and size are randomized within a market-flow model and are not a count of real people.</p>
    </section>
  )
}

function Metric({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string; tone: 'accent' | 'success' | 'muted' | 'info' }) {
  const toneClass = tone === 'accent' ? 'text-shafx-accent' : tone === 'success' ? 'text-shafx-success' : tone === 'info' ? 'text-shafx-info' : 'text-shafx-text'
  return <div className="rounded-xl border border-shafx-border bg-shafx-bg p-2.5"><div className="flex items-center gap-1.5 text-[9px] text-shafx-textMuted"><Icon className={"h-3.5 w-3.5 " + toneClass} />{label}</div><div className={"mt-1.5 font-mono text-base font-semibold tabular " + toneClass}>{value}</div></div>
}
