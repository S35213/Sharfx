import { useEffect, useMemo, useRef } from 'react'
import { createChart, type IChartApi, type ISeriesApi, type CandlestickData, type Time } from 'lightweight-charts'

export interface ChartAnnotation {
  id: string
  type: 'support' | 'resistance' | 'liquidity' | 'entry' | 'stop' | 'target'
  price: number
  label: string
}

interface CandlestickChartProps {
  candles: CandlestickData<Time>[]
  annotations?: ChartAnnotation[]
}

export function CandlestickChart({ candles, annotations = [] }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const safeCandles = useMemo(() => {
    const sorted = [...candles].filter((c) => Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close)).sort((a, b) => Number(a.time) - Number(b.time))
    const seen = new Set<number>()
    return sorted.filter((c) => {
      const time = Number(c.time)
      if (seen.has(time)) return false
      seen.add(time)
      return c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close)
    })
  }, [candles])
  useEffect(() => {
    if (!containerRef.current) return
    const chart = createChart(containerRef.current, { autoSize: true, layout: { background: { color: '#0B0E11' }, textColor: '#9AA4B2' }, grid: { vertLines: { color: '#1B222C' }, horzLines: { color: '#1B222C' } }, rightPriceScale: { borderColor: '#29313D' }, timeScale: { borderColor: '#29313D', timeVisible: true }, crosshair: { mode: 0 } })
    const series = chart.addCandlestickSeries({ upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350' })
    chartRef.current = chart
    seriesRef.current = series
    const observer = new ResizeObserver(() => chart.applyOptions({ width: containerRef.current?.clientWidth ?? 0 }))
    observer.observe(containerRef.current)
    return () => { observer.disconnect(); chart.remove(); chartRef.current = null; seriesRef.current = null }
  }, [])
  useEffect(() => {
    const series = seriesRef.current
    if (!series) return
    series.setData(safeCandles)
    if (safeCandles.length) series.priceScale().applyOptions({ autoScale: true })
  }, [safeCandles])
  useEffect(() => {
    const series = seriesRef.current
    if (!series) return
    const created = annotations.filter((a) => Number.isFinite(a.price)).map((a) => series.createPriceLine({ price: a.price, color: a.type === 'stop' ? '#ef5350' : a.type === 'target' ? '#26a69a' : a.type === 'entry' ? '#2962FF' : '#9AA4B2', lineWidth: a.type === 'entry' ? 2 : 1, lineStyle: a.type === 'liquidity' ? 2 : 0, axisLabelVisible: true, title: a.label }))
    return () => created.forEach((line) => series.removePriceLine(line))
  }, [annotations])
  return <div ref={containerRef} className="min-h-[240px] h-full w-full" aria-label="SHAFX candlestick chart" />
}
