import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ColorType, createChart, type CandlestickData, type IChartApi, type IPriceLine, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts'
import { Crosshair, Eraser, Maximize2, Minimize2, Ruler, RotateCcw } from 'lucide-react'
import type { CandleTheme, ChartMode } from '../../app/chartSettings'
import { TIMEFRAMES, type OHLCV, type Timeframe } from '../../types'
import { buildOpenTradeEntryMarkers, buildTradeChartMarkers, type TradeChartMarker } from './buildTradeChartMarkers'
import { isPriceLevelOccludedByQuote } from './priceLineVisibility'
import { resolvePriceLabelY } from './priceLineLabelLayout'
import { getCandleCloseCountdown, isMarketTimestampFresh } from './candleCountdown'
import { getWeekendMarketStatus } from '../../lib/marketHours'
import { getQuoteTickColor, getQuoteTickDirection, type QuoteTickDirection } from '../order/quoteTickDirection'

export interface ChartAnnotation { id: string; price: number; label: string; color: string; labelColor?: string; lineWidth?: 1 | 2 | 3 | 4; priceTagOnly?: boolean }
type PriceLineLabel = { id: string; price: number; name: string; color: string; y: number; priceTagOnly?: boolean }
type PositionedOpenEntryMarker = {
  id: string
  side: 'BUY' | 'SELL'
  time: number
  entryPrice: number
  volume: number
  openTime: string
  x: number
  y: number
  edge: 'top' | 'bottom' | null
  labelOnLeft: boolean
}
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
  tradeMarkers?: TradeChartMarker[]
  candleTheme?: CandleTheme
  chartMode?: ChartMode
  quoteReady?: boolean
  marketTimestamp?: number
  onTimeframeChange?: (timeframe: Timeframe) => void
  replayMode?: boolean
  showStructuralOverlays?: boolean
  onVisibleBarCountChange?: (count: number) => void
}

interface UserLevel { id: string; price: number; label: string; color: string; lineWidth?: 1 | 2 | 3 | 4; dashed?: boolean; armed?: boolean }
type OverlayKind = 'support' | 'resistance' | 'liquidity'
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

const layoutPriceLabels = (entries: PriceLineLabel[], minY: number, maxY: number, rowGap: number): PriceLineLabel[] => {
  const centered = entries.filter((entry) => entry.name.startsWith('OPEN '))
  const rightAligned = entries.filter((entry) => !entry.name.startsWith('OPEN '))
    .sort((a, b) => a.y - b.y || a.id.localeCompare(b.id))
  const positions = rightAligned.map((entry) => Math.max(minY, Math.min(maxY, entry.y)))
  for (let index = 1; index < positions.length; index += 1) {
    positions[index] = Math.max(positions[index], positions[index - 1] + rowGap)
  }
  if (positions.length > 0 && positions[positions.length - 1] > maxY) {
    positions[positions.length - 1] = maxY
    for (let index = positions.length - 2; index >= 0; index -= 1) {
      positions[index] = Math.min(positions[index], positions[index + 1] - rowGap)
    }
  }
  if (positions.length > 0 && positions[0] < minY) {
    const shift = minY - positions[0]
    for (let index = 0; index < positions.length; index += 1) positions[index] += shift
  }
  const stacked = rightAligned.map((entry, index) => ({ ...entry, y: positions[index] }))
  const anchored = centered.map((entry) => ({ ...entry, y: Math.max(minY, Math.min(maxY, entry.y)) }))
  return [...stacked, ...anchored].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id))
}

const structuralOverlayKind = (annotation: ChartAnnotation): OverlayKind | null => {
  const id = annotation.id.toLowerCase()
  if (id.includes('support')) return 'support'
  if (id.includes('resistance')) return 'resistance'
  if (id.includes('liquidity')) return 'liquidity'
  return null
}

export const CandlestickChart: React.FC<CandlestickChartProps> = ({ data, height = '100%', annotations = [], timeframe, symbol, toolMode = 'cursor', pipSize = 0.0001, onToolNotice, showGrid = true, showPriceLabels = true, bidPrice, askPrice, tradeLines = [], tradeMarkers = [], candleTheme = 'shafx', chartMode = 'candles', quoteReady = false, onTimeframeChange, replayMode = false, showStructuralOverlays = true, onVisibleBarCountChange, marketTimestamp }) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const visibleBarCountCallbackRef = useRef(onVisibleBarCountChange)
  useEffect(() => { visibleBarCountCallbackRef.current = onVisibleBarCountChange }, [onVisibleBarCountChange])
  const chartHostRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ShafxSeries | null>(null)
  const seriesConfigRef = useRef<{ chartMode: ChartMode; pipSize: number } | null>(null)
  const tradeScaleAppliedSignatureRef = useRef('')
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
  const chartDataSourceRef = useRef<OHLCV[]>(data)
  useEffect(() => { chartDataSourceRef.current = data }, [data])
  const [timelineMarks, setTimelineMarks] = useState<Array<{ x: number; label: string; time: number }>>([])
  const timelineSignatureRef = useRef('')
  const chartTimeSignature = chartData.map((candle) => Number(candle.time)).join(',')
  const priceLinesRef = useRef<Map<string, IPriceLine>>(new Map())
  const priceLinesSeriesRef = useRef<ShafxSeries | null>(null)
  const lineLabelsHostRef = useRef<HTMLDivElement | null>(null)
  const [lineLabels, setLineLabels] = useState<PriceLineLabel[]>([])
  const lineLabelSyncRef = useRef<(() => void) | null>(null)
  const openTradeMarkerSyncRef = useRef<(() => void) | null>(null)
  const [openEntryMarkerPositions, setOpenEntryMarkerPositions] = useState<PositionedOpenEntryMarker[]>([])
  const [priceScaleRevision, setPriceScaleRevision] = useState(0)
  const priceScaleOverlayFrameRef = useRef<number | null>(null)
  const [bidTickDirection, setBidTickDirection] = useState<QuoteTickDirection>('neutral')
  const [askTickDirection, setAskTickDirection] = useState<QuoteTickDirection>('neutral')
  const [isViewingHistory, setIsViewingHistory] = useState(false)
  const previousBidQuoteRef = useRef<number | null>(null)
  const previousAskQuoteRef = useRef<number | null>(null)
  const lastBidTickAtRef = useRef(0)
  const lastAskTickAtRef = useRef(0)
  const bidQuoteTone = getQuoteTickColor(bidTickDirection)
  const askQuoteTone = getQuoteTickColor(askTickDirection)
  const structuralOcclusionRef = useRef<Map<string, boolean>>(new Map())
  const tradeMarkerSignatureRef = useRef('')
  const marketBidLineRef = useRef<IPriceLine | null>(null)
  const marketAskLineRef = useRef<IPriceLine | null>(null)
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

  useLayoutEffect(() => {
    const shell = containerRef.current
    const el = chartHostRef.current
    if (!shell || !el) return

    const chart = createChart(el, {
      layout: { background: { type: ColorType.Solid, color: '#070A0F' }, textColor: '#8A96A8', attributionLogo: false },
      grid: showGrid ? { vertLines: { color: '#131A23' }, horzLines: { color: '#131A23' } } : { vertLines: { color: 'transparent' }, horzLines: { color: 'transparent' } },
      width: shell.clientWidth,
      height: Math.max(280, shell.clientHeight),
      crosshair: { mode: 0, vertLine: { color: '#667285', width: 1, style: 2, labelBackgroundColor: '#202A38' }, horzLine: { color: '#667285', width: 1, style: 2, labelBackgroundColor: '#202A38' } },
      rightPriceScale: { borderColor: '#202A38', minimumWidth: shell.clientWidth < 640 ? 78 : 94, alignLabels: true, ticksVisible: true, scaleMargins: { top: 0.08, bottom: 0.08 } },
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
      if (!range) {
        visibleBarCountCallbackRef.current?.(0)
        return
      }
      visibleBarCountCallbackRef.current?.(Math.max(0, Math.ceil(range.to - range.from + 1)))

      const lastIndex = latestIndexRef.current
      if (lastIndex < 0) {
        followRealtimeRef.current = true
        setIsViewingHistory(false)
        return
      }

      // Never let a transient range callback re-enable realtime-follow while
      // the user is actively dragging/zooming. Pointer-up evaluates the final
      // range once the gesture is complete.
      if (chartInteractionRef.current) {
        if (range.to < lastIndex - 1) {
          followRealtimeRef.current = false
          setIsViewingHistory(true)
        }
        return
      }

      const followingLiveEdge = range.to >= lastIndex - 1
      followRealtimeRef.current = followingLiveEdge
      setIsViewingHistory(!followingLiveEdge)
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
    if (!chart) return

    if (!visualData.length) {
      // Keep the chart instance mounted while the next timeframe's history loads.
      // Clearing the series avoids showing stale bars without recreating the DOM.
      if (seriesRef.current) seriesRef.current.setData([])
      latestIndexRef.current = -1
      setIsViewingHistory(false)
      renderedFirstTimeRef.current = null
      renderedLastTimeRef.current = null
      renderedDataLengthRef.current = 0
      viewInitializedRef.current = false
      followRealtimeRef.current = true
      return
    }

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
      tradeMarkerSignatureRef.current = ''
      marketBidLineRef.current = null
      marketAskLineRef.current = null

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

      // Broker entry, Stop Loss and Take Profit lines are overlays only.
      // They must not expand candle autoscaling when far away from market price.
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

    // Publish the target interval's index before setData/scrollToRealTime emit
    // synchronous visible-range callbacks. Otherwise the handler compares the new
    // range with the old timeframe's index and incorrectly hides live Bid/Ask rails.
    latestIndexRef.current = lastIndex
    if (rangeNeedsReset) {
      followRealtimeRef.current = true
      chartInteractionRef.current = false
      setIsViewingHistory(false)
    }

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
          if (visibleTimeRange) {
            // Preserve actual timestamps rather than logical bar indexes, which can
            // shift when the broker prepends older candles or backfills history.
            chart.timeScale().setVisibleRange(visibleTimeRange)
          } else if (visibleLogicalRange) {
            chart.timeScale().setVisibleLogicalRange(visibleLogicalRange)
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

  // Refresh candle-based vertical autoscaling when broker levels change. Protection
  // prices remain true-price overlays and do not widen the candle price range.
  useLayoutEffect(() => {
    const protectedLines = tradeLines.filter((line) => {
      const id = line.id.toLowerCase()
      return !id.endsWith('-current') && Number.isFinite(line.price) && line.price > 0
    })
    const signature = protectedLines.map((line) => line.id + ':' + line.price).join('|')
    if (signature === tradeScaleAppliedSignatureRef.current) return
    tradeScaleAppliedSignatureRef.current = signature
    const series = seriesRef.current
    if (series) series.priceScale().applyOptions({ autoScale: true })
  }, [tradeLines])

  // When following live data, keep the latest candle at the right edge after a
  // quote update. Do not override a deliberate manual pan into chart history.
  useLayoutEffect(() => {
    const chart = chartRef.current
    if (!chart || isViewingHistory || chartInteractionRef.current || !followRealtimeRef.current) return
    chart.timeScale().scrollToRealTime()
  }, [chartTimeSignature, isViewingHistory])

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
    const publishMarks = (next: Array<{ x: number; label: string; time: number }>): void => {
      const signature = next.map((mark) => `${mark.time}:${Math.round(mark.x)}:${mark.label}`).join('|')
      if (timelineSignatureRef.current === signature) return
      timelineSignatureRef.current = signature
      setTimelineMarks(next)
    }

    const chart = chartRef.current
    const chartTimes = chartTimeSignature
      ? chartTimeSignature.split(',').map(Number).filter(Number.isFinite)
      : []
    if (!chart || chartTimes.length === 0 || !timeframe) {
      publishMarks([])
      return
    }

    const timeScale = chart.timeScale()
    const updateTimeline = (): void => {
      const range = timeScale.getVisibleLogicalRange()
      const width = timeScale.width()
      if (!range || width <= 0) {
        publishMarks([])
        return
      }
      const from = Math.max(0, Math.floor(range.from))
      const to = Math.min(chartTimes.length - 1, Math.ceil(range.to))
      const visibleCount = Math.max(1, to - from + 1)
      const pxPerBar = width / visibleCount
      const minimumLabelSpacing = width < 640 ? 62 : 74
      const candidates = [1, 2, 4, 6, 12, 24, 48, 96, 192]
      const step = candidates.find((candidate) => candidate * pxPerBar >= minimumLabelSpacing) ?? 192
      const interval = timeframeSecondsFor(timeframe) * step
      const marks: Array<{ x: number; label: string; time: number }> = []

      for (let index = from; index <= to; index += 1) {
        const timestamp = chartTimes[index]
        if (!Number.isFinite(timestamp)) continue
        if (Math.floor(timestamp / interval) * interval !== timestamp) continue
        const x = timeScale.timeToCoordinate(timestamp as UTCTimestamp)
        if (x === null || x < -40 || x > width + 40) continue
        const date = new Date(timestamp * 1000)
        const label = timeframe === 'D1' || timeframe === 'W1'
          ? String(date.getUTCDate()).padStart(2, '0') + ' ' + date.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })
          : date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
        marks.push({ x: Number(x), label, time: timestamp })
      }

      const selected: Array<{ x: number; label: string; time: number }> = []
      for (const mark of marks.sort((left, right) => left.x - right.x)) {
        const previous = selected[selected.length - 1]
        if (!previous || mark.x - previous.x >= minimumLabelSpacing) selected.push(mark)
      }
      publishMarks(selected)
    }

    updateTimeline()
    timeScale.subscribeVisibleLogicalRangeChange(updateTimeline)
    window.addEventListener('resize', updateTimeline)
    return () => {
      timeScale.unsubscribeVisibleLogicalRangeChange(updateTimeline)
      window.removeEventListener('resize', updateTimeline)
    }
  }, [chartTimeSignature, timeframe, isFullscreen])

  // Keep true-price lines independent and label each one directly inside the chart.
  // When a structural level occupies the same pixel row as a live Bid/Ask quote,
  // hide just that structural line temporarily; it returns once the quote has passed.
  useEffect(() => {
    const series = seriesRef.current
    const host = lineLabelsHostRef.current
    if (!series) return

    if (priceLinesSeriesRef.current !== series) {
      priceLinesRef.current.clear()
      priceLinesSeriesRef.current = series
      structuralOcclusionRef.current.clear()
    }

    const quoteYs = quoteReady && !isViewingHistory
      ? [bidPrice, askPrice]
          .filter((price): price is number => Number.isFinite(price) && Number(price) > 0)
          .map((price) => series.priceToCoordinate(Number(price)))
      : []
    // Keep true broker entry, SL and TP visible at all times. Analysis overlays
    // are secondary and should never hide real trade levels near a live quote.
    const tradeLineYs = tradeLines
      .filter((line) => !line.id.toLowerCase().endsWith('-current'))
      .filter((line) => Number.isFinite(line.price) && line.price > 0)
      .map((line) => series.priceToCoordinate(line.price))
    const occludingLevelYs = [...quoteYs, ...tradeLineYs]

    const desired = new Set<string>()
    const labelCandidates: Array<ChartAnnotation | UserLevel> = []

    const isStructuralOccluded = (annotation: ChartAnnotation): boolean => {
      const levelY = series.priceToCoordinate(annotation.price)
      const wasHidden = structuralOcclusionRef.current.get(annotation.id) === true
      // A wider restore threshold avoids flicker if the quote taps the same level.
      const isHidden = isPriceLevelOccludedByQuote(levelY, occludingLevelYs, wasHidden ? 12 : 7)
      structuralOcclusionRef.current.set(annotation.id, isHidden)
      return isHidden
    }

    const shortTitle = (annotation: ChartAnnotation | UserLevel): string => {
      const explicitLabel = annotation.label.trim().toUpperCase()
      if (explicitLabel.includes('UNCONFIRMED')) return explicitLabel
      if (/\b\d+ TRADES\b/.test(explicitLabel)) return explicitLabel
      // Multi-timeframe zones already have a compact source-aware label
      // (for example "H4 RES · H1 BSL"). Preserve it instead of repeating
      // the long generic concept title for every timeframe's merged level.
      if (annotation.id.toLowerCase().startsWith('mtf-zone-')) return explicitLabel
      const ids = annotation.id.toLowerCase().split('+')
      const labels: string[] = []
      if (ids.some((id) => id.includes('support'))) labels.push('SUPPORT')
      if (ids.some((id) => id.includes('resistance'))) labels.push('RESISTANCE')
      if (ids.some((id) => id.includes('liquidity-buy'))) labels.push('BUY-SIDE LIQUIDITY')
      if (ids.some((id) => id.includes('liquidity-sell'))) labels.push('SELL-SIDE LIQUIDITY')
      if (ids.some((id) => id.includes('liquidity') && !id.includes('liquidity-buy') && !id.includes('liquidity-sell'))) labels.push('LIQUIDITY')
      if (labels.length) return [...new Set(labels)].join(' / ')
      const id = annotation.id.toLowerCase()
      if (id.includes('ai-entry')) return 'AI ENTRY'
      if (id.includes('ai-stop')) return 'AI STOP'
      if (id.includes('ai-target')) return 'AI TARGET'
      if (id.includes('current')) {
        const explicit = annotation.label.trim().toUpperCase()
        // A BUY closes at Bid and a SELL closes at Ask. Keep those compact names.
        if (explicit.startsWith('BUY CURRENT')) return 'BID'
        if (explicit.startsWith('SELL CURRENT')) return 'ASK'
        if (explicit.endsWith('LIVE PRICE')) return 'BID'
        return explicit || 'BID / ASK'
      }
      if (id.includes('entry')) {
        const explicit = annotation.label.trim().toUpperCase()
        if (explicit.startsWith('OPEN ')) return explicit
        return 'TRADE ENTRY'
      }
      if (id.includes('stop') || /(?:^|[-_])sl(?:$|[-_])/.test(id)) return 'STOP LOSS'
      if (id.includes('target') || /(?:^|[-_])tp(?:$|[-_])/.test(id)) return 'TAKE PROFIT'
      if (id.includes('alert')) return 'PRICE ALERT'
      return annotation.label.toUpperCase()
    }

    const isStop = (id: string): boolean => id.includes('stop') || /(?:^|[-_])sl(?:$|[-_])/.test(id)
    const isTarget = (id: string): boolean => id.includes('target') || /(?:^|[-_])tp(?:$|[-_])/.test(id)

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

    // Gate structural rendering inside the chart, and remove stale structure
    // lines/labels on hide without touching broker-confirmed trade levels.
    const visibleAnnotations = showStructuralOverlays
      ? annotations
      : annotations.filter((annotation) => structuralOverlayKind(annotation) === null)

    const currentOverlayIds = new Set([
      ...visibleAnnotations.map((annotation) => annotation.id),
      ...tradeLines.map((line) => line.id),
      ...userLevels.map((level) => level.id),
      ...armedAlerts.map((alert) => alert.id),
    ])
    for (const id of structuralOcclusionRef.current.keys()) {
      if (!currentOverlayIds.has(id)) structuralOcclusionRef.current.delete(id)
    }

    if (!isViewingHistory) visibleAnnotations.forEach((annotation) => {
      const structuralKind = structuralOverlayKind(annotation)
      // Trend levels remain available with open positions; quote proximity
      // suppression prevents them obscuring broker-confirmed protection.
      if (structuralKind && isStructuralOccluded(annotation)) return
      const id = annotation.id.toLowerCase()
      const lineStyle: 0 | 1 | 2 = structuralKind === 'liquidity' ? 1
        : structuralKind || isStop(id) ? 2
        : isTarget(id) ? 0
        : 0
      const title = shortTitle(annotation) + ' ' + annotation.price.toFixed(pricePrecision)
      upsertLine(annotation, lineStyle, false, title)
      labelCandidates.push(annotation)
    })

    // Dynamic broker prices should not float across unrelated historical candles.
    // Timestamp-mapped trade markers remain anchored to their real candle times.
    if (!isViewingHistory) tradeLines.forEach((line) => {
      const id = line.id.toLowerCase()
      const lineStyle: 0 | 1 | 2 = isStop(id) || id.endsWith('-current') ? 2 : isTarget(id) ? 0 : id.includes('entry') ? 1 : 0
      const showPriceOnAxis = line.priceTagOnly === true
      // Position prices belong in the boxed price-scale label. Keep the plot-area
      // label short (OPEN + P/L, STOP LOSS, TAKE PROFIT) instead of duplicating price.
      const title = showPriceOnAxis ? '' : shortTitle(line) + ' ' + line.price.toFixed(pricePrecision)
      upsertLine(line, lineStyle, showPriceOnAxis, title)
      labelCandidates.push(line)
    })

    // Current Bid/Ask are shared market labels. Open positions do not each add
    // their own moving exit-price line, so opening more trades cannot duplicate BID.
    const quoteTagsReady = quoteReady && !isViewingHistory
    const labelBid = quoteTagsReady && Number.isFinite(bidPrice) && Number(bidPrice) > 0 ? Number(bidPrice) : 0
    const labelAsk = quoteTagsReady && Number.isFinite(askPrice) && Number(askPrice) > 0 ? Number(askPrice) : 0
    if (labelBid > 0) {
      labelCandidates.push({ id: 'shafx-live-bid-label', price: labelBid, label: 'BID', color: '#2F80FF', lineWidth: 1 })
    }
    if (labelAsk > 0) {
      labelCandidates.push({ id: 'shafx-live-ask-label', price: labelAsk, label: 'ASK', color: '#F04452', lineWidth: 1 })
    }

    userLevels.forEach((level) => {
      upsertLine(level, level.dashed ? 2 : 1, false, level.label + ' ' + level.price.toFixed(pricePrecision))
      labelCandidates.push(level)
    })

    armedAlerts.forEach((alert) => {
      upsertLine(alert, 2, false, alert.label + ' ' + alert.price.toFixed(pricePrecision))
      labelCandidates.push(alert)
    })

    for (const [id, line] of priceLinesRef.current) {
      if (desired.has(id)) continue
      try { series.removePriceLine(line) } catch { /* series may have been replaced */ }
      priceLinesRef.current.delete(id)
    }

    if (host) {
      const minY = 42
      const maxY = Math.max(minY, host.clientHeight - 40)
      const entries = labelCandidates
        .map((line) => ({
          id: line.id,
          price: line.price,
          color: ('labelColor' in line && line.labelColor) ? line.labelColor : line.color,
          name: shortTitle(line),
          priceTagOnly: 'priceTagOnly' in line && line.priceTagOnly === true,
          // Even if the real line is just outside the current price scale,
          // keep its named price tag visible at the nearest chart edge.
          y: resolvePriceLabelY(series.priceToCoordinate(line.price), line.price, lastClose, minY, maxY),
        }))
        .sort((a, b) => a.y - b.y || a.id.localeCompare(b.id))

      const rowGap = 19
      const initialLabels = layoutPriceLabels(entries, minY, maxY, rowGap)
      setLineLabels((current) => {
        if (current.length === initialLabels.length && current.every((item, index) =>
          item.id === initialLabels[index].id &&
          item.price === initialLabels[index].price &&
          item.name === initialLabels[index].name &&
          item.color === initialLabels[index].color &&
          item.priceTagOnly === initialLabels[index].priceTagOnly &&
          item.y === initialLabels[index].y
        )) return current
        return initialLabels
      })

      lineLabelSyncRef.current = () => {
        const liveHost = lineLabelsHostRef.current
        const liveSeries = seriesRef.current
        if (!liveHost || !liveSeries) return
        const currentMinY = 42
        const currentMaxY = Math.max(currentMinY, liveHost.clientHeight - 40)
        const visible = entries
          .map((entry) => ({
            id: entry.id,
            price: entry.price,
            name: entry.name,
            color: entry.color,
            priceTagOnly: entry.priceTagOnly,
            y: resolvePriceLabelY(liveSeries.priceToCoordinate(entry.price), entry.price, lastClose, currentMinY, currentMaxY),
          }))
          .sort((left, right) => left.y - right.y || left.id.localeCompare(right.id))
        const nextLabels = layoutPriceLabels(visible, currentMinY, currentMaxY, rowGap)
        setLineLabels((current) => {
          if (current.length === nextLabels.length && current.every((item, index) =>
            item.id === nextLabels[index].id &&
            item.price === nextLabels[index].price &&
            item.name === nextLabels[index].name &&
            item.color === nextLabels[index].color &&
            item.priceTagOnly === nextLabels[index].priceTagOnly &&
            item.y === nextLabels[index].y
          )) return current
          return nextLabels
        })
      }
      lineLabelSyncRef.current()
    }
  }, [annotations, armedAlerts, askPrice, bidPrice, bidQuoteTone, chartMode, isViewingHistory, lastClose, pipSize, priceScaleRevision, quoteReady, askQuoteTone, showPriceLabels, showStructuralOverlays, tradeLines, userLevels])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const syncLabels = (): void => lineLabelSyncRef.current?.()
    chart.timeScale().subscribeVisibleLogicalRangeChange(syncLabels)
    const shell = containerRef.current
    const observer = shell && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncLabels) : null
    if (shell && observer) observer.observe(shell)
    window.addEventListener('resize', syncLabels)
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(syncLabels)
      observer?.disconnect()
      window.removeEventListener('resize', syncLabels)
    }
  }, [chartMode, candleTheme, pipSize])

  // Live broker quote rails behave like MT5's optional Bid/Ask lines. The
  // SELL/BID rail meets the bid-based candle close; BUY/ASK stays spread-width
  // above it. The labels can be hidden independently without hiding the rails.
  useEffect(() => {
    const series = seriesRef.current
    if (!series) return

    const positionCurrentLine = tradeLines.find((line) => line.id.toLowerCase().endsWith('-current'))
    const positionSide = positionCurrentLine?.label.toUpperCase().startsWith('BUY')
      ? 'BUY'
      : positionCurrentLine?.label.toUpperCase().startsWith('SELL')
        ? 'SELL'
        : null

    const updateQuoteLine = (
      ref: React.MutableRefObject<IPriceLine | null>,
      price: number,
      color: string,
      title: string,
      hiddenByPosition = false,
    ): void => {
      const valid = Number.isFinite(price) && price > 0
      if (!valid || hiddenByPosition) {
        if (ref.current) {
          try { series.removePriceLine(ref.current) } catch { /* stale series */ }
          ref.current = null
        }
        return
      }

      const railColor = color === '#F04452'
        ? 'rgba(240, 68, 82, 0.82)'
        : color === '#2F80FF'
          ? 'rgba(47, 128, 255, 0.82)'
          : 'rgba(157, 169, 184, 0.58)'
      const options = {
        price,
        color: railColor,
        lineWidth: 1 as const,
        lineStyle: 2 as const,
        // Custom BID/ASK tags are rendered once in the chart overlay below.
        axisLabelVisible: false,
        axisLabelColor: color,
        axisLabelTextColor: '#F3F6FA',
        title,
      }

      if (ref.current) {
        ref.current.applyOptions(options)
      } else {
        ref.current = series.createPriceLine(options)
      }
    }

    const quotesVisible = quoteReady && !isViewingHistory
    const bid = quotesVisible && Number.isFinite(bidPrice) && Number(bidPrice) > 0 ? Number(bidPrice) : 0
    const ask = quotesVisible && Number.isFinite(askPrice) && Number(askPrice) > 0 ? Number(askPrice) : 0

    // Actual positions replace a same-side quote rail. No historical close is
    // passed off as a current quote while the live feed is unavailable.
    updateQuoteLine(marketBidLineRef, bid, '#2F80FF', 'BID', positionSide === 'BUY')
    updateQuoteLine(marketAskLineRef, ask, '#F04452', 'ASK', positionSide === 'SELL')

    return () => {
      // Price-line objects are intentionally retained between quote ticks.
    }
  }, [askPrice, bidPrice, bidQuoteTone, chartMode, quoteReady, askQuoteTone, showPriceLabels, tradeLines, isViewingHistory])


  const openEntryMarkers = useMemo(
    () => (timeframe && (chartMode === 'candles' || chartMode === 'bars'))
      ? buildOpenTradeEntryMarkers(chartData, tradeMarkers, timeframe)
      : [],
    [chartData, chartMode, timeframe, tradeMarkers],
  )

  useEffect(() => {
    const series = seriesRef.current
    if (!series) return

    // Live/open positions use the price-and-time overlay below. Native markers
    // remain for completed entries/exits so we never show a duplicate open arrow.
    const closedTrades = tradeMarkers.filter((trade) => trade.status === 'closed')
    const markers = (chartMode === 'candles' || chartMode === 'bars') && timeframe
      ? buildTradeChartMarkers(chartData, closedTrades, timeframe)
      : []
    const signature = JSON.stringify(markers.map((marker) => [
      Number(marker.time), marker.position, marker.shape, marker.color, marker.text ?? '', marker.size ?? 1,
    ]))
    if (signature === tradeMarkerSignatureRef.current) return

    series.setMarkers(markers)
    tradeMarkerSignatureRef.current = signature
  }, [chartData, chartMode, timeframe, tradeMarkers])

  // Open positions are pinned to their real entry time and execution price.
  // Their marker coordinates are recalculated after horizontal zoom/pan, vertical
  // scale changes, timeframe/data changes, and mobile resize/orientation changes.
  useEffect(() => {
    const chart = chartRef.current
    const series = seriesRef.current
    const shell = containerRef.current
    if (!chart || !series || !shell) {
      setOpenEntryMarkerPositions([])
      openTradeMarkerSyncRef.current = null
      return
    }

    const sync = (): void => {
      const liveChart = chartRef.current
      const liveSeries = seriesRef.current
      const liveShell = containerRef.current
      if (!liveChart || !liveSeries || !liveShell) return
      const plotWidth = liveChart.timeScale().width()
      const plotHeight = Math.max(1, liveShell.clientHeight - 30)
      const next: PositionedOpenEntryMarker[] = []

      for (const entry of openEntryMarkers) {
        const timeX = liveChart.timeScale().timeToCoordinate(entry.time as UTCTimestamp)
        const priceY = liveSeries.priceToCoordinate(entry.entryPrice)
        if (timeX === null || !Number.isFinite(timeX) || timeX < -8 || timeX > plotWidth + 8 ||
          priceY === null || !Number.isFinite(priceY)) continue

        const edge = priceY < 0 ? 'top' : priceY > plotHeight ? 'bottom' : null
        const y = Math.max(12, Math.min(plotHeight - 12, priceY))
        next.push({
          ...entry,
          x: timeX,
          y,
          edge,
          labelOnLeft: timeX > plotWidth - 150,
        })
      }

      const signature = next.map((item) => [
        item.id, item.side, item.time, item.entryPrice, item.volume,
        Math.round(item.x * 10) / 10, Math.round(item.y * 10) / 10, item.edge, item.labelOnLeft,
      ].join(':')).join('|')
      setOpenEntryMarkerPositions((current) => {
        const currentSignature = current.map((item) => [
          item.id, item.side, item.time, item.entryPrice, item.volume,
          Math.round(item.x * 10) / 10, Math.round(item.y * 10) / 10, item.edge, item.labelOnLeft,
        ].join(':')).join('|')
        return currentSignature === signature ? current : next
      })
    }

    openTradeMarkerSyncRef.current = sync
    sync()
    chart.timeScale().subscribeVisibleLogicalRangeChange(sync)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null
    observer?.observe(shell)
    window.addEventListener('resize', sync)
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(sync)
      observer?.disconnect()
      window.removeEventListener('resize', sync)
      if (openTradeMarkerSyncRef.current === sync) openTradeMarkerSyncRef.current = null
    }
  }, [openEntryMarkers, chartMode, chartTimeSignature, isFullscreen, priceScaleRevision])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chartDataSourceRef.current = data

    const handler = (param: Parameters<NonNullable<Parameters<IChartApi['subscribeCrosshairMove']>[0]>>[0]) => {
      if (!param.time) {
        setHoverCandle(null)
        return
      }
      const targetTime = Number(param.time)
      let closest: OHLCV | undefined
      let closestDistance = Number.POSITIVE_INFINITY
      for (const candle of chartDataSourceRef.current) {
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
        time: Math.floor(Number(closest.time)),
        open: closest.open,
        high: closest.high,
        low: closest.low,
        close: closest.close,
      })
    }

    chart.subscribeCrosshairMove(handler)
    return () => chart.unsubscribeCrosshairMove(handler)
  }, [timeframe])

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
    // Keep price/time-anchored position badges glued to their entries during
    // pinch zoom, drag zoom, and other gestures that move the vertical scale.
    if (chartInteractionRef.current) openTradeMarkerSyncRef.current?.()
  }
  const handleChartPointerCancel = (): void => {
    chartInteractionRef.current = false
    lastTapRef.current = null
    openTradeMarkerSyncRef.current?.()
  }

  const handleChartPointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    chartInteractionRef.current = false
    openTradeMarkerSyncRef.current?.()

    // Capture the range after a drag/pinch. This prevents the next live tick
    // from deciding to follow realtime unless the user actually finished at
    // the newest candles.
    if (toolMode === 'cursor' || toolMode === 'crosshair') {
      const range = chartRef.current?.timeScale().getVisibleLogicalRange()
      const lastIndex = latestIndexRef.current
      if (range && lastIndex >= 0) {
        const followingLiveEdge = range.to >= lastIndex - 1
        followRealtimeRef.current = followingLiveEdge
        setIsViewingHistory(!followingLiveEdge)
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

  const refreshPriceScaleOverlays = (): void => {
    // Keep line tags visually responsive while rate-limiting the more expensive
    // structural hide/show pass to one React effect run per animation frame.
    lineLabelSyncRef.current?.()
    openTradeMarkerSyncRef.current?.()
    if (priceScaleOverlayFrameRef.current !== null) return
    priceScaleOverlayFrameRef.current = window.requestAnimationFrame(() => {
      priceScaleOverlayFrameRef.current = null
      setPriceScaleRevision((revision) => revision + 1)
    })
  }

  useEffect(() => () => {
    if (priceScaleOverlayFrameRef.current !== null) {
      window.cancelAnimationFrame(priceScaleOverlayFrameRef.current)
      priceScaleOverlayFrameRef.current = null
    }
  }, [])

  const resetVerticalScale = (): void => {
    const series = seriesRef.current
    if (!series) return
    verticalScaleMarginsRef.current = { top: 0.08, bottom: 0.08 }
    series.priceScale().applyOptions({
      autoScale: true,
      scaleMargins: { top: 0.08, bottom: 0.08 },
    })
    // A price-axis resize does not emit a timeScale range event.
    refreshPriceScaleOverlays()
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
    // Recalculate label Y positions immediately and rerun structural-vs-quote
    // occlusion once per animation frame while the price scale is moving.
    refreshPriceScaleOverlays()
  }

  const handlePriceAxisPointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    event.stopPropagation()
    event.preventDefault()
    verticalScaleDragRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    refreshPriceScaleOverlays()
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
  const [countdownNowSeconds, setCountdownNowSeconds] = useState(0)

  // A wall-clock timer does not imply that candles are forming while the
  // recognised FX/metal market is closed. Source quote freshness separately
  // gates countdowns during weekday holidays, feed outages and stale heartbeats.
  useEffect(() => {
    let stopped = false
    let timer: number | null = null
    const updateClock = (): void => {
      if (stopped) return
      const nowMs = Date.now()
      setCountdownNowSeconds(Math.floor(nowMs / 1000))
      timer = window.setTimeout(
        updateClock,
        getWeekendMarketStatus(symbol ?? '', nowMs).isClosed ? 60_000 : 1000,
      )
    }
    updateClock()
    return () => {
      stopped = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [symbol])

  const weekendMarket = getWeekendMarketStatus(symbol ?? '', countdownNowSeconds * 1000)
  const marketQuoteFresh = isMarketTimestampFresh(marketTimestamp, countdownNowSeconds)
  const countdown = timeframe && countdownNowSeconds > 0
    ? getCandleCloseCountdown(countdownNowSeconds, timeframe)
    : null
  const showLiveCountdown = !replayMode && !weekendMarket.isClosed &&
    quoteReady && marketQuoteFresh && countdown !== null
  const countdownStatusLabel = weekendMarket.isClosed
    ? (weekendMarket.kind === 'metal' ? 'METALS MARKET CLOSED · WEEKEND' : 'FX MARKET CLOSED · WEEKEND')
    : marketTimestamp && !marketQuoteFresh
      ? 'MARKET PAUSED · NO FRESH QUOTE'
      : 'WAITING FOR LIVE QUOTE'

  useEffect(() => {
    const bid = Number(bidPrice)
    if (!quoteReady || !Number.isFinite(bid) || bid <= 0) {
      previousBidQuoteRef.current = null
      lastBidTickAtRef.current = 0
      setBidTickDirection('neutral')
      return
    }
    const previous = previousBidQuoteRef.current
    previousBidQuoteRef.current = bid
    if (previous === null) { setBidTickDirection('neutral'); return }
    const direction = getQuoteTickDirection(bid, previous)
    if (direction !== 'neutral') {
      setBidTickDirection(direction)
      lastBidTickAtRef.current = countdownNowSeconds * 1000
    } else if (!lastBidTickAtRef.current || countdownNowSeconds * 1000 - lastBidTickAtRef.current >= 15_000) {
      setBidTickDirection('neutral')
    }
  }, [bidPrice, quoteReady, countdownNowSeconds])

  useEffect(() => {
    const ask = Number(askPrice)
    if (!quoteReady || !Number.isFinite(ask) || ask <= 0) {
      previousAskQuoteRef.current = null
      lastAskTickAtRef.current = 0
      setAskTickDirection('neutral')
      return
    }
    const previous = previousAskQuoteRef.current
    previousAskQuoteRef.current = ask
    if (previous === null) { setAskTickDirection('neutral'); return }
    const direction = getQuoteTickDirection(ask, previous)
    if (direction !== 'neutral') {
      setAskTickDirection(direction)
      lastAskTickAtRef.current = countdownNowSeconds * 1000
    } else if (!lastAskTickAtRef.current || countdownNowSeconds * 1000 - lastAskTickAtRef.current >= 15_000) {
      setAskTickDirection('neutral')
    }
  }, [askPrice, quoteReady, countdownNowSeconds])
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

  return <div
    ref={containerRef}
    data-shafx-chart-symbol={symbol}
    data-shafx-trade-line-count={tradeLines.length}
    data-shafx-trade-line-labels={tradeLines.map((line) => line.label).join('|')}
    data-shafx-trade-line-values={tradeLines.map((line) => line.label + ':' + line.price).join('|')}
    data-shafx-open-entry-marker-count={openEntryMarkerPositions.length}
    data-shafx-open-entry-markers={openEntryMarkerPositions.map((marker) => marker.side + ':' + marker.volume + ':' + marker.entryPrice).join('|')}
    onPointerDownCapture={handleChartPointerDown}
    onPointerMoveCapture={handleChartPointerMove}
    onPointerUpCapture={handleChartPointerUp}
    onPointerCancel={handleChartPointerCancel}
    onPointerDown={placeTool}
    className={`shafx-chart-shell relative w-full overflow-hidden border border-shafx-border bg-shafx-bg touch-pan-y ${['level', 'alert', 'measure'].includes(toolMode) ? 'cursor-crosshair' : ''} ${chartFullscreen ? 'fixed inset-0 z-[200] h-[100svh] w-screen' : ''}`}
    style={{ height: chartFullscreen ? '100svh' : height, minHeight: 280 }}
  >
    <div ref={chartHostRef} className="absolute inset-0 z-0" aria-hidden="true" />
    <div className="shafx-open-entry-marker-layer pointer-events-none absolute left-0 right-[82px] top-0 bottom-[30px] z-10 overflow-hidden sm:right-[96px]" aria-hidden="true">
      {openEntryMarkerPositions.map((marker) => {
        const sideClass = marker.side === 'BUY' ? 'shafx-open-entry-marker--buy' : 'shafx-open-entry-marker--sell'
        const edgeGlyph = marker.edge === 'top' ? '↑ ' : marker.edge === 'bottom' ? '↓ ' : ''
        const labelSideClass = marker.labelOnLeft ? 'shafx-open-entry-label--left' : 'shafx-open-entry-label--right'
        const labelVerticalClass = marker.side === 'BUY' ? 'shafx-open-entry-label--above' : 'shafx-open-entry-label--below'
        const label = marker.side + ' ' + marker.volume.toFixed(2)
        return (
          <div key={marker.id} className={'shafx-open-entry-marker ' + sideClass} data-shafx-open-entry-marker={marker.id} style={{ left: marker.x + 'px', top: marker.y + 'px' }}>
            <span className="shafx-open-entry-marker__point">{marker.side === 'BUY' ? '▲' : '▼'}</span>
            <span className={'shafx-open-entry-marker__label ' + labelSideClass + ' ' + labelVerticalClass} title={marker.openTime + ' · ' + label}>
              {edgeGlyph + label}
            </span>
          </div>
        )
      })}
    </div>
    <div ref={lineLabelsHostRef} aria-hidden="true" className={`pointer-events-none absolute inset-y-0 left-0 right-[82px] z-20 overflow-hidden sm:right-[96px] ${isViewingHistory ? 'hidden' : ''}`}>
      {lineLabels.map((label) => {
        const centeredPnl = label.name.startsWith('OPEN ')
        const formattedPrice = label.price.toFixed(pricePrecision)
        const text = label.priceTagOnly
          ? label.name
          : centeredPnl ? label.name + ' · ' + formattedPrice : label.name + '  ' + formattedPrice
        const accessibleText = label.name + ' ' + formattedPrice
        return (
          <span key={label.id} className={centeredPnl ? 'shafx-price-line-label shafx-price-line-label--center' : 'shafx-price-line-label'} data-shafx-price-line-label={label.id} role="img" aria-label={accessibleText} title={accessibleText} style={{ top: label.y + 'px', borderLeftColor: label.color, color: label.color }}>
            {text}
          </span>
        )
      })}
    </div>
    <div className="pointer-events-none absolute left-3 top-3 z-30 flex items-center gap-2 rounded-xl border border-shafx-border/70 bg-shafx-surface/88 px-2.5 py-1.5 shadow-md backdrop-blur">
      {showLiveCountdown && <span className="font-mono text-[8px] font-semibold tabular text-shafx-accent">CLOSE {formatCountdown(countdown!)}</span>}
      {!replayMode && !showLiveCountdown && <span className="font-mono text-[8px] font-semibold tabular text-shafx-textMuted">{countdownStatusLabel}</span>}
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
      <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => void toggleFullscreen()} aria-label={chartFullscreen ? 'Exit fullscreen chart' : 'Open fullscreen chart'} className="flex h-9 w-9 items-center justify-center border border-shafx-border bg-shafx-surface/92 text-shafx-textMuted shadow-md hover:border-shafx-accent/40 hover:text-shafx-text">
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

    <div aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0 right-[82px] z-30 h-8 border-t border-shafx-border/70 bg-shafx-bg/95 sm:right-[96px]">
      {timelineMarks.map((mark) => (
        <span key={mark.time} data-shafx-timeline-time={mark.time} className="absolute top-1 -translate-x-1/2 whitespace-nowrap font-mono text-[8px] tabular text-shafx-textMuted sm:text-[9px]" style={{ left: mark.x + 'px' }}>
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
