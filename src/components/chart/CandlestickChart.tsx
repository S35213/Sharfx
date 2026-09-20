import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ColorType, createChart, type CandlestickData, type IChartApi, type IPriceLine, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts'
import { Crosshair, Eraser, Ruler } from 'lucide-react'
import type { CandleTheme, ChartMode } from '../../app/chartSettings'
import type { OHLCV, Timeframe } from '../../types'

export interface ChartAnnotation { id: string; price: number; label: string; color: string; lineWidth?: 1 | 2 | 3 | 4 }
export type ChartToolMode = 'cursor' | 'crosshair' | 'level' | 'measure' | 'alert'

interface CandlestickChartProps {
  data: OHLCV[]
  height?: string
  annotations?: ChartAnnotation[]
  timeframe?: Timeframe
  symbol?: string
  toolMode?: ChartToolMode
  pipSize?: number
  onToolNotice?: (message: string) => void
  showGrid?: boolean
  showPriceLabels?: boolean
  bidPrice?: number
  askPrice?: number
  tradeLines?: ChartAnnotation[]
  followLatest?: boolean
  candleTheme?: CandleTheme
  chartMode?: ChartMode
  marketTimestamp?: number
}

interface UserLevel { id: string; price: number; label: string; color: string; lineWidth?: 1 | 2 | 3 | 4; dashed?: boolean; armed?: boolean }
type ShafxSeries = ISeriesApi<'Candlestick'> | ISeriesApi<'Bar'> | ISeriesApi<'Line'> | ISeriesApi<'Area'>

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

export const CandlestickChart: React.FC<CandlestickChartProps> = ({ data, height = '100%', annotations = [], timeframe, symbol, toolMode = 'cursor', pipSize = 0.0001, onToolNotice, showGrid = true, showPriceLabels = true, bidPrice, askPrice, tradeLines = [], candleTheme = 'mt5', chartMode = 'candles', marketTimestamp }) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ShafxSeries | null>(null)
  const chartData = useMemo(() => prepareData(data), [data])
  const visualData = useMemo(() => {
    if (chartMode === 'candles' || chartMode === 'bars') return chartData
    return chartData.map((candle) => ({ time: candle.time, value: candle.close }))
  }, [chartData, chartMode])
  const lastClose = chartData.length ? Number(chartData[chartData.length - 1]?.close) : Number.NaN
  const meta = timeframeMeta(timeframe, chartData)
  const [userLevels, setUserLevels] = useState<UserLevel[]>([])
  const [measureStart, setMeasureStart] = useState<number | null>(null)
  const [measureEnd, setMeasureEnd] = useState<number | null>(null)
  const [alertCandidate, setAlertCandidate] = useState<number | null>(null)
  const [armedAlerts, setArmedAlerts] = useState<UserLevel[]>([])
  const viewInitializedRef = useRef(false)
  const previousSymbolRef = useRef<string | undefined>(symbol)
  const previousTimeframeRef = useRef<Timeframe | undefined>(timeframe)
  const renderedFirstTimeRef = useRef<number | null>(null)
  const renderedLastTimeRef = useRef<number | null>(null)
  const [crosshairInfo, setCrosshairInfo] = useState<{ price: number; time: string } | null>(null)
  const marketBidLineRef = useRef<IPriceLine | null>(null)
  const marketAskLineRef = useRef<IPriceLine | null>(null)
  const followRealtimeRef = useRef(true)
  const latestIndexRef = useRef(-1)
  const candleColors: Record<CandleTheme, { up: string; down: string }> = {
    shafx: { up: '#22D3A5', down: '#FF5C75' },
    mt5: { up: '#26A69A', down: '#EF5350' },
    blue: { up: '#42A5F5', down: '#FF7043' },
    amber: { up: '#FFCA28', down: '#EF5350' },
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const chart = createChart(el, {
      layout: { background: { type: ColorType.Solid, color: '#070A0F' }, textColor: '#8A96A8', attributionLogo: false },
      grid: showGrid ? { vertLines: { color: '#131A23' }, horzLines: { color: '#131A23' } } : { vertLines: { color: 'transparent' }, horzLines: { color: 'transparent' } },
      width: el.clientWidth,
      height: Math.max(280, el.clientHeight),
      crosshair: { mode: 1, vertLine: { color: '#667285', width: 1, style: 2, labelBackgroundColor: '#202A38' }, horzLine: { color: '#667285', width: 1, style: 2, labelBackgroundColor: '#202A38' } },
      rightPriceScale: { borderColor: '#202A38', minimumWidth: 104, alignLabels: true, ticksVisible: true, scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderColor: '#202A38', timeVisible: true, secondsVisible: false, rightOffset: 7, barSpacing: 9, minBarSpacing: 3 },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    })
    const colors = candleColors[candleTheme]
    const precision = Math.max(2, Math.round(Math.log10(1 / Math.max(pipSize, 0.00001))))
    let series: ShafxSeries
    if (chartMode === 'bars') {
      series = chart.addBarSeries({ priceFormat: { type: 'price', precision, minMove: Math.max(pipSize, 0.00001) }, upColor: colors.up, downColor: colors.down, openVisible: true, thinBars: false, priceLineVisible: false, lastValueVisible: false })
    } else if (chartMode === 'wave') {
      series = chart.addLineSeries({ color: colors.up, lineWidth: 2, crosshairMarkerVisible: true, priceLineVisible: false, lastValueVisible: false })
    } else if (chartMode === 'area') {
      series = chart.addAreaSeries({ lineColor: colors.up, topColor: colors.up + '66', bottomColor: colors.up + '05', lineWidth: 2, priceLineVisible: false, lastValueVisible: false })
    } else {
      series = chart.addCandlestickSeries({ priceFormat: { type: 'price', precision, minMove: Math.max(pipSize, 0.00001) }, upColor: colors.up, downColor: colors.down, borderUpColor: colors.up, borderDownColor: colors.down, wickUpColor: colors.up, wickDownColor: colors.down, priceLineVisible: false, lastValueVisible: false })
    }

    chartRef.current = chart
    seriesRef.current = series
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height: h } = entry.contentRect
      if (width > 0 && h > 0) chart.applyOptions({ width, height: Math.max(280, h) })
    })
    const onVisibleRangeChange = (range: { from: number; to: number } | null): void => {
      if (!range) {
        followRealtimeRef.current = true
        return
      }
      const lastIndex = latestIndexRef.current
      followRealtimeRef.current = lastIndex < 0 || range.to >= lastIndex - 1
    }
    chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleRangeChange)
    ro.observe(el)
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleRangeChange)
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
      marketBidLineRef.current = null
      marketAskLineRef.current = null
    }
  }, [chartMode])

  useEffect(() => {
    const series = seriesRef.current
    const chart = chartRef.current
    if (!series || !chart) return
    const colors = candleColors[candleTheme]

    if (chartMode === 'wave') {
      series.applyOptions({ color: colors.up, lineColor: colors.up })
    } else if (chartMode === 'area') {
      series.applyOptions({ lineColor: colors.up, topColor: colors.up + '66', bottomColor: colors.up + '05' })
    } else if (chartMode === 'bars') {
      series.applyOptions({ upColor: colors.up, downColor: colors.down })
    } else {
      series.applyOptions({
        upColor: colors.up,
        downColor: colors.down,
        borderUpColor: colors.up,
        borderDownColor: colors.down,
        wickUpColor: colors.up,
        wickDownColor: colors.down,
      })
    }

    // Re-apply the current visual dataset immediately. This makes a theme or
    // chart-mode selection repaint in-place instead of waiting for a browser
    // refresh or an unrelated timeframe change.
    series.setData(visualData)
    chart.applyOptions({})
    const el = containerRef.current
    if (el) chart.resize(el.clientWidth, Math.max(280, el.clientHeight), true)
  }, [candleTheme, chartMode, visualData])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.applyOptions({
      grid: showGrid
        ? { vertLines: { color: '#131A23' }, horzLines: { color: '#131A23' } }
        : { vertLines: { color: 'transparent' }, horzLines: { color: 'transparent' } },
    })
  }, [showGrid])

  useEffect(() => {
    const series = seriesRef.current
    const chart = chartRef.current
    if (!series || !chart || !visualData.length) return

    const firstTime = Number(visualData[0].time)
    const lastTime = Number(visualData[visualData.length - 1].time)
    const symbolChanged = previousSymbolRef.current !== symbol
    const timeframeChanged = previousTimeframeRef.current !== timeframe
    const rangeNeedsReset = !viewInitializedRef.current || symbolChanged || timeframeChanged

    // Realtime ticks update only the latest bar. Replacing the whole series and
    // calling scrollToRealTime on every tick was resetting the user's pinch zoom
    // and horizontal position after their finger was released.
    const canUpdateLatestBar =
      !symbolChanged &&
      !timeframeChanged &&
      renderedFirstTimeRef.current === firstTime &&
      renderedLastTimeRef.current !== null &&
      lastTime >= renderedLastTimeRef.current

    const previousLastTime = renderedLastTimeRef.current
    const previousLastIndex = latestIndexRef.current
    const visibleRange = chart.timeScale().getVisibleLogicalRange()
    const wasFollowingRealtime =
      followRealtimeRef.current ||
      !visibleRange ||
      (previousLastIndex >= 0 && visibleRange.to >= previousLastIndex - 1)
    const isNewBar = previousLastTime !== null && lastTime > previousLastTime

    if (canUpdateLatestBar) {
      series.update(visualData[visualData.length - 1])
    } else {
      series.setData(visualData)
    }

    const lastIndex = visualData.length - 1
    if (rangeNeedsReset) {
      const width = containerRef.current?.clientWidth ?? 1000
      const currentVisible = visibleRange
      // A timeframe change is a deliberate view reset. Do not preserve the
      // previous zoom ratio because that can make M1/M5 appear artificially
      // zoomed-in after switching from H1/H4 (or vice versa). Start wide;
      // the user can then zoom in manually.
      const visibleBars = width < 640 ? 140 : 180
      const from = Math.max(0, lastIndex - visibleBars + 1)
      const to = lastIndex + 7
      chart.timeScale().setVisibleLogicalRange({ from, to })
      series.priceScale().applyOptions({ autoScale: true })
      followRealtimeRef.current = true
    } else if (isNewBar && wasFollowingRealtime) {
      // Only follow the newest bar when the user is already at the live edge.
      // When the user has panned back into history, never pull them back to
      // the front just because a new simulator/provider tick arrived.
      chart.timeScale().scrollToRealTime()
      followRealtimeRef.current = true
    }

    latestIndexRef.current = lastIndex
    viewInitializedRef.current = true
    previousSymbolRef.current = symbol
    previousTimeframeRef.current = timeframe
    renderedFirstTimeRef.current = firstTime
    renderedLastTimeRef.current = lastTime
  }, [visualData, symbol, timeframe])

  useEffect(() => {
    const series = seriesRef.current
    if (!series) return
    const lines: IPriceLine[] = []
    const seen = new Set<string>()
    const compact = (containerRef.current?.clientWidth ?? 1000) < 640
    // Keep the latest-price label visible on mobile. It is tied to the chart's
    // price scale, so it follows the latest candle instead of floating beside it.
    series.applyOptions({ lastValueVisible: false })

    const addLine = (annotation: ChartAnnotation | UserLevel): void => {
      if (!annotation.id || seen.has(annotation.id) || !Number.isFinite(annotation.price) || annotation.price <= 0) return
      seen.add(annotation.id)
      const isLiquidity = annotation.id.includes('liquidity')
      lines.push(series.createPriceLine({
        price: annotation.price,
        color: annotation.color,
        lineWidth: annotation.lineWidth ?? 1,
        lineStyle: isLiquidity ? 2 : 1,
        axisLabelVisible: showPriceLabels && (!compact || annotation.id.includes('support') || annotation.id.includes('resistance') || isLiquidity),
        title: compact && !annotation.id.includes('support') && !annotation.id.includes('resistance') && !isLiquidity ? '' : annotation.label,
      }))
    }

    annotations.forEach(addLine)
    userLevels.forEach(addLine)
    armedAlerts.forEach(addLine)

    tradeLines.forEach((annotation) => {
      if (!Number.isFinite(annotation.price) || annotation.price <= 0 || seen.has(annotation.id)) return
      seen.add(annotation.id)
      lines.push(series.createPriceLine({
        price: annotation.price,
        color: annotation.color,
        lineWidth: annotation.lineWidth ?? 2,
        lineStyle: 0,
        axisLabelVisible: !compact && annotation.id.endsWith('-entry'),
        title: compact ? '' : annotation.label,
      }))
    })

    return () => { lines.forEach((line) => series.removePriceLine(line)) }
  }, [annotations, armedAlerts, showPriceLabels, tradeLines, userLevels])

  useEffect(() => {
    const series = seriesRef.current
    if (!series) return
    const compact = (containerRef.current?.clientWidth ?? 1000) < 640
    const bid = Number.isFinite(bidPrice) && Number(bidPrice) > 0 ? Number(bidPrice) : lastClose
    const ask = Number.isFinite(askPrice) && Number(askPrice) > 0 ? Number(askPrice) : bid

    const updateLine = (
      ref: React.MutableRefObject<IPriceLine | null>,
      options: (Parameters<IPriceLine['applyOptions']>[0] & { price: number }) | null,
    ): void => {
      if (!options) {
        if (ref.current) {
          series.removePriceLine(ref.current)
          ref.current = null
        }
        return
      }
      if (ref.current) {
        ref.current.applyOptions(options)
      } else {
        ref.current = series.createPriceLine(options)
      }
    }

    updateLine(
      marketBidLineRef,
      Number.isFinite(bid) && bid > 0
        ? {
            price: bid,
            color: '#22D3A5',
            lineWidth: 2,
            lineStyle: 0,
            axisLabelVisible: showPriceLabels,
            axisLabelColor: '#22D3A5',
            axisLabelTextColor: '#07110E',
            title: compact ? 'SELL' : 'SELL / BID',
          }
        : null,
    )
    updateLine(
      marketAskLineRef,
      Number.isFinite(ask) && ask > 0
        ? {
            price: ask,
            color: '#FF5C75',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: showPriceLabels,
            axisLabelColor: '#FF5C75',
            axisLabelTextColor: '#19070B',
            title: compact ? 'BUY' : 'BUY / ASK',
          }
        : null,
    )
  }, [askPrice, bidPrice, lastClose, showPriceLabels])


  useEffect(() => {
    const chart = chartRef.current
    const series = seriesRef.current
    if (!chart || !series || toolMode !== 'crosshair') { setCrosshairInfo(null); return }
    const handler = (param: Parameters<NonNullable<Parameters<IChartApi['subscribeCrosshairMove']>[0]>>[0]) => {
      if (!param.point || param.point.x < 0 || param.point.y < 0) { setCrosshairInfo(null); return }
      const price = series.coordinateToPrice(param.point.y)
      if (!Number.isFinite(price) || !param.time) { setCrosshairInfo(null); return }
      const time = new Date(Number(param.time) * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      setCrosshairInfo({ price: Number(price), time })
    }
    chart.subscribeCrosshairMove(handler)
    return () => chart.unsubscribeCrosshairMove(handler)
  }, [toolMode])

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

    if (toolMode === 'level') {
      const level = { id: `level-${Date.now()}`, price: Number(price), label: 'Level', color: '#7C5CFC', dashed: true }
      setUserLevels((current) => [...current, level].slice(-6))
      onToolNotice?.(`Price level placed at ${Number(price).toFixed(5)}`)
      return
    }

    if (toolMode === 'alert') {
      setAlertCandidate(Number(price))
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
    setArmedAlerts([])
    setAlertCandidate(null)
    setMeasureStart(null)
    setMeasureEnd(null)
    onToolNotice?.('Chart drawings cleared.')
  }

  const measureDelta = measureStart !== null && measureEnd !== null ? Math.abs(measureEnd - measureStart) / Math.max(pipSize, Number.EPSILON) : null
  const quotePrecision = Math.max(2, Math.round(Math.log10(1 / Math.max(pipSize, 0.00001))))
  const displayBid = Number.isFinite(bidPrice) && Number(bidPrice) > 0 ? Number(bidPrice) : lastClose
  const displayAsk = Number.isFinite(askPrice) && Number(askPrice) > 0 ? Number(askPrice) : displayBid
  const spreadPips = Number.isFinite(displayBid) && Number.isFinite(displayAsk) && pipSize > 0 ? (displayAsk - displayBid) / pipSize : 0
  const timeframeSeconds: Record<Timeframe, number> = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D1: 86400 }
  const countdown = timeframe && Number.isFinite(marketTimestamp) ? Math.max(0, timeframeSeconds[timeframe] - (Math.floor(Number(marketTimestamp)) % timeframeSeconds[timeframe])) : null
  const formatCountdown = (seconds: number): string => {
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
    if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    return `${seconds}s`
  }

  useEffect(() => {
    if (armedAlerts.length === 0 || !Number.isFinite(lastClose)) return
    const hit = armedAlerts.find((alert) => (lastClose >= alert.price && alert.color === '#22D3A5') || (lastClose <= alert.price && alert.color === '#F5B84B'))
    if (hit) {
      onToolNotice?.(`Price alert reached ${hit.price.toFixed(5)}`)
      setArmedAlerts((current) => current.filter((alert) => alert.id !== hit.id))
    }
  }, [armedAlerts, lastClose, onToolNotice])

  const armAlert = (): void => {
    if (alertCandidate === null) return
    const directionUp = alertCandidate > (lastClose || alertCandidate)
    const alert = { id: `alert-${Date.now()}`, price: alertCandidate, label: directionUp ? 'Alert ↑' : 'Alert ↓', color: directionUp ? '#22D3A5' : '#F5B84B', dashed: true, armed: true }
    setArmedAlerts((current) => [...current, alert].slice(-4))
    setAlertCandidate(null)
    onToolNotice?.(`Alert armed at ${alertCandidate.toFixed(5)}.`)
  }

  const cancelAlert = (): void => setAlertCandidate(null)

  return <div ref={containerRef} onPointerDown={placeTool} className={`shafx-chart-shell relative w-full overflow-hidden border border-shafx-border bg-shafx-bg ${['level', 'alert', 'measure'].includes(toolMode) ? 'cursor-crosshair' : ''}`} style={{ height, minHeight: 280 }}>
    <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 rounded-xl border border-shafx-border bg-shafx-bg/90 px-2.5 py-1.5 text-[9px] font-semibold backdrop-blur"><span className="text-shafx-accent">SHAFX</span><span className="text-shafx-textMuted">•</span><span className="text-shafx-textMuted">{timeframe ?? 'PRICE'} workspace</span></div>
    <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-xl border border-shafx-border bg-shafx-bg/90 px-2.5 py-1.5 text-[9px] font-semibold text-shafx-text backdrop-blur">{meta.label} <span className="font-normal text-shafx-textMuted">• {meta.interval}</span></div>
    <div className="pointer-events-none absolute left-3 top-12 z-10 rounded-xl border border-shafx-border/70 bg-shafx-surface/85 px-2 py-1 shadow-md backdrop-blur">
      <span className="text-[8px] font-semibold uppercase tracking-[0.12em] text-shafx-textMuted">{chartMode === 'candles' ? 'Candles' : chartMode === 'bars' ? 'Bars' : chartMode === 'wave' ? 'Wave' : 'Area'}</span>
      {countdown !== null && <span className="ml-2 font-mono text-[9px] font-semibold tabular text-shafx-accent">Close {formatCountdown(countdown)}</span>}
    </div>
    <div className="pointer-events-none absolute right-3 top-12 z-10 flex items-center gap-1 rounded-xl border border-shafx-border/70 bg-shafx-surface/85 px-1 py-0.5 shadow-md backdrop-blur">
      <span className="rounded-lg px-1.5 py-0.5 text-[8px] font-bold tabular text-shafx-success"><span className="mr-1 text-[8px] uppercase tracking-[0.12em]">SELL</span>{Number.isFinite(displayBid) ? displayBid.toFixed(quotePrecision) : '—'}</span>
      <span className="h-3.5 w-px bg-shafx-border" />
      <span className="rounded-lg px-2 py-1 text-[9px] font-bold tabular text-shafx-danger"><span className="mr-1 text-[8px] uppercase tracking-[0.12em]">BUY</span>{Number.isFinite(displayAsk) ? displayAsk.toFixed(quotePrecision) : '—'}</span>
      <span className="hidden border-l border-shafx-border pl-2 text-[8px] font-semibold tabular text-shafx-textMuted sm:inline">SP {spreadPips.toFixed(1)}p</span>
    </div>
    {toolMode === 'crosshair' && crosshairInfo && <div className="pointer-events-none absolute left-3 bottom-3 z-20 rounded-xl border border-shafx-accent/25 bg-shafx-surface/95 px-3 py-2 text-[9px] shadow-xl"><span className="text-shafx-textMuted">Crosshair</span><strong className="ml-2 font-mono text-shafx-text">{crosshairInfo.price.toFixed(5)}</strong><span className="ml-2 text-shafx-textMuted">{crosshairInfo.time}</span></div>}
    {(toolMode === 'level' || toolMode === 'alert' || toolMode === 'measure') && <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-xl border border-shafx-border bg-shafx-surface/95 px-3 py-2 text-[9px] text-shafx-textMuted shadow-xl"><Crosshair className="h-3.5 w-3.5 text-shafx-accent" />{toolMode === 'level' ? 'Tap chart to place a price level' : toolMode === 'alert' ? 'Tap chart, then confirm the alert price' : measureStart === null ? 'Tap first point to measure' : measureEnd === null ? 'Tap second point to finish' : 'Measure complete'}</div>}
    {alertCandidate !== null && <div className="absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-2xl border border-shafx-warning/30 bg-shafx-surface/98 px-3 py-3 shadow-2xl backdrop-blur"><div className="text-[9px] uppercase tracking-[0.14em] text-shafx-textMuted">Price alert</div><div className="mt-1 font-mono text-sm font-semibold text-shafx-text">{alertCandidate.toFixed(5)}</div><div className="mt-2 flex gap-2"><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={armAlert} className="min-h-10 rounded-xl bg-shafx-warning px-3 text-[10px] font-semibold text-black">Arm alert</button><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={cancelAlert} className="min-h-10 rounded-xl border border-shafx-border px-3 text-[10px] text-shafx-textMuted">Cancel</button></div></div>}
    {measureDelta !== null && <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-xl border border-shafx-info/20 bg-shafx-surface/95 px-3 py-2 text-[9px] shadow-xl"><div className="flex items-center gap-2 text-shafx-textMuted"><Ruler className="h-3.5 w-3.5 text-shafx-info" />Range</div><strong className="mt-1 block font-mono text-xs text-shafx-text">{measureDelta.toFixed(1)} pips</strong></div>}
    {(userLevels.length > 0 || armedAlerts.length > 0) && <div className="pointer-events-none absolute right-3 bottom-3 z-20 hidden max-w-[48%] gap-1 overflow-hidden sm:flex"><div className="truncate rounded-xl border border-shafx-border bg-shafx-surface/95 px-2.5 py-1.5 text-[9px] text-shafx-textMuted shadow-xl">{userLevels.length} level{userLevels.length === 1 ? '' : 's'} • {armedAlerts.length} alert{armedAlerts.length === 1 ? '' : 's'}</div></div>}
    {userLevels.length > 0 && <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={clearDrawings} className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-xl border border-shafx-border bg-shafx-surface px-2.5 py-1.5 text-[9px] text-shafx-textMuted shadow-xl hover:text-shafx-text"><Eraser className="h-3 w-3" />Clear levels</button>}
  </div>
}
