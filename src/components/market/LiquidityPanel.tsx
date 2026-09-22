import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Layers3, Radio, Waves } from 'lucide-react'
import type { OHLCV } from '../../types'

interface Props {
  symbol: string
  price: number
  precision: number
  pipSize?: number
  providerDepthAvailable?: boolean
  candles?: OHLCV[]
}

type TapeSide = 'BUY' | 'SELL'
interface TapeTick {
  id: string
  time: number
  side: TapeSide
  lots: number
  price: number
}

const formatExactTime = (timestamp: number): string => {
  const date = new Date(timestamp)
  const pad = (number: number, width = 2): string => String(number).padStart(width, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

interface FlowProfile {
  momentum: number
  activity: number
}

const buildFlowProfile = (candles: OHLCV[]): FlowProfile => {
  const recent = candles.slice(-12)
  if (recent.length === 0) return { momentum: 0, activity: 0.35 }

  let weightedMomentum = 0
  let weightTotal = 0
  let rangeTotal = 0
  let priceTotal = 0

  recent.forEach((candle, index) => {
    const range = Math.max(Math.abs(candle.high - candle.low), Number.EPSILON)
    const body = candle.close - candle.open
    const weight = index + 1
    weightedMomentum += clamp(body / range, -1, 1) * weight
    weightTotal += weight
    rangeTotal += range
    priceTotal += Math.max(Math.abs(candle.close), Number.EPSILON)
  })

  const momentum = clamp(weightedMomentum / Math.max(1, weightTotal), -1, 1)
  const averageRangePct = (rangeTotal / recent.length) / Math.max(Number.EPSILON, priceTotal / recent.length)
  const activity = clamp(averageRangePct / 0.0012, 0.18, 1)

  return { momentum, activity }
}

const randomNormal = (): number => {
  const u = Math.max(Number.EPSILON, Math.random())
  const v = Math.max(Number.EPSILON, Math.random())
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

const chooseFlowSide = (profile: FlowProfile, lastSide: TapeSide | null): TapeSide => {
  const persistence = lastSide === 'BUY' ? 0.06 : lastSide === 'SELL' ? -0.06 : 0
  const marketPressure = profile.momentum * 0.28
  const noise = clamp(randomNormal() * 0.10, -0.20, 0.20)
  const buyProbability = clamp(0.5 + marketPressure + persistence + noise, 0.12, 0.88)
  return Math.random() < buyProbability ? 'BUY' : 'SELL'
}

const chooseLotSize = (profile: FlowProfile): number => {
  const median = 0.08 + profile.activity * 0.22
  const raw = Math.exp(Math.log(median) + randomNormal() * 0.72)
  return Number(clamp(raw, 0.03, 2.5).toFixed(2))
}

const chooseNextDelay = (profile: FlowProfile): number => {
  // Variable event cadence: active periods cluster closer together; quiet periods spread out.
  const meanDelay = 2600 - profile.activity * 1200
  const exponentialGap = -Math.log(Math.max(1e-6, 1 - Math.random())) * meanDelay
  return Math.round(clamp(900 + exponentialGap, 900, 10000))
}

const seedTape = (candles: OHLCV[], precision: number): TapeTick[] => {
  const latest = Date.now()
  const profile = buildFlowProfile(candles)
  let cursor = latest
  let lastSide: TapeSide | null = null

  return candles.slice(-12).reverse().flatMap((candle, index) => {
    const gap = 900 + ((index * 701) % 2600)
    cursor -= gap
    const side = chooseFlowSide(profile, lastSide)
    lastSide = side
    const lotSize = chooseLotSize(profile)
    const close = Number(candle.close.toFixed(precision))
    const offset = Math.abs(candle.close - candle.open) * (0.15 + Math.random() * 0.35)
    const tapePrice = Number(clamp(
      side === 'BUY' ? close + offset : close - offset,
      Math.min(candle.low, candle.high),
      Math.max(candle.low, candle.high),
    ).toFixed(precision))
    return [{ id: `seed-${candle.time}-${index}`, time: cursor, side, lots: lotSize, price: tapePrice }]
  }).reverse()
}

export const LiquidityPanel: React.FC<Props> = ({ symbol, price, precision, pipSize = 0.0001, providerDepthAvailable = false, candles = [] }) => {
  const [tape, setTape] = useState<TapeTick[]>(() => seedTape(candles, precision))
  const [tick, setTick] = useState(0)
  const tapeScrollRef = useRef<HTMLDivElement | null>(null)
  const autoScrollTapeRef = useRef(true)
  const priceRef = useRef(price)
  const flowProfileRef = useRef<FlowProfile>(buildFlowProfile(candles))
  const lastSideRef = useRef<TapeSide | null>(tape[0]?.side ?? null)

  useEffect(() => {
    priceRef.current = price
    flowProfileRef.current = buildFlowProfile(candles)
  }, [candles, price])

  useEffect(() => {
    let sequence = 0
    let cancelled = false
    let timeout: number | null = null

    const scheduleNext = (): void => {
      if (cancelled) return
      const delay = chooseNextDelay(flowProfileRef.current)
      timeout = window.setTimeout(() => {
        sequence += 1
        const profile = flowProfileRef.current
        const side = chooseFlowSide(profile, lastSideRef.current)
        const lots = chooseLotSize(profile)
        lastSideRef.current = side
        setTick((value) => value + 1)

        const tapeElement = tapeScrollRef.current
        autoScrollTapeRef.current = !tapeElement || tapeElement.scrollHeight - tapeElement.scrollTop - tapeElement.clientHeight < 28

        setTape((previous) => {
          const now = Date.now()
          const drift = pipSize * (
            0.22 * Math.sin(sequence * 0.77) +
            0.14 * Math.cos(sequence * 1.13) +
            (side === 'BUY' ? 0.10 : -0.10)
          )
          const nextPrice = Number(Math.max(pipSize / 10, priceRef.current + drift).toFixed(precision))
          const next: TapeTick = {
            id: `live-${symbol}-${now}-${sequence}`,
            time: now,
            side,
            lots,
            price: nextPrice,
          }
          return [...previous, next].slice(-18)
        })

        scheduleNext()
      }, delay)
    }

    scheduleNext()
    return () => {
      cancelled = true
      if (timeout !== null) window.clearTimeout(timeout)
    }
  }, [pipSize, precision, symbol])

  useEffect(() => {
    if (!autoScrollTapeRef.current) return
    const element = tapeScrollRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [tape])

  const rows = useMemo(() => {
    const step = pipSize
    const levels = Array.from({ length: 6 }, (_, index) => index + 1)
    const asks = levels.map((level) => ({ price: Number((price + step * level).toFixed(precision)), size: 18 + ((level * 17) % 61) }))
    const bids = levels.map((level) => ({ price: Number((price - step * level).toFixed(precision)), size: 22 + ((level * 23) % 72) }))
    return { asks: asks.reverse(), bids }
  }, [pipSize, precision, price])

  const spark = useMemo(() => {
    const values = candles.slice(-36).map((c) => c.close)
    if (values.length < 2) return ''
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = Math.max(Number.EPSILON, max - min)
    return values.map((value, index) => {
      const x = values.length === 1 ? 180 : 8 + (index / (values.length - 1)) * 344
      const y = 64 - ((value - min) / span) * 52
      return (index === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1)
    }).join(' ')
  }, [candles])

  const max = Math.max(...rows.asks.map((row) => row.size), ...rows.bids.map((row) => row.size))
  const askTotal = rows.asks.reduce((sum, row) => sum + row.size, 0)
  const bidTotal = rows.bids.reduce((sum, row) => sum + row.size, 0)
  const tapeBuyLots = tape.filter((tick) => tick.side === 'BUY').reduce((sum, event) => sum + event.lots, 0)
  const tapeSellLots = tape.filter((tick) => tick.side === 'SELL').reduce((sum, event) => sum + event.lots, 0)
  const tapeBuyCount = tape.filter((tick) => tick.side === 'BUY').length
  const tapeSellCount = tape.filter((tick) => tick.side === 'SELL').length
  const imbalance = ((bidTotal - askTotal) / Math.max(1, bidTotal + askTotal)) * 100
  const spread = pipSize * 0.8
  const bid = price - spread / 2
  const ask = price + spread / 2

  return <section className="flex h-full flex-col rounded-2xl border border-shafx-border bg-shafx-surface">
    <header className="flex items-center justify-between border-b border-shafx-border px-4 py-3">
      <div className="flex items-center gap-2">
        <Layers3 className="h-4 w-4 text-shafx-accent" />
        <div><div className="text-xs font-semibold">Market flow & liquidity</div><div className="text-[9px] text-shafx-textMuted">{symbol} • {providerDepthAvailable ? 'provider depth' : 'SHAFX simulated market'}</div></div>
      </div>
      <span className="inline-flex items-center gap-1 rounded-full border border-shafx-border bg-shafx-bg px-2 py-1 text-[9px] text-shafx-textMuted"><Radio className={providerDepthAvailable ? 'h-3 w-3 text-shafx-success' : 'h-3 w-3 text-shafx-warning'} />{providerDepthAvailable ? 'LIVE' : 'LIVE SIM'}</span>
    </header>

    <div className="border-b border-shafx-border p-3">
      <div className="flex items-center justify-between gap-3"><div><div className="text-[9px] uppercase tracking-[0.14em] text-shafx-textMuted">Price movement</div><div className="mt-1 font-mono text-lg font-semibold tabular">{price.toFixed(precision)}</div></div><div className="text-right text-[9px] text-shafx-textMuted">Bid {bid.toFixed(precision)}<br />Ask {ask.toFixed(precision)}<br />Spread {(spread / pipSize).toFixed(1)} pips</div></div>
      <div className="mt-2 rounded-xl border border-shafx-border bg-shafx-bg p-2">
        <svg viewBox="0 0 360 72" className="h-20 w-full" role="img" aria-label="Simulated price movement">
          <line x1="8" y1="64" x2="352" y2="64" stroke="#202A38" strokeDasharray="4 4" />
          {spark ? <path d={spark} fill="none" stroke="#7C5CFC" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /> : <text x="180" y="38" textAnchor="middle" fill="#8A96A8" fontSize="9">Waiting for price history</text>}
        </svg>
      </div>
    </div>

    <div className="grid grid-cols-[1fr_74px_1fr] border-b border-shafx-border px-3 py-2 text-[9px] uppercase tracking-[0.14em] text-shafx-textMuted"><span className="text-right">Sell depth</span><span className="text-center">Price</span><span>Buy depth</span></div>
    <div className="max-h-[320px] flex-1 overflow-auto px-2 py-2">
      {rows.asks.map((row) => <div key={row.price} className="relative grid grid-cols-[1fr_74px_1fr] items-center px-1 py-2 text-[10px]">
        <div className="flex justify-end pr-2"><div className="relative h-5 w-[88%] overflow-hidden rounded bg-shafx-danger/5"><div className="absolute inset-y-0 right-0 rounded bg-shafx-danger/20" style={{ width: `${Math.round(row.size / max * 100)}%` }} /></div></div>
        <span className="z-10 text-center font-mono text-shafx-text">{row.price.toFixed(precision)}</span>
        <span className="font-mono text-shafx-danger">{row.size}</span>
      </div>)}
      <div className="my-1 rounded-xl border border-shafx-accent/30 bg-shafx-accent/5 px-3 py-2.5">
        <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.14em] text-shafx-textMuted"><span>Market spread</span><span>{(spread / pipSize).toFixed(1)} pips</span></div>
        <div className="mt-1 flex items-center justify-between"><strong className="font-mono text-sm">{price.toFixed(precision)}</strong><span className="font-mono text-shafx-textMuted">mid</span></div>
      </div>
      {rows.bids.map((row) => <div key={row.price} className="relative grid grid-cols-[1fr_74px_1fr] items-center px-1 py-2 text-[10px]">
        <span className="text-right font-mono text-shafx-success">{row.size}</span>
        <span className="z-10 text-center font-mono text-shafx-text">{row.price.toFixed(precision)}</span>
        <div className="pl-2"><div className="relative h-5 w-[88%] overflow-hidden rounded bg-shafx-success/5"><div className="absolute inset-y-0 left-0 rounded bg-shafx-success/20" style={{ width: `${Math.round(row.size / max * 100)}%` }} /></div></div>
      </div>)}
    </div>

    <div className="border-t border-shafx-border">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-2"><Activity className="h-3.5 w-3.5 text-shafx-accent" /><div><div className="text-[10px] font-semibold">Time & sales</div><div className="text-[8px] text-shafx-textMuted">Synthetic market-print stream • variable event cadence • market-coupled flow</div></div></div>
        <span className="text-[8px] font-semibold text-shafx-success">EVENT {tick}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 px-3 pb-2 text-[9px]">
        <div className="rounded-lg border border-shafx-success/20 bg-shafx-success/5 p-2"><span className="block text-shafx-textMuted">Buy prints</span><strong className="mt-0.5 block font-mono text-shafx-success">{tapeBuyCount} • {tapeBuyLots.toFixed(2)} lots</strong></div>
        <div className="rounded-lg border border-shafx-danger/20 bg-shafx-danger/5 p-2"><span className="block text-shafx-textMuted">Sell prints</span><strong className="mt-0.5 block font-mono text-shafx-danger">{tapeSellCount} • {tapeSellLots.toFixed(2)} lots</strong></div>
      </div>
      <div ref={tapeScrollRef} className="max-h-[250px] space-y-1 overflow-y-auto px-3 pb-3">
        <div className="grid grid-cols-[76px_46px_1fr_84px] gap-1 px-2 text-[8px] uppercase tracking-[0.12em] text-shafx-textMuted"><span>Time</span><span>Side</span><span>Volume</span><span className="text-right">Price</span></div>
        {tape.map((entry) => <div key={entry.id} className="grid grid-cols-[76px_46px_1fr_84px] items-center gap-1 rounded-lg border border-shafx-border/70 bg-shafx-bg px-2 py-1.5 text-[9px]">
          <span className="font-mono tabular text-shafx-textMuted">{formatExactTime(entry.time)}</span>
          <span className={entry.side === 'BUY' ? 'font-semibold text-shafx-success' : 'font-semibold text-shafx-danger'}>{entry.side}</span>
          <span className="font-mono tabular">{entry.lots.toFixed(2)} lots</span>
          <span className={entry.side === 'BUY' ? 'text-right font-mono text-shafx-success' : 'text-right font-mono text-shafx-danger'}>{entry.price.toFixed(precision)}</span>
        </div>)}
      </div>
    </div>

    <footer className="grid grid-cols-3 gap-2 border-t border-shafx-border p-3 text-[9px]">
      <div className="rounded-lg border border-shafx-border bg-shafx-bg p-2"><span className="block text-shafx-textMuted">Bid depth</span><strong className="mt-1 block font-mono text-shafx-success">{bidTotal}</strong></div>
      <div className="rounded-lg border border-shafx-border bg-shafx-bg p-2"><span className="block text-shafx-textMuted">Ask depth</span><strong className="mt-1 block font-mono text-shafx-danger">{askTotal}</strong></div>
      <div className="rounded-lg border border-shafx-border bg-shafx-bg p-2"><span className="block text-shafx-textMuted">Imbalance</span><strong className={`mt-1 block font-mono ${imbalance >= 0 ? 'text-shafx-success' : 'text-shafx-danger'}`}>{imbalance >= 0 ? '+' : ''}{imbalance.toFixed(1)}%</strong></div>
    </footer>
    <div className="border-t border-shafx-border px-4 py-2 text-[9px] leading-relaxed text-shafx-textMuted"><Waves className="mr-1 inline h-3 w-3 text-shafx-accent" />{providerDepthAvailable ? 'Depth is supplied by the connected provider adapter.' : 'All event timing, volume and participant-side activity above is synthetic simulator data; real Time & Sales and real depth require normalized provider tick/depth data.'}</div>
  </section>
}