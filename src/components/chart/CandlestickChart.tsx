import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ColorType, createChart, type CandlestickData, type IChartApi, type IPriceLine, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts'
import { Crosshair, Eraser, Maximize2, Minimize2, Ruler, RotateCcw } from 'lucide-react'
import type { CandleTheme, ChartMode } from '../../app/chartSettings'
import { TIMEFRAMES, type OHLCV, type Timeframe } from '../../types'

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
  candleTheme?: CandleTheme
  chartMode?: ChartMode
  marketTimestamp?: number
  onTimeframeChange?: (timeframe: Timeframe) => void
  replayMode?: boolean
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

const VISIBLE_BARS_BY_TIMEFRAME: Record<Timeframe, number> = {
  M1: 120,
  M5: 100,
  M15: 80,
  M30: 60,
  H1: 52,
  H4: 45,
  D1: 36,
  W1: 28,
}

const visibleBarsForTimeframe = (nextTimeframe: Timeframe | undefined, width: number): number => {
  const base = VISIBLE_BARS_BY_TIMEFRAME[nextTimeframe ?? 'H1']
  return width < 640 ? Math.max(18, Math.round(base * 0.72)) : base
}

const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  M30: 1800,
  H1: 3600,
  H4: 14400,
  D1: 86400,
  W1: 604800,
}
const timeframeSecondsFor = (nextTimeframe: Timeframe): number => TIMEFRAME_SECONDS[nextTimeframe]

export const CandlestickChart: React.FC<CandlestickChartProps> = ({ data, height = '100%', annotations = [], timeframe, symbol, toolMode = 'cursor', pipSize = 0.0001, onToolNotice, showGrid = true, showPriceLabels = true, bidPrice, askPrice, tradeLines = [], candleTheme = 'shafx', chartMode = 'candles', marketTimestamp, onTimeframeChange, replayMode = false }) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ShafxSeries | null>(null)
  const seriesConfigRef = useRef<{ chartMode: ChartMode; pipSize: number } | null>(null)
  const chartData = useMemo(() => prepareData(data), [data])
  const visualData = useMemo(() => {
    if (chartMode === 'candles' || chartMode === 'bars') return chartData
    return chartData.map((candle) => ({ time: candle.time, value: candle.close }))
  }, [chartData, chartMode])
  const lastClose = chartData.length ? Number(chartData[chartData.length - 1]?.close) : Number.NaN
  const [userLevels, setUserLevels] = useState<UserLevel[]>([])
  const [measureStart, setMeasureStart] = useState<number | null>(null)
  const [measureEnd, setMeasureEnd] = useState<number | null>(null)
  const [alertCandidate, setAlertCandidate] = useState<number | null>(null)
  const [armedAlerts, setArmedAlerts] = useState<UserLevel[]>([])
  const viewInitializedRef = useRef(false)
  const previousSymbolRef = useRef<string | undefined>(symbol)
  const previousTimeframeRef = useRef<Timeframe | undefined>(timeframe)
  const tapGestureRef = useRef<{ startX: number; startY: number; moved: boolean }>({ startX: 0, startY: 0, moved: false })
  const chartInteractionRef = useRef(false)
  const lastTapRef = useRef<{ time: number; x: number; y: number; pointerType: string } | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [timeframeMenuOpen, setTimeframeMenuOpen] = useState(false)
  const renderedFirstTimeRef = useRef<number | null>(null)
  const renderedLastTimeRef = useRef<number | null>(null)
  const renderedDataLengthRef = useRef(0)
  const [crosshairInfo, setCrosshairInfo] = useState<{ price: number; time: string } | null>(null)
  const [hoverCandle, setHoverCandle] = useState<{ time: number; open?: number; high?: number; low?: number; close: number } | null>(null)
  const [timelineMarks, setTimelineMarks] = useState<Array<{ x: number; label: string }>>([])
  const displayedStructuralAnnotationsRef = useRef<ChartAnnotation[]>([])
  const structuralZoneLayerRef = useRef<HTMLDivElement | null>(null)
  const structuralZoneElementsRef = useRef<Map<string, HTMLDivElement>>(new Map())
  const priceLinesRef = useRef<Map<string, IPriceLine>>(new Map())
  const priceLinesSeriesRef = useRef<ShafxSeries | null>(null)
  // Fullscreen is an explicit user action only. Device rotation must never pin the chart.

  useEffect(() => {
    const onFullscreenChange = (): void => setIsFullscreen(document.fullscreenElement === containerRef.current)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  // A rotation into mobile landscape should return the terminal to normal document flow.
  // Fullscreen remains an explicit action via the chart button.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(orientation: landscape) and (max-width: 999px)')
    const leaveBrowserFullscreenOnLandscape = (): void => {
      if (!media.matches) return
      if (document.fullscreenElement === containerRef.current) {
        void document.exitFullscreen().catch(() => undefined)
      }
      setIsFullscreen(false)
      setTimeframeMenuOpen(false)
    }
    leaveBrowserFullscreenOnLandscape()
    media.addEventListener('change', leaveBrowserFullscreenOnLandscape)
    window.addEventListener('orientationchange', leaveBrowserFullscreenOnLandscape)
    return () => {
      media.removeEventListener('change', leaveBrowserFullscreenOnLandscape)
      window.removeEventListener('orientationchange', leaveBrowserFullscreenOnLandscape)
    }
  }, [])

  const verticalScaleDragRef = useRef<{ startY: number; top: number; bottom: number } | null>(null)
  const verticalScaleMarginsRef = useRef({ top: 0.08, bottom: 0.08 })
  const priceAxisLastTapRef = useRef<number>(0)
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
  // Use fractional-pip precision like MT5: Forex displays 5 digits and JPY/XAU-style
  // symbols display 3 digits when their native pip is 0.01.
  const priceStep = Math.max(pipSize / 10, 0.000001)
  const pricePrecision = Math.max(2, Math.round(Math.log10(1 / priceStep)))

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const chart = createChart(el, {
      layout: { background: { type: ColorType.Solid, color: '#070A0F' }, textColor: '#8A96A8', attributionLogo: false },
      grid: showGrid ? { vertLines: { color: '#131A23' }, horzLines: { color: '#131A23' } } : { vertLines: { color: 'transparent' }, horzLines: { color: 'transparent' } },
      width: el.clientWidth,
      height: Math.max(280, el.clientHeight),
      crosshair: { mode: 0, vertLine: { color: '#667285', width: 1, style: 2, labelBackgroundColor: '#202A38' }, horzLine: { color: '#667285', width: 1, style: 2, labelBackgroundColor: '#202A38' } },
      rightPriceScale: { borderColor: '#202A38', minimumWidth: el.clientWidth < 640 ? 78 : 94, alignLabels: true, ticksVisible: true, scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: {
        visible: true,
        borderVisible: true,
        borderColor: '#202A38',
        timeVisible: true,
        secondsVisible: false,
        ticksVisible: false,
        minimumHeight: 30,
        uniformDistribution: true,
        rightOffset: 3,
        barSpacing: 5,
        minBarSpacing: 1,
        shiftVisibleRangeOnNewBar: false,
        allowShiftVisibleRangeOnWhitespaceReplacement: false,
        tickMarkFormatter: () => '',
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
      kineticScroll: { touch: true, mouse: false },
    })

    chartRef.current = chart
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height: h } = entry.contentRect
      if (width > 0 && h > 0) chart.applyOptions({ width, height: Math.max(280, h) })
    })
    const onVisibleRangeChange = (range: { from: number; to: number } | null): void => {
      if (!range) return

      const lastIndex = latestIndexRef.current
      if (lastIndex < 0) {
        followRealtimeRef.current = true
        return
      }

      // Never let a transient range callback re-enable realtime-follow while
      // the user is actively dragging/zooming. Pointer-up evaluates the final
      // range once the gesture is complete.
      if (chartInteractionRef.current) {
        if (range.to < lastIndex - 1) followRealtimeRef.current = false
        return
      }

      followRealtimeRef.current = range.to >= lastIndex - 1
    }
    chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleRangeChange)
    ro.observe(el)
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleRangeChange)
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
      seriesConfigRef.current = null
      marketBidLineRef.current = null
      marketAskLineRef.current = null
    }
  }, [])
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const layer = document.createElement('div')
    layer.setAttribute('aria-hidden', 'true')
    layer.style.position = 'absolute'
    layer.style.left = '0'
    layer.style.top = '40px'
    layer.style.right = '82px'
    layer.style.bottom = '32px'
    layer.style.pointerEvents = 'none'
    layer.style.overflow = 'hidden'
    layer.style.zIndex = '8'
    layer.style.fontFamily = 'Arial, sans-serif'
    container.appendChild(layer)
    structuralZoneLayerRef.current = layer

    const onResize = (): void => {
      layer.style.right = container.clientWidth < 640 ? '82px' : '96px'
    }
    onResize()
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      layer.remove()
      structuralZoneLayerRef.current = null
      structuralZoneElementsRef.current.clear()
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.applyOptions({
      grid: showGrid
        ? { vertLines: { color: 'transparent' }, horzLines: { color: '#131A23' } }
        : { vertLines: { color: 'transparent' }, horzLines: { color: 'transparent' } },
    })
  }, [showGrid])

  useLayoutEffect(() => {
    const chart = chartRef.current
    if (!chart || !visualData.length) return

    const colors = candleColors[candleTheme]
    const precision = pricePrecision
    const currentConfig = seriesConfigRef.current
    const needsNewSeries =
      !seriesRef.current ||
      !currentConfig ||
      currentConfig.chartMode !== chartMode ||
      currentConfig.pipSize !== pipSize

    if (needsNewSeries) {
      if (seriesRef.current) {
        try { chart.removeSeries(seriesRef.current) } catch { /* stale series during a live mode switch */ }
        seriesRef.current = null
      }
      priceLinesRef.current.clear()
      priceLinesSeriesRef.current = null

      let nextSeries: ShafxSeries
      if (chartMode === 'bars') {
        nextSeries = chart.addBarSeries({
          priceFormat: { type: 'price', precision, minMove: priceStep },
          upColor: colors.up,
          downColor: colors.down,
          openVisible: true,
          thinBars: false,
          priceLineVisible: false,
          lastValueVisible: false,
        })
      } else if (chartMode === 'wave') {
        nextSeries = chart.addLineSeries({
          color: colors.up,
          lineWidth: 2,
          crosshairMarkerVisible: true,
          priceLineVisible: false,
          lastValueVisible: false,
        })
      } else if (chartMode === 'area') {
        nextSeries = chart.addAreaSeries({
          lineColor: colors.up,
          topColor: colors.up + '66',
          bottomColor: colors.up + '05',
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        })
      } else {
        nextSeries = chart.addCandlestickSeries({
          priceFormat: { type: 'price', precision, minMove: priceStep },
          upColor: colors.up,
          downColor: colors.down,
          borderUpColor: colors.up,
          borderDownColor: colors.down,
          wickUpColor: colors.up,
          wickDownColor: colors.down,
          priceLineVisible: false,
          lastValueVisible: false,
        })
      }

      seriesRef.current = nextSeries
      seriesConfigRef.current = { chartMode, pipSize }
    }

    const series = seriesRef.current
    if (!series) return

    const lastIndex = visualData.length - 1
    const lastPoint = visualData[lastIndex]
    const lastTime = Number(lastPoint.time)
    const firstTime = Number(visualData[0].time)
    const symbolChanged = previousSymbolRef.current !== symbol
    const timeframeChanged = previousTimeframeRef.current !== timeframe
    const replayWindowReset = renderedLastTimeRef.current !== null && lastTime < renderedLastTimeRef.current
    const previousLastTime = renderedLastTimeRef.current
    const previousDataLength = renderedDataLengthRef.current
    const isModeSwitch = currentConfig?.chartMode !== chartMode || currentConfig?.pipSize !== pipSize
    const structureChanged =
      needsNewSeries ||
      previousDataLength === 0 ||
      firstTime !== renderedFirstTimeRef.current ||
      (previousLastTime !== null && lastTime < previousLastTime) ||
      visualData.length < previousDataLength
    const rangeNeedsReset = !viewInitializedRef.current || symbolChanged || timeframeChanged || replayWindowReset
    const visibleTimeRange = chart.timeScale().getVisibleRange()
    const visibleLogicalRange = chart.timeScale().getVisibleLogicalRange()
    const wasFollowingRealtime = followRealtimeRef.current && !chartInteractionRef.current
    const isNewBar = previousLastTime !== null && lastTime > previousLastTime

    /*
     * IMPORTANT:
     * Do not call setData() for every quote tick. Lightweight Charts can rebuild
     * the logical range when the whole dataset is replaced, which is what made
     * historical scrolling jump back to the newest candle and made the viewport
     * appear to zoom/flicker.
     *
     * Normal live candles use update(). setData() is reserved for a real dataset
     * replacement: first render, timeframe/symbol changes, mode changes, or when
     * the rolling history window actually shifts.
     */
    if (structureChanged || rangeNeedsReset || isModeSwitch) {
      series.setData(visualData)
    } else {
      series.update(lastPoint)
    }

    if (rangeNeedsReset) {
      chart.timeScale().resetTimeScale()
      const containerWidth = containerRef.current?.clientWidth ?? 640
      const plotWidth = Math.max(280, containerWidth - (containerWidth < 640 ? 82 : 96))
      const targetBars = visibleBarsForTimeframe(timeframe, containerWidth)
      const initialBarSpacing = Math.max(5, Math.min(20, plotWidth / Math.max(1, targetBars)))

      chart.timeScale().applyOptions({
        barSpacing: initialBarSpacing,
        minBarSpacing: 1,
        rightOffset: 3,
        visible: true,
      })
      chart.timeScale().scrollToRealTime()
      verticalScaleMarginsRef.current = { top: 0.08, bottom: 0.08 }
      series.priceScale().applyOptions({ autoScale: true, scaleMargins: { top: 0.08, bottom: 0.08 } })
      followRealtimeRef.current = true
    } else {
      /*
       * When the user is looking at history, preserve the exact time window
       * across a data-window replacement. We restore by time rather than logical
       * index so older bars do not shift the user's viewport.
       */
      if (!wasFollowingRealtime && (structureChanged || isModeSwitch)) {
        try {
          if (visibleLogicalRange) {
            chart.timeScale().setVisibleLogicalRange(visibleLogicalRange)
          } else if (visibleTimeRange) {
            chart.timeScale().setVisibleRange(visibleTimeRange)
          }
        } catch {
          /* The broker may have replaced a range that is no longer available. */
        }
        followRealtimeRef.current = false
      }

      /*
       * Only a user who is already following the live edge should be advanced
       * when a new candle is created. A trader browsing history must never be
       * dragged to the front by a live candle.
       */
      if (isNewBar && wasFollowingRealtime) {
        chart.timeScale().scrollToRealTime()
        followRealtimeRef.current = true
      }
    }

    latestIndexRef.current = lastIndex
    viewInitializedRef.current = true
    previousSymbolRef.current = symbol
    previousTimeframeRef.current = timeframe
    renderedFirstTimeRef.current = firstTime
    renderedLastTimeRef.current = lastTime
    renderedDataLengthRef.current = visualData.length
  }, [visualData, symbol, timeframe, chartMode, pipSize])

  /*
   * Presentation changes are separate from data updates. This prevents quote
   * ticks from repeatedly re-applying series options while the user is trying
   * to scroll or zoom, which is another source of visual jitter.
   */
  useEffect(() => {
    const series = seriesRef.current
    if (!series) return

    const colors = candleColors[candleTheme]
    if (chartMode === 'wave') {
      series.applyOptions({
        color: colors.up,
        lineColor: colors.up,
      })
    } else if (chartMode === 'area') {
      series.applyOptions({
        lineColor: colors.up,
        topColor: colors.up + '66',
        bottomColor: colors.up + '05',
      })
    } else if (chartMode === 'bars') {
      series.applyOptions({
        upColor: colors.up,
        downColor: colors.down,
        priceFormat: { type: 'price', precision: pricePrecision, minMove: priceStep },
      })
    } else {
      series.applyOptions({
        upColor: colors.up,
        downColor: colors.down,
        borderUpColor: colors.up,
        borderDownColor: colors.down,
        wickUpColor: colors.up,
        wickDownColor: colors.down,
        priceFormat: { type: 'price', precision: pricePrecision, minMove: priceStep },
      })
    }
  }, [chartMode, candleTheme, pipSize])
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !chartData.length || !timeframe) {
      setTimelineMarks([])
      return
    }

    const timeScale = chart.timeScale()
    const updateTimeline = (): void => {
      const range = timeScale.getVisibleLogicalRange()
      const width = timeScale.width()
      if (!range || width <= 0) {
        setTimelineMarks([])
        return
      }

      const from = Math.max(0, Math.floor(range.from))
      const to = Math.min(chartData.length - 1, Math.ceil(range.to))
      const visibleCount = Math.max(1, to - from + 1)
      const pxPerBar = width / visibleCount
      const minimumLabelSpacing = width < 640 ? 62 : 74

      // Adaptive density: when zoomed in enough, show every timeframe boundary;
      // when zoomed out, progressively group bars while keeping all marks on
      // exact timeframe boundaries. This mirrors the way MT5 avoids collisions.
      const candidates = [1, 2, 4, 6, 12, 24, 48, 96, 192]
      const step = candidates.find((candidate) => candidate * pxPerBar >= minimumLabelSpacing) ?? 192
      const interval = timeframeSecondsFor(timeframe) * step
      const marks: Array<{ x: number; label: string }> = []

      for (let index = from; index <= to; index += 1) {
        const candle = chartData[index]
        if (!candle) continue
        const timestamp = Number(candle.time)
        if (!Number.isFinite(timestamp)) continue

        // Keep marks on exact timeframe boundaries. For grouped labels, use
        // the larger interval's boundary (e.g. M30+2 => every 60 minutes).
        if (Math.floor(timestamp / interval) * interval !== timestamp) continue

        const x = timeScale.timeToCoordinate(candle.time as UTCTimestamp)
        if (x === null || x < -40 || x > width + 40) continue

        const date = new Date(timestamp * 1000)
        const label = timeframe === 'D1' || timeframe === 'W1'
          ? String(date.getDate()).padStart(2, '0') + ' ' + date.toLocaleString('en-GB', { month: 'short' })
          : date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })

        marks.push({ x: Number(x), label })
      }

      const selected: Array<{ x: number; label: string }> = []
      for (const mark of marks.sort((a, b) => a.x - b.x)) {
        const previous = selected[selected.length - 1]
        if (!previous || mark.x - previous.x >= minimumLabelSpacing) selected.push(mark)
      }
      setTimelineMarks(selected)
    }

    updateTimeline()
    timeScale.subscribeVisibleLogicalRangeChange(updateTimeline)
    const onResize = (): void => updateTimeline()
    window.addEventListener('resize', onResize)
    return () => {
      timeScale.unsubscribeVisibleLogicalRangeChange(updateTimeline)
      window.removeEventListener('resize', onResize)
    }
  }, [chartData, timeframe, isFullscreen, marketTimestamp])

  useEffect(() => {
    const chart = chartRef.current
    const series = seriesRef.current
    const layer = structuralZoneLayerRef.current
    const container = containerRef.current
    if (!chart || !series || !layer || !container) return

    const structuralAnnotations = followRealtimeRef.current || displayedStructuralAnnotationsRef.current.length === 0
      ? annotations
      : displayedStructuralAnnotationsRef.current

    if (followRealtimeRef.current) displayedStructuralAnnotationsRef.current = annotations

    const desired = new Set<string>()
    const elements = structuralZoneElementsRef.current

    const paletteFor = (annotation: ChartAnnotation): { fill: string; border: string; badge: string; shortLabel: string } => {
      if (annotation.id.includes('support')) {
        return { fill: 'rgba(34,211,165,.09)', border: 'rgba(34,211,165,.34)', badge: 'rgba(34,211,165,.16)', shortLabel: 'SUP' }
      }
      if (annotation.id.includes('resistance')) {
        return { fill: 'rgba(255,92,117,.09)', border: 'rgba(255,92,117,.34)', badge: 'rgba(255,92,117,.16)', shortLabel: 'RES' }
      }
      return {
        fill: 'transparent',
        border: 'rgba(92,168,255,.70)',
        badge: 'rgba(92,168,255,.14)',
        shortLabel: annotation.id.includes('buy') ? 'BSL' : annotation.id.includes('sell') ? 'SSL' : 'LIQ',
      }
    }

    const updatePositions = (): void => {
      const compact = container.clientWidth < 640
      const plotWidth = Math.max(220, container.clientWidth - (compact ? 82 : 96))
      const srLeft = compact ? Math.round(plotWidth * 0.20) : Math.round(plotWidth * 0.34)
      const srWidth = compact ? Math.round(plotWidth * 0.64) : Math.round(plotWidth * 0.56)
      const liqLeft = compact ? Math.round(plotWidth * 0.52) : Math.round(plotWidth * 0.58)
      const liqWidth = compact ? Math.round(plotWidth * 0.30) : Math.round(plotWidth * 0.30)

      for (const annotation of structuralAnnotations) {
        const el = elements.get(annotation.id)
        if (!el) continue
        const y = series.priceToCoordinate(annotation.price)
        if (y === null || !Number.isFinite(y)) {
          el.style.display = 'none'
          continue
        }

        const isLiquidity = annotation.id.includes('liquidity')
        const left = isLiquidity ? liqLeft : srLeft
        const width = isLiquidity ? liqWidth : srWidth

        el.style.display = 'block'
        el.style.left = left + 'px'
        el.style.width = width + 'px'
        el.style.top = Math.round(y - (isLiquidity ? 0 : 1)) + 'px'
        el.style.height = '0'
      }
    }

    for (const annotation of structuralAnnotations) {
      if (!annotation.id || !Number.isFinite(annotation.price) || annotation.price <= 0) continue
      desired.add(annotation.id)

      const palette = paletteFor(annotation)
      let el = elements.get(annotation.id)
      if (!el) {
        el = document.createElement('div')
        el.style.position = 'absolute'
        el.style.boxSizing = 'border-box'
        el.style.borderRadius = '0'
        el.style.pointerEvents = 'none'
        el.style.transition = 'none'

        const badge = document.createElement('span')
        badge.dataset.role = 'badge'
        badge.style.position = 'absolute'
        badge.style.left = '6px'
        badge.style.top = '50%'
        badge.style.transform = 'translateY(-50%)'
        badge.style.padding = '1px 4px'
        badge.style.borderRadius = '3px'
        badge.style.fontSize = '8px'
        badge.style.fontWeight = '700'
        badge.style.letterSpacing = '.08em'
        badge.style.lineHeight = '1'
        badge.style.whiteSpace = 'nowrap'

        const label = document.createElement('span')
        label.dataset.role = 'label'
        label.style.position = 'absolute'
        label.style.right = '6px'
        label.style.top = '50%'
        label.style.transform = 'translateY(-50%)'
        label.style.fontSize = '8px'
        label.style.fontWeight = '600'
        label.style.opacity = '.78'
        label.style.whiteSpace = 'nowrap'

        el.appendChild(badge)
        el.appendChild(label)
        layer.appendChild(el)
        elements.set(annotation.id, el)
      }

      const badge = el.querySelector('[data-role="badge"]') as HTMLSpanElement | null
      const label = el.querySelector('[data-role="label"]') as HTMLSpanElement | null

      el.style.background = 'transparent'
      el.style.border = '0'
      el.style.borderTop = (annotation.id.includes('liquidity') ? '1px dashed ' : '2px solid ') + palette.border
      el.style.boxShadow = 'none'
      if (badge) {
        badge.textContent = palette.shortLabel
        badge.style.background = palette.badge
        badge.style.color = palette.border
      }
      if (label) {
        label.textContent = annotation.label
        label.style.color = palette.border
        label.style.display = container.clientWidth < 640 ? 'none' : 'block'
      }
    }

    for (const [id, element] of elements) {
      if (desired.has(id)) continue
      element.remove()
      elements.delete(id)
    }

    updatePositions()
    const onRange = (): void => updatePositions()
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange)
    const ro = new ResizeObserver(updatePositions)
    ro.observe(container)
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange)
      ro.disconnect()
    }
  }, [annotations, chartMode, isFullscreen, pipSize, timeframe])

  useEffect(() => {
    const series = seriesRef.current
    if (!series) return

    const compact = (containerRef.current?.clientWidth ?? 1000) < 640
    const desired = new Set<string>()

    // A new chart series has no relationship to the old price-line objects.
    // Drop the old references without removing them from the already-discarded
    // series, then build the lines once for the new series.
    if (priceLinesSeriesRef.current !== series) {
      priceLinesRef.current.clear()
      priceLinesSeriesRef.current = series
    }

    const upsertLine = (
      annotation: ChartAnnotation | UserLevel,
      lineStyle: 0 | 1 | 2,
      axisLabelVisible: boolean,
      title: string,
    ): void => {
      if (!annotation.id || !Number.isFinite(annotation.price) || annotation.price <= 0) return
      desired.add(annotation.id)

      const options = {
        price: annotation.price,
        color: annotation.color,
        lineWidth: annotation.lineWidth ?? (lineStyle === 0 ? 2 : 1),
        lineStyle,
        axisLabelVisible,
        title,
      }

      const existing = priceLinesRef.current.get(annotation.id)
      if (existing) {
        existing.applyOptions(options)
        return
      }

      priceLinesRef.current.set(annotation.id, series.createPriceLine(options))
    }

    userLevels.forEach((annotation) => {
      upsertLine(annotation, annotation.dashed ? 2 : 1, showPriceLabels && !compact, compact ? '' : annotation.label)
    })

    armedAlerts.forEach((annotation) => {
      upsertLine(annotation, 2, showPriceLabels && !compact, compact ? '' : annotation.label)
    })

    tradeLines.forEach((annotation) => {
      if (!Number.isFinite(annotation.price) || annotation.price <= 0) return
      upsertLine(
        annotation,
        0,
        !compact && annotation.id.endsWith('-entry'),
        compact ? '' : annotation.label,
      )
    })

    // Remove only lines that are no longer wanted. Existing lines stay alive
    // and are updated in place, so live ticks no longer cause a remove/create
    // flash on every candle update.
    for (const [id, line] of priceLinesRef.current) {
      if (desired.has(id)) continue
      try { series.removePriceLine(line) } catch { /* series may have been replaced */ }
      priceLinesRef.current.delete(id)
    }
  }, [annotations, armedAlerts, chartMode, pipSize, showPriceLabels, tradeLines, userLevels])
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
            color: '#FF5C75',
            lineWidth: 2,
            lineStyle: 0,
            axisLabelVisible: showPriceLabels,
            axisLabelColor: '#FF5C75',
            axisLabelTextColor: '#19070B',
            title: compact ? 'SELL' : 'SELL / BID',
          }
        : null,
    )
    updateLine(
      marketAskLineRef,
      Number.isFinite(ask) && ask > 0
        ? {
            price: ask,
            color: '#22D3A5',
            lineWidth: 2,
            lineStyle: 0,
            axisLabelVisible: showPriceLabels,
            axisLabelColor: '#22D3A5',
            axisLabelTextColor: '#07110E',
            title: compact ? 'BUY' : 'BUY / ASK',
          }
        : null,
    )
  }, [askPrice, bidPrice, lastClose, showPriceLabels])


  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    const handler = (param: Parameters<NonNullable<Parameters<IChartApi['subscribeCrosshairMove']>[0]>>[0]) => {
      if (!param.time) {
        setHoverCandle(null)
        return
      }
      const targetTime = Number(param.time)
      let closest: OHLCV | undefined
      let closestDistance = Number.POSITIVE_INFINITY
      for (const candle of data) {
        const distance = Math.abs(Number(candle.time) - targetTime)
        if (distance < closestDistance) {
          closest = candle
          closestDistance = distance
        }
      }
      if (!closest || closestDistance > Math.max(1, timeframe ? TIMEFRAME_SECONDS[timeframe] : 3600)) {
        setHoverCandle(null)
        return
      }
      setHoverCandle({
        time: Math.floor(Number(closest.time) / 1000),
        open: closest.open,
        high: closest.high,
        low: closest.low,
        close: closest.close,
      })
    }

    chart.subscribeCrosshairMove(handler)
    return () => chart.unsubscribeCrosshairMove(handler)
  }, [data, timeframe])

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
      const level = { id: `level-${Date.now()}`, price: Number(price), label: 'Level', color: '#1683FF', dashed: true }
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

  const goToCurrentCandle = (): void => {
    const chart = chartRef.current
    if (!chart || !visualData.length) return
    const width = containerRef.current?.clientWidth ?? 1000
    const lastIndex = visualData.length - 1
    const visibleBars = visibleBarsForTimeframe(timeframe, width)
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, lastIndex - visibleBars + 1),
      to: lastIndex + 7,
    })
    followRealtimeRef.current = true
    setTimeframeMenuOpen(false)
    onToolNotice?.('Current candle centered.')
  }

  const chooseFullscreenTimeframe = (nextTimeframe: Timeframe): void => {
    onTimeframeChange?.(nextTimeframe)
    setTimeframeMenuOpen(false)
  }

  const handleChartPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    chartInteractionRef.current = true
    if (toolMode === 'cursor' || toolMode === 'crosshair') followRealtimeRef.current = false
    tapGestureRef.current = { startX: event.clientX, startY: event.clientY, moved: false }
  }

  const handleChartPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const gesture = tapGestureRef.current
    if (!gesture) return
    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 18) gesture.moved = true
  }
  const handleChartPointerCancel = (): void => {
    chartInteractionRef.current = false
    lastTapRef.current = null
  }

  const handleChartPointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    chartInteractionRef.current = false

    // Capture the range after a drag/pinch. This prevents the next live tick
    // from deciding to follow realtime unless the user actually finished at
    // the newest candles.
    if (toolMode === 'cursor' || toolMode === 'crosshair') {
      const range = chartRef.current?.timeScale().getVisibleLogicalRange()
      const lastIndex = latestIndexRef.current
      if (range && lastIndex >= 0) {
        followRealtimeRef.current = range.to >= lastIndex - 1
      }
    }

    if (!chartFullscreen || (toolMode !== 'cursor' && toolMode !== 'crosshair')) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const target = event.target
    if (target instanceof Element && target.closest('button')) return
    const gesture = tapGestureRef.current
    if (!gesture || gesture.moved) {
      lastTapRef.current = null
      return
    }

    // Once the radial menu is open, a single tap anywhere that is not one of
    // the timeframe/utility buttons dismisses it. A new double-tap is required
    // to open it again.
    if (timeframeMenuOpen) {
      lastTapRef.current = null
      setTimeframeMenuOpen(false)
      return
    }

    const now = performance.now()
    const previous = lastTapRef.current
    const distance = previous ? Math.hypot(event.clientX - previous.x, event.clientY - previous.y) : Number.POSITIVE_INFINITY
    const isDoubleTap = Boolean(previous && previous.pointerType === event.pointerType && now - previous.time <= 420 && distance <= 32)
    if (isDoubleTap) {
      event.preventDefault()
      event.stopPropagation()
      lastTapRef.current = null
      setTimeframeMenuOpen(true)
      return
    }
    lastTapRef.current = { time: now, x: event.clientX, y: event.clientY, pointerType: event.pointerType }
  }

  const resetVerticalScale = (): void => {
    const series = seriesRef.current
    if (!series) return
    verticalScaleMarginsRef.current = { top: 0.08, bottom: 0.08 }
    series.priceScale().applyOptions({
      autoScale: true,
      scaleMargins: { top: 0.08, bottom: 0.08 },
    })
  }

  const resetChartView = (): void => {
    resetVerticalScale()
    goToCurrentCandle()
  }

  const handlePriceAxisPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const series = seriesRef.current
    if (!series) return

    event.stopPropagation()
    event.preventDefault()

    const now = performance.now()
    const isTouchDoubleTap = event.pointerType !== 'mouse' && now - priceAxisLastTapRef.current <= 360
    priceAxisLastTapRef.current = now

    if (isTouchDoubleTap) {
      resetVerticalScale()
      event.currentTarget.releasePointerCapture?.(event.pointerId)
      return
    }

    const margins = verticalScaleMarginsRef.current
    verticalScaleDragRef.current = {
      startY: event.clientY,
      top: margins.top,
      bottom: margins.bottom,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const handlePriceAxisPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const start = verticalScaleDragRef.current
    const series = seriesRef.current
    const element = containerRef.current
    if (!start || !series || !element) return

    event.stopPropagation()
    event.preventDefault()

    const delta = (event.clientY - start.startY) / Math.max(1, element.clientHeight)

    // MetaTrader-style vertical-axis resizing: dragging downward compresses
    // the candles; dragging upward expands them. The chart is not panned.
    const marginDelta = delta * 0.45
    const margin = Math.min(0.46, Math.max(0.02, start.top + marginDelta))

    verticalScaleMarginsRef.current = { top: margin, bottom: margin }
    series.priceScale().applyOptions({
      autoScale: false,
      scaleMargins: { top: margin, bottom: margin },
    })
  }

  const handlePriceAxisPointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    event.stopPropagation()
    event.preventDefault()
    verticalScaleDragRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  const toggleFullscreen = async (): Promise<void> => {
    const element = containerRef.current
    if (!element || !document.fullscreenEnabled) return
    try {
      if (document.fullscreenElement === element) {
        await document.exitFullscreen()
        return
      }
      if (document.fullscreenEnabled && typeof element.requestFullscreen === 'function') {
        await element.requestFullscreen()
      } else {
        setIsFullscreen(true)
        onToolNotice?.('Using SHAFX full-screen workspace on this browser.')
      }
    } catch {
      setIsFullscreen(true)
      onToolNotice?.('Using SHAFX full-screen workspace on this browser.')
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
  const quotePrecision = pricePrecision
  const displayBid = Number.isFinite(bidPrice) && Number(bidPrice) > 0 ? Number(bidPrice) : lastClose
  const displayAsk = Number.isFinite(askPrice) && Number(askPrice) > 0 ? Number(askPrice) : displayBid
  const spreadPips = Number.isFinite(displayBid) && Number.isFinite(displayAsk) && pipSize > 0 ? (displayAsk - displayBid) / pipSize : 0
  const timeframeSeconds: Record<Timeframe, number> = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D1: 86400, W1: 604800 }
  const weekStart = (timestamp: number): number => {
    const date = new Date(timestamp * 1000)
    const day = date.getUTCDay()
    const daysSinceMonday = day === 0 ? 6 : day - 1
    date.setUTCDate(date.getUTCDate() - daysSinceMonday)
    date.setUTCHours(0, 0, 0, 0)
    return Math.floor(date.getTime() / 1000)
  }
  const countdown = timeframe && Number.isFinite(marketTimestamp)
    ? timeframe === 'W1'
      ? Math.max(0, weekStart(Number(marketTimestamp)) + timeframeSeconds.W1 - Math.floor(Number(marketTimestamp)))
      : Math.max(0, timeframeSeconds[timeframe] - (Math.floor(Number(marketTimestamp)) % timeframeSeconds[timeframe]))
    : null
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

  const chartFullscreen = isFullscreen;

  return <div ref={containerRef} onPointerDownCapture={handleChartPointerDown} onPointerMoveCapture={handleChartPointerMove} onPointerUpCapture={handleChartPointerUp} onPointerCancel={handleChartPointerCancel} onPointerDown={placeTool} className={`shafx-chart-shell relative w-full overflow-hidden border border-shafx-border bg-shafx-bg touch-pan-y ${['level', 'alert', 'measure'].includes(toolMode) ? 'cursor-crosshair' : ''} ${chartFullscreen ? 'fixed inset-0 z-[200] h-[100svh] w-screen' : ''}`} style={{ height: chartFullscreen ? '100svh' : height, minHeight: 280 }}>
    <div className="pointer-events-none absolute left-3 top-3 z-30 flex items-center gap-2 rounded-xl border border-shafx-border/70 bg-shafx-surface/88 px-2.5 py-1.5 shadow-md backdrop-blur">
      {!replayMode && countdown !== null && <span className="font-mono text-[8px] font-semibold tabular text-shafx-accent">CLOSE {formatCountdown(countdown)}</span>}
      {replayMode && <span className="font-mono text-[8px] font-semibold tabular text-shafx-accent">HISTORICAL</span>}
    </div>
    {hoverCandle && (
      <div className="pointer-events-none absolute left-3 top-12 z-30 rounded-xl border border-shafx-border/80 bg-shafx-surface/92 px-2.5 py-1.5 font-mono text-[8px] shadow-md backdrop-blur sm:text-[9px]">
        <span className="mr-2 text-shafx-textMuted">{new Date(hoverCandle.time * 1000).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short', hour12: false })}</span>
        {hoverCandle.open !== undefined && <><span className="text-shafx-textMuted">O</span> <b>{hoverCandle.open.toFixed(quotePrecision)}</b> <span className="ml-1 text-shafx-textMuted">H</span> <b>{Number(hoverCandle.high).toFixed(quotePrecision)}</b> <span className="ml-1 text-shafx-textMuted">L</span> <b>{Number(hoverCandle.low).toFixed(quotePrecision)}</b> <span className="ml-1 text-shafx-textMuted">C</span> <b>{hoverCandle.close.toFixed(quotePrecision)}</b></>}
        {hoverCandle.open === undefined && <><span className="text-shafx-textMuted">PRICE</span> <b>{hoverCandle.close.toFixed(quotePrecision)}</b></>}
      </div>
    )}
    <div className="absolute right-3 top-3 z-20 flex items-center gap-1">
      <div className="pointer-events-none hidden items-center gap-1 rounded-xl border border-shafx-border/70 bg-shafx-surface/85 px-1 py-0.5 shadow-md backdrop-blur sm:flex">
        <span className="rounded-lg px-1.5 py-0.5 text-[8px] font-bold tabular text-shafx-success"><span className="mr-1 text-[8px] uppercase tracking-[0.12em]">SELL</span>{Number.isFinite(displayBid) ? displayBid.toFixed(quotePrecision) : '—'}</span>
        <span className="h-3.5 w-px bg-shafx-border" />
        <span className="rounded-lg px-2 py-1 text-[9px] font-bold tabular text-shafx-danger"><span className="mr-1 text-[8px] uppercase tracking-[0.12em]">BUY</span>{Number.isFinite(displayAsk) ? displayAsk.toFixed(quotePrecision) : '—'}</span>
        <span className="hidden border-l border-shafx-border pl-2 text-[8px] font-semibold tabular text-shafx-textMuted sm:inline">SP {spreadPips.toFixed(1)}p</span>
      </div>
      <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => void toggleFullscreen()} aria-label={chartFullscreen ? 'Exit fullscreen chart' : 'Open fullscreen chart'} className="flex h-9 w-9 items-center justify-center rounded-xl border border-shafx-border bg-shafx-surface/92 text-shafx-textMuted shadow-md backdrop-blur hover:border-shafx-accent/40 hover:text-shafx-text">
        {chartFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </button>
    </div>
    {chartFullscreen && <div className="absolute right-3 top-14 z-30 flex items-center gap-1">
      <span className="rounded-xl border border-shafx-border bg-shafx-surface/90 px-2.5 py-1.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-shafx-textMuted shadow-lg backdrop-blur">Double-tap anywhere for timeframes</span>
    </div>}
    {chartFullscreen && timeframeMenuOpen && <div className="absolute left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2">
      <div className="relative h-[236px] w-[236px] rounded-full border border-shafx-accent/20 bg-shafx-surface/92 shadow-[0_20px_70px_rgba(0,0,0,.45)] backdrop-blur-xl">
        <div className="absolute inset-[37px] flex flex-col items-center justify-center rounded-full border border-shafx-accent/30 bg-shafx-bg/95">
          <span className="text-[8px] font-semibold uppercase tracking-[0.16em] text-shafx-textMuted">Timeframe</span>
          <strong className="mt-1 font-mono text-sm text-shafx-accent">{timeframe}</strong>
          <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={goToCurrentCandle} className="mt-2 rounded-full border border-shafx-success/30 bg-shafx-success/10 px-2.5 py-1 text-[8px] font-semibold text-shafx-success">NOW</button>
        </div>
        {TIMEFRAMES.map((tf, index) => {
          const angle = (index / TIMEFRAMES.length) * Math.PI * 2 - Math.PI / 2
          const radius = 94
          const x = Math.cos(angle) * radius
          const y = Math.sin(angle) * radius
          return <button key={tf} type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => chooseFullscreenTimeframe(tf)} aria-pressed={timeframe === tf} className={`absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-[8px] font-semibold shadow-md transition ${timeframe === tf ? 'border-shafx-accent bg-shafx-accent text-white scale-110' : 'border-shafx-border bg-shafx-bg/95 text-shafx-textMuted hover:border-shafx-accent/40 hover:text-shafx-text'}`} style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))` }}>{tf}</button>
        })}
        <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={resetChartView} aria-label="Reset chart view to current candle" className="absolute -bottom-10 left-1/2 flex h-8 -translate-x-1/2 items-center gap-1 rounded-full border border-shafx-border bg-shafx-surface/95 px-3 text-[8px] font-semibold text-shafx-textMuted shadow-lg"><RotateCcw className="h-3 w-3" />Reset view</button>
      </div>
    </div>}

    <div className="pointer-events-none absolute bottom-0 left-0 right-[82px] z-30 h-8 border-t border-shafx-border/70 bg-shafx-bg/95 sm:right-[96px]">
      {timelineMarks.map((mark, index) => (
        <span
          key={`${mark.label}-${index}-${Math.round(mark.x)}`}
          className="absolute top-1 -translate-x-1/2 whitespace-nowrap font-mono text-[8px] tabular text-shafx-textMuted sm:text-[9px]"
          style={{ left: mark.x }}
        >
          {mark.label}
        </span>
      ))}
    </div>
    <div
      aria-label="Price scale"
      className="absolute right-0 top-10 bottom-8 z-20 w-[82px] touch-none cursor-ns-resize sm:w-[96px]"
      onPointerDown={handlePriceAxisPointerDown}
      onPointerMove={handlePriceAxisPointerMove}
      onPointerUp={handlePriceAxisPointerUp}
      onPointerCancel={handlePriceAxisPointerUp}
      onDoubleClick={(event) => {
        event.stopPropagation()
        resetVerticalScale()
      }}
    />
    {toolMode === 'crosshair' && crosshairInfo && <div className="pointer-events-none absolute left-3 bottom-3 z-20 rounded-xl border border-shafx-accent/25 bg-shafx-surface/95 px-3 py-2 text-[9px] shadow-xl"><span className="text-shafx-textMuted">Crosshair</span><strong className="ml-2 font-mono text-shafx-text">{crosshairInfo.price.toFixed(5)}</strong><span className="ml-2 text-shafx-textMuted">{crosshairInfo.time}</span></div>}
    {(toolMode === 'level' || toolMode === 'alert' || toolMode === 'measure') && <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-xl border border-shafx-border bg-shafx-surface/95 px-3 py-2 text-[9px] text-shafx-textMuted shadow-xl"><Crosshair className="h-3.5 w-3.5 text-shafx-accent" />{toolMode === 'level' ? 'Tap chart to place a price level' : toolMode === 'alert' ? 'Tap chart, then confirm the alert price' : measureStart === null ? 'Tap first point to measure' : measureEnd === null ? 'Tap second point to finish' : 'Measure complete'}</div>}
    {alertCandidate !== null && <div className="absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-2xl border border-shafx-warning/30 bg-shafx-surface/98 px-3 py-3 shadow-2xl backdrop-blur"><div className="text-[9px] uppercase tracking-[0.14em] text-shafx-textMuted">Price alert</div><div className="mt-1 font-mono text-sm font-semibold text-shafx-text">{alertCandidate.toFixed(5)}</div><div className="mt-2 flex gap-2"><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={armAlert} className="min-h-10 rounded-xl bg-shafx-warning px-3 text-[10px] font-semibold text-black">Arm alert</button><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={cancelAlert} className="min-h-10 rounded-xl border border-shafx-border px-3 text-[10px] text-shafx-textMuted">Cancel</button></div></div>}
    {measureDelta !== null && <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-xl border border-shafx-info/20 bg-shafx-surface/95 px-3 py-2 text-[9px] shadow-xl"><div className="flex items-center gap-2 text-shafx-textMuted"><Ruler className="h-3.5 w-3.5 text-shafx-info" />Range</div><strong className="mt-1 block font-mono text-xs text-shafx-text">{measureDelta.toFixed(1)} pips</strong></div>}
    {(userLevels.length > 0 || armedAlerts.length > 0) && <div className="pointer-events-none absolute right-3 bottom-3 z-20 hidden max-w-[48%] gap-1 overflow-hidden sm:flex"><div className="truncate rounded-xl border border-shafx-border bg-shafx-surface/95 px-2.5 py-1.5 text-[9px] text-shafx-textMuted shadow-xl">{userLevels.length} level{userLevels.length === 1 ? '' : 's'} • {armedAlerts.length} alert{armedAlerts.length === 1 ? '' : 's'}</div></div>}
    {userLevels.length > 0 && <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={clearDrawings} className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-xl border border-shafx-border bg-shafx-surface px-2.5 py-1.5 text-[9px] text-shafx-textMuted shadow-xl hover:text-shafx-text"><Eraser className="h-3 w-3" />Clear levels</button>}
  </div>
}
