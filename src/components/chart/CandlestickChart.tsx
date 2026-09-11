import React, { useEffect, useMemo, useRef } from 'react'
import { ColorType, createChart, type CandlestickData, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts'
import type { OHLCV } from '../../types'

interface CandlestickChartProps { data: OHLCV[]; height?: string }
const prepareData = (data: OHLCV[]): CandlestickData[] => {
  const seen = new Set<number>()
  return [...data].sort((a, b) => a.time - b.time).filter((c) => Number.isFinite(c.time) && Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close) && c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close)).filter((c) => { if (seen.has(c.time)) return false; seen.add(c.time); return true }).map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close }))
}

export const CandlestickChart: React.FC<CandlestickChartProps> = ({ data, height = '100%' }) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const chartData = useMemo(() => prepareData(data), [data])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const chart = createChart(el, { layout: { background: { type: ColorType.Solid, color: '#0B0E11' }, textColor: '#848E9C' }, grid: { vertLines: { color: '#1E2329' }, horzLines: { color: '#1E2329' } }, width: el.clientWidth, height: Math.max(240, el.clientHeight), crosshair: { mode: 1 }, rightPriceScale: { borderColor: '#2A2F38' }, timeScale: { borderColor: '#2A2F38', timeVisible: true, secondsVisible: false } })
    const series = chart.addCandlestickSeries({ upColor: '#0ECB81', downColor: '#F6465D', borderUpColor: '#0ECB81', borderDownColor: '#F6465D', wickUpColor: '#0ECB81', wickDownColor: '#F6465D' })
    chartRef.current = chart
    seriesRef.current = series
    const ro = new ResizeObserver(([entry]) => { if (!entry) return; const { width, height: h } = entry.contentRect; if (width > 0 && h > 0) chart.applyOptions({ width, height: h }) })
    ro.observe(el)
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; seriesRef.current = null }
  }, [])

  useEffect(() => { const series = seriesRef.current; const chart = chartRef.current; if (!series || !chart) return; series.setData(chartData); if (chartData.length) chart.timeScale().fitContent() }, [chartData])
  return <div ref={containerRef} className="w-full overflow-hidden rounded-lg border border-shafx-border" style={{ height, minHeight: 240 }} />
}
