import React, { useEffect, useMemo, useRef } from 'react'
import { ColorType, createChart, type CandlestickData, type IChartApi, type IPriceLine, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts'
import type { OHLCV } from '../../types'

export interface ChartAnnotation {
  id: string
  price: number
  label: string
  color: string
  lineWidth?: 1 | 2 | 3 | 4
}

interface CandlestickChartProps {
  data: OHLCV[]
  height?: string
  annotations?: ChartAnnotation[]
}

const prepareData = (data: OHLCV[]): CandlestickData[] => {
  const seen = new Set<number>()
  return [...data]
    .sort((a, b) => a.time - b.time)
    .filter((c) => Number.isFinite(c.time) && Number.isFinite(c.open) && Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close) && c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close))
    .filter((c) => {
      if (seen.has(c.time)) return false
      seen.add(c.time)
      return true
    })
    .map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close }))
}

export const CandlestickChart: React.FC<CandlestickChartProps> = ({ data, height = '100%', annotations = [] }) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const chartData = useMemo(() => prepareData(data), [data])
  const lastClose = chartData.length ? Number(chartData[chartData.length - 1]?.close) : Number.NaN

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: '#0B0E11' },
        textColor: '#848E9C',
        attributionLogo: false,
      },
      grid: { vertLines: { color: '#171B21' }, horzLines: { color: '#171B21' } },
      width: el.clientWidth,
      height: Math.max(280, el.clientHeight),
      crosshair: {
        mode: 1,
        vertLine: { color: '#596273', width: 1, style: 2, labelBackgroundColor: '#2A2F38' },
        horzLine: { color: '#596273', width: 1, style: 2, labelBackgroundColor: '#2A2F38' },
      },
      rightPriceScale: { borderColor: '#2A2F38', minimumWidth: 76, scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderColor: '#2A2F38', timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 8, minBarSpacing: 3 },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    })
    const series = chart.addCandlestickSeries({
      upColor: '#0ECB81',
      downColor: '#F6465D',
      borderUpColor: '#0ECB81',
      borderDownColor: '#F6465D',
      wickUpColor: '#0ECB81',
      wickDownColor: '#F6465D',
      priceLineVisible: false,
      lastValueVisible: true,
    })
    chartRef.current = chart
    seriesRef.current = series
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height: h } = entry.contentRect
      if (width > 0 && h > 0) chart.applyOptions({ width, height: Math.max(280, h) })
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [])

  useEffect(() => {
    const series = seriesRef.current
    const chart = chartRef.current
    if (!series || !chart) return
    series.setData(chartData)
    if (chartData.length) chart.timeScale().fitContent()
  }, [chartData])

  useEffect(() => {
    const series = seriesRef.current
    if (!series) return
    const lines: IPriceLine[] = []
    const seen = new Set<string>()
    for (const annotation of annotations) {
      if (!annotation.id || seen.has(annotation.id) || !Number.isFinite(annotation.price) || annotation.price <= 0) continue
      seen.add(annotation.id)
      lines.push(series.createPriceLine({
        price: annotation.price,
        color: annotation.color,
        lineWidth: annotation.lineWidth ?? 1,
        lineStyle: annotation.lineWidth && annotation.lineWidth > 1 ? 0 : 2,
        axisLabelVisible: true,
        title: annotation.label,
      }))
    }
    if (Number.isFinite(lastClose) && lastClose > 0) {
      lines.push(series.createPriceLine({
        price: lastClose,
        color: '#848E9C',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'Last',
      }))
    }
    return () => {
      lines.forEach((line) => series.removePriceLine(line))
    }
  }, [annotations, lastClose])

  return <div ref={containerRef} className="relative w-full overflow-hidden border border-shafx-border bg-shafx-bg" style={{ height, minHeight: 280 }}>
    <div className="pointer-events-none absolute left-3 top-3 z-10 rounded border border-shafx-border bg-shafx-bg/90 px-2 py-1 text-[10px] font-medium tracking-wide text-shafx-textMuted">SHAFX • PRICE CHART</div>
  </div>
}
