import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ColorType, createChart, type CandlestickData, type IChartApi, type IPriceLine, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts'
import { Crosshair, Eraser, Ruler } from 'lucide-react'
import type { OHLCV, Timeframe } from '../../types'

export interface ChartAnnotation { id: string; price: number; label: string; color: string; lineWidth?: 1 | 2 | 3 | 4 }
export type ChartToolMode = 'cursor' | 'crosshair' | 'level' | 'measure' | 'alert'

interface CandlestickChartProps {
  data: OHLCV[]
  height?: string
  annotations?: ChartAnnotation[]
  timeframe?: Timeframe
  symbol?: string
  currentPrice?: number
  toolMode?: ChartToolMode
  pipSize?: number
  onToolNotice?: (message: string) => void
}

interface UserLevel { id: string; price: number; label: string; color: string; dashed?: boolean }

const prepareData = (data: OHLCV[]): CandlestickData[] => {
  const seen = new Set<number>()
  return [...data].sort((a, b) => a.time - b.time)
    .filter((c) => Number.isFinite(c.time) && Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close) && c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close))
    .filter((c) => { if (seen.has(c.time)) return false; seen.add(c.time); return true })
    .map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close }))
}

const timeframeMeta = (timeframe?: Timeframe, data: CandlestickData[] = []): { label: string; interval: string } => {
  if (timeframe) {
    const labels: Record<Timeframe, string> = { M1: '1m', M5: '5m', M15: '15m', M30: '30m', H1: '1h', H4: '4h', D1: '1d' }
    return { label: timeframe, interval: labels[timeframe] }
  }
  if (data.length < 2) return { label: '—', interval: 'candle' }
  const seconds = Number(data[1].time) - Number(data[0].time)
  const known: Record<number, { label: string; interval: string }> = { 60: { label: 'M1', interval: '1m' }, 300: { label: 'M5', interval: '5m' }, 900: { label: 'M15', interval: '15m' }, 1800: { label: 'M30', interval: '30m' }, 3600: { label: 'H1', interval: '1h' }, 14400: { label: 'H4', interval: '4h' }, 86400: { label: 'D1', interval: '1d' } }
  return known[seconds] ?? { label: 'Custom', interval: `${Math.round(seconds / 60)}m` }
}

export const CandlestickChart: React.FC<CandlestickChartProps> = ({ data, height = '100%', annotations = [], timeframe, toolMode = 'cursor', pipSize = 0.0001, onToolNotice }) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const chartData = useMemo(() => prepareData(data), [data])
  const lastClose = chartData.length ? Number(chartData[chartData.length - 1]?.close) : Number.NaN
  const meta = timeframeMeta(timeframe, chartData)
  const [userLevels, setUserLevels] = useState<UserLevel[]>([])
  const [measureStart, setMeasureStart] = useState<number | null>(null)
  const [measureEnd, setMeasureEnd] = useState<number | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const chart = createChart(el, {
      layout: { background: { type: ColorType.Solid, color: '#070A0F' }, textColor: '#8A96A8', attributionLogo: false },
      grid: { vertLines: { color: '#131A23' }, horzLines: { color: '#131A23' } },
      width: el.clientWidth,
      height: Math.max(280, el.clientHeight),
      crosshair: { mode: 1, vertLine: { color: '#667285', width: 1, style: 2, labelBackgroundColor: '#202A38' }, horzLine: { color: '#667285', width: 1, style: 2, labelBackgroundColor: '#202A38' } },
      rightPriceScale: { borderColor: '#202A38', minimumWidth: 78, scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderColor: '#202A38', timeVisible: true, secondsVisible: false, rightOffset: 5, barSpacing: 8, minBarSpacing: 3 },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    })
    const series = chart.addCandlestickSeries({ upColor: '#22D3A5', downColor: '#FF5C75', borderUpColor: '#22D3A5', borderDownColor: '#FF5C75', wickUpColor: '#22D3A5', wickDownColor: '#FF5C75', priceLineVisible: false, lastValueVisible: true })
    chartRef.current = chart
    seriesRef.current = series
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height: h } = entry.contentRect
      if (width > 0 && h > 0) chart.applyOptions({ width, height: Math.max(280, h) })
    })
    ro.observe(el)
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; seriesRef.current = null }
  }, [])

  useEffect(() => {
    const series = seriesRef.current
    const chart = chartRef.current
    if (!series || !chart) return
    series.setData(chartData)
    if (!chartData.length) return
    const width = containerRef.current?.clientWidth ?? 1000
    const visibleBars = width < 640 ? 58 : 92
    const lastIndex = chartData.length - 1
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, lastIndex - visibleBars + 1), to: lastIndex + 2 })
    chart.timeScale().scrollToRealTime()
  }, [chartData, timeframe])

  useEffect(() => {
    const series = seriesRef.current
    if (!series) return
    const lines: IPriceLine[] = []
    const seen = new Set<string>()
    const compact = (containerRef.current?.clientWidth ?? 1000) < 640

    const addLine = (annotation: ChartAnnotation | UserLevel): void => {
      if (!annotation.id || seen.has(annotation.id) || !Number.isFinite(annotation.price) || annotation.price <= 0) return
      seen.add(annotation.id)
      lines.push(series.createPriceLine({
        price: annotation.price,
        color: annotation.color,
        lineWidth: annotation.lineWidth ?? 1,
        lineStyle: 'dashed' in annotation && annotation.dashed ? 2 : (annotation.lineWidth && annotation.lineWidth > 1 ? 0 : 2),
        axisLabelVisible: !compact || annotation.id === 'support' || annotation.id === 'resistance',
        title: compact && annotation.id !== 'support' && annotation.id !== 'resistance' ? '' : annotation.label,
      }))
    }

    annotations.forEach(addLine)
    userLevels.forEach(addLine)
    if (Number.isFinite(lastClose) && lastClose > 0) lines.push(series.createPriceLine({ price: lastClose, color: '#6B7688', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'Last' }))
    return () => { lines.forEach((line) => series.removePriceLine(line)) }
  }, [annotations, lastClose, userLevels])

  const placeTool = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!['level', 'alert', 'measure'].includes(toolMode)) return
    const series = seriesRef.current
    const el = containerRef.current
    if (!series || !el) return
    event.preventDefault()
    const rect = el.getBoundingClientRect()
    const y = event.clientY - rect.top
    const price = series.coordinateToPrice(y)
    if (!Number.isFinite(price)) return

    if (toolMode === 'level' || toolMode === 'alert') {
      const label = toolMode === 'alert' ? 'Alert' : 'Level'
      setUserLevels((current) => [...current, { id: `${toolMode}-${Date.now()}`, price: Number(price), label, color: toolMode === 'alert' ? '#F5B84B' : '#7C5CFC', dashed: toolMode === 'alert' }].slice(-8))
      onToolNotice?.(`${label} placed at ${Number(price).toFixed(5)}`)
      return
    }

    if (measureStart === null) {
      setMeasureStart(Number(price))
      setMeasureEnd(null)
      onToolNotice?.('Measure start placed. Tap the chart again to finish.')
    } else {
      setMeasureEnd(Number(price))
      const delta = Math.abs(Number(price) - measureStart)
      const pips = delta / Math.max(pipSize, Number.EPSILON)
      onToolNotice?.(`Measured ${pips.toFixed(1)} pips`)
    }
  }

  const clearDrawings = (): void => {
    setUserLevels([])
    setMeasureStart(null)
    setMeasureEnd(null)
    onToolNotice?.('Chart drawings cleared.')
  }

  const measureDelta = measureStart !== null && measureEnd !== null ? Math.abs(measureEnd - measureStart) / Math.max(pipSize, Number.EPSILON) : null

  return <div ref={containerRef} onPointerDown={placeTool} className={`shafx-chart-shell relative w-full overflow-hidden border border-shafx-border bg-shafx-bg ${['level', 'alert', 'measure'].includes(toolMode) ? 'cursor-crosshair' : ''}`} style={{ height, minHeight: 280 }}>
    <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 rounded-xl border border-shafx-border bg-shafx-bg/90 px-2.5 py-1.5 text-[9px] font-semibold backdrop-blur"><span className="text-shafx-accent">SHAFX</span><span className="text-shafx-textMuted">•</span><span className="text-shafx-textMuted">{timeframe ?? 'PRICE'} workspace</span></div>
    <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-xl border border-shafx-border bg-shafx-bg/90 px-2.5 py-1.5 text-[9px] font-semibold text-shafx-text backdrop-blur">{meta.label} <span className="font-normal text-shafx-textMuted">• {meta.interval}</span></div>
    {(toolMode === 'level' || toolMode === 'alert' || toolMode === 'measure') && <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-xl border border-shafx-border bg-shafx-surface/95 px-3 py-2 text-[9px] text-shafx-textMuted shadow-xl"><Crosshair className="h-3.5 w-3.5 text-shafx-accent" />{toolMode === 'level' ? 'Tap chart to place a level' : toolMode === 'alert' ? 'Tap chart to place an alert line' : measureStart === null ? 'Tap first point to measure' : measureEnd === null ? 'Tap second point to finish' : 'Measure complete'}</div>}
    {measureDelta !== null && <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-xl border border-shafx-info/20 bg-shafx-surface/95 px-3 py-2 text-[9px] shadow-xl"><div className="flex items-center gap-2 text-shafx-textMuted"><Ruler className="h-3.5 w-3.5 text-shafx-info" />Range</div><strong className="mt-1 block font-mono text-xs text-shafx-text">{measureDelta.toFixed(1)} pips</strong></div>}
    {userLevels.length > 0 && <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={clearDrawings} className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-xl border border-shafx-border bg-shafx-surface px-2.5 py-1.5 text-[9px] text-shafx-textMuted shadow-xl hover:text-shafx-text"><Eraser className="h-3 w-3" />Clear levels</button>}
  </div>
}
