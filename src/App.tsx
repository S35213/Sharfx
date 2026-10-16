import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { TrendingUp } from 'lucide-react'

import { TerminalProvider, useTerminal } from './app/TerminalContext'
import { ErrorBoundary } from './app/ErrorBoundary'
import { TopNav } from './components/layout/TopNav'
import { MobileNav, type MobileNavTab } from './components/layout/MobileNav'
import { WorkspaceRail, type WorkspaceDock, type WorkspaceTool } from './components/layout/WorkspaceRail'
import { MobileChartTools } from './components/layout/MobileChartTools'
import { WorkspaceStatus } from './components/layout/WorkspaceStatus'
import { ProviderLiveControl } from './components/market/ProviderLiveControl'
import { DerivCashierLinks } from './components/market/DerivCashierLinks'
import { LiquidityPanel } from './components/market/LiquidityPanel'
import { FXMoveMatrix } from './components/market/FXMoveMatrix'
import { CandlestickChart, type ChartAnnotation, type ChartToolMode } from './components/chart/CandlestickChart'
import type { TradeChartMarker } from './components/chart/buildTradeChartMarkers'
import { buildOpenPositionsChartLines } from './components/chart/buildPositionChartLines'
import { buildMultiTimeframeStructuralAnnotations } from './components/chart/buildMultiTimeframeChartAnnotations'
import { Watchlist } from './components/watchlist/Watchlist'
import { MarketAnalysisPanel } from './components/analysis/MarketAnalysis'
import { AIAssistantPanel } from './components/ai/AIAssistantPanel'
import { SignalDeskPanel } from './components/ai/SignalDeskPanel'
import { TradeBotPanel } from './components/ai/TradeBotPanel'
import { cTraderInstrumentToSymbolSpec } from './engine/bot/ctraderInstrumentSpec'
import { isCompleteCTraderPositionSnapshot, reconcileCTraderPositionList } from './engine/bot/reconcileCTraderPositionList'
import { reconcileCTraderTradeHistory } from './engine/bot/reconcileCTraderTradeHistory'
import { tradeBotMarketSourceKey } from './engine/bot/useTradeBotMarketData'
import { OrderPanel } from './components/order/OrderPanel'
import { closeDerivContract } from './data/deriv/derivTrading'
import { AccountPanel } from './components/account/AccountPanel'
import { TradesPanel } from './components/trades/TradesPanel'
import { Toast, type ToastMessage } from './components/common/Toast'
import { CHART_SETTINGS_EVENT, readChartWorkspaceSettings, type ChartWorkspaceSettings } from './app/chartSettings'
import { getSymbolSpec, SYMBOL_SPECS } from './data/mock/symbols'
import { getProviderConnections, chooseDefaultProviderSelection, getStoredProviderSelection, subscribeToProviderSelection, type ActiveProviderSelection } from './data/provider/providerConnections'
import { ProviderAccountStreamManager, providerAccountStreamKey } from './data/provider/ProviderAccountStreamManager'
import type { ProviderOrderResult, ProviderPosition, ProviderStreamEvent } from './integrations/core/types'
import { analyzeLiquidity } from './engine/liquidity'
import { analyzeMarketStructure, findSwingPoints } from './engine/marketStructure'
import { analyzeSupportResistance } from './engine/supportResistance'
import { TIMEFRAMES, type AccountData, type BotPaperTrade, type MarketAnalysis, type MarketPair, type OHLCV, type SymbolSpec, type Timeframe, type TradeOrder } from './types'
import { normalizeMarketCandles } from './lib/marketCandles'
import { normalizeProviderSymbol, providerSymbolsMatch } from './lib/normalizeProviderSymbol'
import type { SetupCandidate } from './engine/setup/types'
import { mockWatchlist } from './data/mock/watchlist'
import { fetchDerivActiveForexSymbols, fetchDerivMultiTimeframeCandles, subscribeDerivForexQuotes } from './data/deriv/DerivPublicMarketFeed'
import { applyCTraderQuoteToCandles, cTraderQuoteBucket, fetchCTraderHistoricalCandles, fetchCTraderInstrument, getRecentCTraderCandleGapSignature, isCTraderQuoteBucketCurrent, mergeCTraderHistoricalAndLiveCandles, shouldRepairCTraderHistoryForGap, subscribeCTraderLiveQuote } from './data/ctrader/CTraderLiveQuote'

const EMPTY_STRUCTURAL_HISTORIES: Partial<Record<Timeframe, OHLCV[]>> = {}

const positivePrice = (...values: unknown[]): number | null => {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue
    const price = Number(value)
    if (Number.isFinite(price) && price > 0) return price
  }
  return null
}

interface CTraderQuoteSnapshot {
  symbol: string
  bid: number
  ask: number
  updatedAt: number
}

const latestCTraderQuoteForSymbol = (
  quotes: Record<string, CTraderQuoteSnapshot>,
  symbol: string,
): CTraderQuoteSnapshot | null => Object.values(quotes)
  .filter((quote) => Date.now() - quote.updatedAt <= 15_000 && providerSymbolsMatch(quote.symbol, symbol))
  .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null

// A failed cTrader symbol lookup can temporarily return a numeric symbol ID.
// Never let that opaque ID overwrite a real symbol learned from the trade ticket.
const isUnresolvedProviderSymbol = (value: string): boolean => /^\d+$/.test(value.trim())
const positionChartSymbol = (incoming: string, previous?: string): string =>
  isUnresolvedProviderSymbol(incoming) && previous && !isUnresolvedProviderSymbol(previous)
    ? previous
    : normalizeProviderSymbol(incoming)

// cTrader normally reports epoch milliseconds. Historical payloads or adapters
// may expose seconds/microseconds, so normalize units before converting to ISO;
// otherwise an entry marker can be lost because its timestamp lands in 1970.
const parseCTraderOpenTime = (value: unknown): string | undefined => {
  if (value === null || value === undefined || value === '') return undefined
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim()))) {
    const raw = Number(value)
    if (!Number.isFinite(raw) || raw <= 0) return undefined
    const milliseconds = raw >= 1e14 ? raw / 1000 : raw < 1e11 ? raw * 1000 : raw
    const parsed = new Date(milliseconds)
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
  }
  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
  }
  return undefined
}

const providerPositionToTrade = (position: ProviderPosition): TradeOrder => {
  const metadata = position.metadata || {}
  const raw = (metadata.raw && typeof metadata.raw === 'object') ? metadata.raw as Record<string, unknown> : {}
  const entryPrice = Number(position.entryPrice ?? raw.entryPrice ?? raw.price ?? 0)
  const currentPrice = Number(position.currentPrice ?? raw.currentPrice ?? 0)

  if (metadata.provider === 'ctrader') {
    const lots = Number(position.quantity ?? raw.lots ?? raw.volumeLots ?? metadata.lots ?? 0)
    const stopLoss = positivePrice(position.stopLoss, raw.stopLoss, raw.stopLossPrice, raw.stop_loss, metadata.stopLoss, metadata.stopLossPrice)
    const takeProfit = positivePrice(position.takeProfit, raw.takeProfit, raw.takeProfitPrice, raw.take_profit, metadata.takeProfit, metadata.takeProfitPrice)
    const usedMargin = Number(metadata.usedMargin)
    const stopLossPips = Number(metadata.stopLossPips)
    const takeProfitPips = Number(metadata.takeProfitPips)
    return {
      id: String(position.id),
      symbol: normalizeProviderSymbol(position.symbol),
      type: position.side,
      lotSize: Number.isFinite(lots) ? lots : 0,
      volumeLots: Number.isFinite(lots) ? lots : 0,
      entryPrice: Number.isFinite(entryPrice) ? entryPrice : 0,
      currentPrice: Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : undefined,
      stopLoss,
      takeProfit,
      plannedStopLossPrice: stopLoss,
      plannedTakeProfitPrice: takeProfit,
      brokerProtectionConfirmed: stopLoss !== null && takeProfit !== null,
      riskPercent: 0,
      riskAmount: 0,
      rewardAmount: 0,
      riskRewardRatio: 0,
      status: 'open',
      openTime: parseCTraderOpenTime(metadata.openTimestamp) ?? new Date().toISOString(),
      profit: Number.isFinite(position.unrealizedPL) ? position.unrealizedPL : 0,
      providerOrderId: String(position.id),
      brokerProduct: 'SHAFX_CFD_CTRADER',
      providerId: 'ctrader',
      providerConnectionId: String(metadata.connectionId || ''),
      providerAccountId: String(metadata.accountId || ''),
      usedMargin: Number.isFinite(usedMargin) ? usedMargin : undefined,
      stopLossPips: Number.isFinite(stopLossPips) && stopLossPips > 0 ? stopLossPips : undefined,
      takeProfitPips: Number.isFinite(takeProfitPips) && takeProfitPips > 0 ? takeProfitPips : undefined,
      commission: Number(metadata.commission),
    }
  }

  const stake = Number(metadata.stake ?? position.quantity ?? 0)
  const multiplierValue = Number(metadata.multiplier ?? 0)
  const stopLossAmount = Number(position.stopLoss ?? raw.stop_loss ?? 0)
  const takeProfitAmount = Number(position.takeProfit ?? raw.take_profit ?? 0)
  return {
    id: String(position.id),
    symbol: normalizeProviderSymbol(position.symbol),
    type: position.side,
    lotSize: Number.isFinite(stake) ? stake : 0,
    entryPrice: Number.isFinite(entryPrice) ? entryPrice : 0,
    currentPrice: Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : undefined,
    stopLoss: null,
    takeProfit: null,
    riskPercent: 0,
    riskAmount: Number.isFinite(stopLossAmount) && stopLossAmount > 0 ? stopLossAmount : (Number.isFinite(stake) ? stake : 0),
    rewardAmount: Number.isFinite(takeProfitAmount) && takeProfitAmount > 0 ? takeProfitAmount : 0,
    riskRewardRatio: Number.isFinite(stopLossAmount) && stopLossAmount > 0 && Number.isFinite(takeProfitAmount) && takeProfitAmount > 0 ? takeProfitAmount / stopLossAmount : 0,
    status: 'open',
    openTime: typeof metadata.purchaseTime === 'number' ? new Date(metadata.purchaseTime * 1000).toISOString() : new Date().toISOString(),
    profit: Number.isFinite(position.unrealizedPL) ? position.unrealizedPL : 0,
    providerOrderId: String(position.id),
    brokerProduct: 'DERIV_MULTIPLIER',
    stake: Number.isFinite(stake) ? stake : 0,
    multiplier: Number.isFinite(multiplierValue) && multiplierValue > 0 ? multiplierValue : undefined,
    stopLossAmount: Number.isFinite(stopLossAmount) && stopLossAmount > 0 ? stopLossAmount : undefined,
    takeProfitAmount: Number.isFinite(takeProfitAmount) && takeProfitAmount > 0 ? takeProfitAmount : undefined,
  }
}

const providerOrderToTrade = (order: ProviderOrderResult): TradeOrder | null => {
  if (order.raw && typeof order.raw === 'object') {
    const raw = order.raw as Record<string, unknown>
    if (String(raw.provider || '') === 'ctrader') {
      const providerOrderId = String(order.providerOrderId || raw.orderId || '')
      if (!providerOrderId) return null
      return {
        id: providerOrderId,
        symbol: normalizeProviderSymbol(String(order.symbol || raw.symbol || '')),
        type: order.side === 'SELL' ? 'SELL' : 'BUY',
        lotSize: Number(order.quantity ?? raw.quantity ?? 0),
        entryPrice: Number(raw.price ?? 0),
        stopLoss: null,
        takeProfit: null,
        riskPercent: 0,
        riskAmount: 0,
        rewardAmount: 0,
        riskRewardRatio: 0,
        status: order.status === 'filled' ? 'closed' : 'pending',
        openTime: order.timestamp || new Date().toISOString(),
        closeTime: order.status === 'filled' ? order.timestamp : undefined,
        profit: Number(raw.profit ?? 0),
        providerOrderId,
        brokerProduct: 'SHAFX_CFD_CTRADER',
        providerId: 'ctrader',
      }
    }
  }

  const raw = (order.raw && typeof order.raw === 'object') ? order.raw as Record<string, unknown> : {}
  const contractId = String(order.providerOrderId || raw.contractId || '')
  if (!contractId) return null
  const stake = Number(raw.stake ?? order.quantity ?? 0)
  const profit = Number(raw.profit)
  const symbol = normalizeProviderSymbol(String(order.symbol || raw.symbol || ''))
  return {
    id: contractId,
    symbol: symbol || 'EUR/USD',
    type: order.side === 'SELL' ? 'SELL' : 'BUY',
    lotSize: Number.isFinite(stake) ? stake : 0,
    entryPrice: Number(raw.entryPrice ?? raw.startSpot ?? raw.buyPrice ?? 0),
    stopLoss: null,
    takeProfit: null,
    riskPercent: 0,
    riskAmount: Number.isFinite(stake) ? stake : 0,
    rewardAmount: 0,
    riskRewardRatio: 0,
    status: 'closed',
    openTime: typeof raw.purchaseTime === 'number' ? new Date(raw.purchaseTime * 1000).toISOString() : order.timestamp || new Date().toISOString(),
    closeTime: order.timestamp || new Date().toISOString(),
    profit: Number.isFinite(profit) ? profit : 0,
    providerOrderId: contractId,
    brokerProduct: 'DERIV_MULTIPLIER',
    stake: Number.isFinite(stake) ? stake : undefined,
    multiplier: Number(raw.multiplier) > 0 ? Number(raw.multiplier) : undefined,
  }
}

const BOT_PAPER_HISTORY_STORAGE_KEY = 'shafx-bot-paper-history-v1'

const readBotPaperHistory = (): BotPaperTrade[] => {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(BOT_PAPER_HISTORY_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed as BotPaperTrade[] : []
  } catch {
    return []
  }
}

const TerminalContent: React.FC = () => {
  const { selectedSymbol, setSelectedSymbol, timeframe, setTimeframe } = useTerminal()
  const [activeProviderSelection, setActiveProviderSelection] = useState<ActiveProviderSelection | null>(() => getStoredProviderSelection())
  const [currentPrice, setCurrentPrice] = useState(0)
  const [liveBidPrice, setLiveBidPrice] = useState(0)
  const [liveAskPrice, setLiveAskPrice] = useState(0)
  const [liveQuoteIdentity, setLiveQuoteIdentity] = useState<string | null>(null)
  const [marketTimestamp, setMarketTimestamp] = useState(0)
  const [liveCandles, setLiveCandles] = useState<OHLCV[]>([])
  const [accountData, setAccountData] = useState<AccountData | null>(null)
  const [watchlist, setWatchlist] = useState<MarketPair[]>(() => mockWatchlist.map((pair) => ({ ...pair, price: 0, change: 0, changePercent: 0, status: 'closed' })))
  const [symbolSpec, setSymbolSpec] = useState<SymbolSpec>(() => SYMBOL_SPECS[selectedSymbol] ?? SYMBOL_SPECS['EUR/USD'])
  const [tradeBotBrokerSpec, setTradeBotBrokerSpec] = useState<{ sourceKey: string; symbolSpec: SymbolSpec | null; error?: string | null } | null>(null)
  const [openPositions, setOpenPositions] = useState<TradeOrder[]>([])
  const [pendingOrders] = useState<TradeOrder[]>([])
  const [tradeHistory, setTradeHistory] = useState<TradeOrder[]>([])
  const [botPaperHistory] = useState<BotPaperTrade[]>(() => readBotPaperHistory())
  const [reviewSetup, setReviewSetup] = useState<SetupCandidate | null>(null)
  const [liveMarketActive, setLiveMarketActive] = useState(false)
  const [chartSettings, setChartSettings] = useState<ChartWorkspaceSettings>(() => readChartWorkspaceSettings())
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [tradeLines, setTradeLines] = useState<ChartAnnotation[]>([])
  const [chartTool, setChartTool] = useState<WorkspaceTool>('cursor')
  const [trendVisible, setTrendVisible] = useState(false)
  const [visibleChartBars, setVisibleChartBars] = useState(0)
  const [trendRefreshVersion, setTrendRefreshVersion] = useState(0)
  const [structuralHistorySnapshot, setStructuralHistorySnapshot] = useState<{
    symbol: string
    histories: Partial<Record<Timeframe, OHLCV[]>>
  }>({ symbol: '', histories: {} })
  const [dock, setDock] = useState<WorkspaceDock>('orders')
  const [mobileTab, setMobileTab] = useState<MobileNavTab>('market')
  const [mobileDockOpen, setMobileDockOpen] = useState(false)
  const [isCompactViewport, setIsCompactViewport] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 999px)').matches)
  const [isLandscapeCompactViewport, setIsLandscapeCompactViewport] = useState(() => typeof window !== 'undefined' && window.matchMedia('(orientation: landscape) and (max-width: 999px)').matches)
  const accountStreamManager = useRef(new ProviderAccountStreamManager())
  const selectedSymbolRef = useRef(selectedSymbol)
  const timeframeRef = useRef(timeframe)
  const watchlistReferencePricesRef = useRef<Record<string, number>>({})
  const candleCacheRef = useRef<Record<string, OHLCV[]>>({})
  // cTrader chart history is kept separately from other providers so switching
  // back to an already-viewed symbol/timeframe can paint immediately without
  // briefly showing bars sourced from a different provider.
  const cTraderCandleCacheRef = useRef<Record<string, OHLCV[]>>({})
  const liveCandlesRef = useRef<OHLCV[]>([])
  const historyWarmInFlightRef = useRef<Record<string, Promise<Partial<Record<(typeof TIMEFRAMES)[number], OHLCV[]>>>>>({})
  // Read mutable candle caches only from event/effect callbacks, then keep a
  // render-safe snapshot in state for the chart's multi-timeframe annotation pass.
  const collectStructuralHistorySnapshot = useCallback((
    symbol: string,
    selection: ActiveProviderSelection | null | undefined,
  ): { symbol: string; histories: Partial<Record<Timeframe, OHLCV[]>> } => {
    const histories: Partial<Record<Timeframe, OHLCV[]>> = {}
    for (const sourceTimeframe of TIMEFRAMES) {
      if (selection?.providerId === 'ctrader' && selection.connectionId && selection.accountId) {
        const sourceKey = [
          String(selection.connectionId),
          String(selection.accountId),
          selection.environment,
          symbol,
          sourceTimeframe,
        ].join(':')
        histories[sourceTimeframe] = cTraderCandleCacheRef.current[sourceKey]
          ?? candleCacheRef.current[`${symbol}:${sourceTimeframe}`]
          ?? []
      } else {
        histories[sourceTimeframe] = candleCacheRef.current[`${symbol}:${sourceTimeframe}`] ?? []
      }
    }
    return { symbol, histories }
  }, [])
  const latestCTraderPriceRef = useRef<number | null>(null)
  const latestCTraderQuotesRef = useRef<Record<string, CTraderQuoteSnapshot>>({})
  const liveQuoteIdentityRef = useRef<string | null>(null)
  const cTraderQuoteStaleTimerRef = useRef<number | null>(null)
  const toastId = useRef(0)
  const lastStreamToastAt = useRef(0)
  const lastStreamToastText = useRef('')

  // Keep the newest rendered candle synchronously available to the broker
  // quote callback, so it can reject an old quote before moving the price tags.
  useLayoutEffect(() => {
    liveCandlesRef.current = liveCandles
  }, [liveCandles])

  useEffect(() => {
    // Quote identity belongs to the selected symbol/provider/account. A
    // timeframe changes candle aggregation, not the underlying live quote.
    liveQuoteIdentityRef.current = null
    latestCTraderPriceRef.current = null
    if (cTraderQuoteStaleTimerRef.current !== null) {
      window.clearTimeout(cTraderQuoteStaleTimerRef.current)
      cTraderQuoteStaleTimerRef.current = null
    }
    setLiveQuoteIdentity(null)
    setLiveBidPrice(0)
    setLiveAskPrice(0)
    setLiveMarketActive(false)
    setTradeBotBrokerSpec(null)
    return () => {
      if (cTraderQuoteStaleTimerRef.current !== null) {
        window.clearTimeout(cTraderQuoteStaleTimerRef.current)
        cTraderQuoteStaleTimerRef.current = null
      }
    }
  }, [selectedSymbol, activeProviderSelection?.providerId, activeProviderSelection?.accountId, activeProviderSelection?.connectionId, activeProviderSelection?.environment])

  // Load cTrader's verified instrument contract independently from the live
  // quote loop. A quote-stream outage must not silently make demo analysis
  // impossible when the provider can still return instrument metadata.
  useEffect(() => {
    const selection = activeProviderSelection
    if (
      selection?.providerId !== 'ctrader' ||
      !selection.connectionId ||
      !selection.accountId
    ) return

    let cancelled = false
    const source = {
      providerId: 'ctrader',
      connectionId: selection.connectionId,
      accountId: selection.accountId,
      environment: selection.environment,
    }
    const sourceKey = tradeBotMarketSourceKey(selectedSymbol, source)
    const resolveInstrument = async (): Promise<void> => {
      try {
        const instrument = await fetchCTraderInstrument({
          connectionId: selection.connectionId,
          accountId: selection.accountId as string,
          environment: selection.environment,
          symbol: selectedSymbol,
        })
        const resolved = cTraderInstrumentToSymbolSpec(selectedSymbol, instrument)
        if (!resolved) {
          const invalidFields = [
            instrument.tradable !== true ? 'instrument is not tradable' : null,
            !(Number(instrument.contractSize) > 0) ? 'contract size' : null,
            !(Number(instrument.pipSize) > 0) ? 'pip size' : null,
            !(Number(instrument.quantityMin) > 0) ? 'minimum lot' : null,
            !(Number(instrument.quantityMax) > 0) ? 'maximum lot' : null,
            !(Number(instrument.quantityStep) > 0) ? 'lot step' : null,
            !(Number(instrument.priceIncrement) > 0) ? 'price increment' : null,
            Number(instrument.quantityMax) < Number(instrument.quantityMin) ? 'lot limits are inverted' : null,
          ].filter((field): field is string => Boolean(field))
          throw new Error(
            'cTrader returned ' + String(instrument.symbol || selectedSymbol) +
            ' but its instrument rules cannot be used for risk sizing' +
            (invalidFields.length ? ': ' + invalidFields.join(', ') : ': symbol name or metadata did not match the selected market') +
            '.',
          )
        }
        if (cancelled) return
        setTradeBotBrokerSpec((previous) => {
          if (previous?.sourceKey === sourceKey && JSON.stringify(previous.symbolSpec) === JSON.stringify(resolved) && !previous.error) return previous
          return { sourceKey, symbolSpec: resolved, error: null }
        })
      } catch (error) {
        if (cancelled) return
        // Keep a valid specification already delivered by the quote stream.
        // Never replace a valid spec with a mock/default fallback on failure.
        const message = error instanceof Error ? error.message : 'Unable to load cTrader instrument rules.'
        setTradeBotBrokerSpec((previous) =>
          previous?.sourceKey === sourceKey && previous.symbolSpec
            ? previous
            : { sourceKey, symbolSpec: null, error: message },
        )
      }
    }
    void resolveInstrument()
    return () => { cancelled = true }
  }, [
    selectedSymbol,
    activeProviderSelection?.providerId,
    activeProviderSelection?.connectionId,
    activeProviderSelection?.accountId,
    activeProviderSelection?.environment,
  ])

  const pushToast = useCallback((text: string) => {
    toastId.current += 1
    setToast({ id: toastId.current, text })
  }, [])

  const pushStreamToast = useCallback((text: string): void => {
    const now = Date.now()
    if (text === lastStreamToastText.current && now - lastStreamToastAt.current < 15000) return
    lastStreamToastText.current = text
    lastStreamToastAt.current = now
    pushToast(text)
  }, [pushToast])

  // Change timeframe and candle snapshot together. A passive cache effect can
  // otherwise render the new timeframe with the previous timeframe's candles.
  const handleTimeframeChange = useCallback((nextTimeframe: Timeframe): void => {
    if (timeframeRef.current === nextTimeframe) return

    timeframeRef.current = nextTimeframe
    setVisibleChartBars(0)
    setTimeframe(nextTimeframe)
    setStructuralHistorySnapshot(collectStructuralHistorySnapshot(selectedSymbolRef.current, activeProviderSelection))

    // Reuse only the exact target timeframe's cache. Never keep rendering the
    // previous interval while the selected cTrader history request is in flight.
    const cTraderKey = activeProviderSelection?.providerId === 'ctrader'
      ? [
          String(activeProviderSelection.connectionId ?? ''),
          String(activeProviderSelection.accountId ?? ''),
          activeProviderSelection.environment,
          selectedSymbolRef.current,
          nextTimeframe,
        ].join(':')
      : ''
    const cached = activeProviderSelection?.providerId === 'ctrader'
      ? cTraderCandleCacheRef.current[cTraderKey] ?? []
      : candleCacheRef.current[`${selectedSymbolRef.current}:${nextTimeframe}`] ?? []
    const nextCandles = cached.length > 1 ? cached : []
    liveCandlesRef.current = nextCandles
    setLiveCandles(nextCandles)

    // Changing the chart interval must not restart the live market quote. Keep
    // Bid/Ask, quote identity, freshness timer and header price for cTrader;
    // only the target timeframe's candle dataset is being swapped.
    if (activeProviderSelection?.providerId !== 'ctrader') {
      setLiveBidPrice(0)
      setLiveAskPrice(0)
      setLiveQuoteIdentity(null)
      setLiveMarketActive(false)
      if (cTraderQuoteStaleTimerRef.current !== null) {
        window.clearTimeout(cTraderQuoteStaleTimerRef.current)
        cTraderQuoteStaleTimerRef.current = null
      }
      latestCTraderPriceRef.current = null
      liveQuoteIdentityRef.current = null
    }

    const last = nextCandles[nextCandles.length - 1]
    const currentCTraderPrice = activeProviderSelection?.providerId === 'ctrader'
      ? latestCTraderPriceRef.current
      : null
    if (currentCTraderPrice !== null && Number.isFinite(currentCTraderPrice) && currentCTraderPrice > 0) {
      setCurrentPrice(currentCTraderPrice)
      // Keep the timestamp of the latest actual quote unchanged until a new
      // broker tick arrives; never replace the live header with an old candle.
    } else {
      setCurrentPrice(last?.close ?? 0)
      setMarketTimestamp(last ? Math.floor(last.time / 1000) : 0)
    }
  }, [
    activeProviderSelection?.accountId,
    activeProviderSelection?.connectionId,
    activeProviderSelection?.environment,
    activeProviderSelection?.providerId,
    collectStructuralHistorySnapshot,
    setTimeframe,
  ])

  const dismissToast = useCallback(() => setToast(null), [])

  useLayoutEffect(() => {
    selectedSymbolRef.current = selectedSymbol
    timeframeRef.current = timeframe
  }, [selectedSymbol, timeframe])

  useEffect(() => {
    const compactMedia = window.matchMedia('(max-width: 999px)')
    const landscapeMedia = window.matchMedia('(orientation: landscape) and (max-width: 999px)')
    const sync = () => {
      setIsCompactViewport(compactMedia.matches)
      setIsLandscapeCompactViewport(landscapeMedia.matches)
    }
    sync()
    compactMedia.addEventListener('change', sync)
    landscapeMedia.addEventListener('change', sync)
    window.addEventListener('orientationchange', sync)
    return () => {
      compactMedia.removeEventListener('change', sync)
      landscapeMedia.removeEventListener('change', sync)
      window.removeEventListener('orientationchange', sync)
    }
  }, [])

  useEffect(() => {
    const onSettings = (event: Event): void => {
      const detail = (event as CustomEvent<ChartWorkspaceSettings>).detail
      if (detail) setChartSettings(detail)
    }
    window.addEventListener(CHART_SETTINGS_EVENT, onSettings)
    return () => window.removeEventListener(CHART_SETTINGS_EVENT, onSettings)
  }, [])

  useEffect(() => {
    let cancelled = false
    const refresh = async (): Promise<void> => {
      try {
        const connections = await getProviderConnections()
        const selected = chooseDefaultProviderSelection(connections)
        if (cancelled || !selected || !['deriv', 'ctrader'].includes(selected.providerId) || !selected.accountId) return
        setActiveProviderSelection(selected)
        const connection = connections.find((item) => item.id === selected.connectionId)
        const account = connection?.accounts.find((item) => item.providerAccountId === selected.accountId && item.active)
        if (account) {
          setAccountData({
            balance: Number(account.balance ?? 0),
            equity: Number(account.equity ?? account.balance ?? 0),
            usedMargin: Number(account.usedMargin ?? 0),
            freeMargin: Number(account.freeMargin ?? account.balance ?? 0),
            floatingPL: Number(account.floatingPL ?? 0),
            currency: account.currency ?? 'USD',
          })
        }
      } catch (error) {
        if (!cancelled) pushToast(error instanceof Error ? error.message : 'Unable to load the connected Deriv account.')
      }
    }
    void refresh()
    const unsubscribe = subscribeToProviderSelection(() => void refresh())
    return () => { cancelled = true; unsubscribe() }
  }, [pushToast])

  useEffect(() => {
    setSymbolSpec(getSymbolSpec(selectedSymbol))
    if (activeProviderSelection?.providerId === 'ctrader') return
    latestCTraderPriceRef.current = null
    setLiveBidPrice(0)
    setLiveAskPrice(0)
    setLiveMarketActive(false)

    const warm = async (): Promise<void> => {
      const existing = historyWarmInFlightRef.current[selectedSymbol]
      const request = existing ?? fetchDerivMultiTimeframeCandles(selectedSymbol, TIMEFRAMES)
      if (!existing) historyWarmInFlightRef.current[selectedSymbol] = request
      try {
        const warmed = await request
        if (selectedSymbolRef.current !== selectedSymbol) return
        for (const [tf, candles] of Object.entries(warmed) as Array<[typeof TIMEFRAMES[number], OHLCV[] | undefined]>) {
          if (!candles?.length) continue
          const key = selectedSymbol + ':' + tf
          const current = candleCacheRef.current[key] ?? []
          if (candles.length > current.length) candleCacheRef.current[key] = candles
        }
        // Re-snapshot every source interval after multi-timeframe history becomes available.
        setStructuralHistorySnapshot(collectStructuralHistorySnapshot(selectedSymbol, activeProviderSelection))
        setTrendRefreshVersion((version) => version + 1)
        const currentKey = selectedSymbol + ':' + timeframeRef.current
        const current = candleCacheRef.current[currentKey] ?? []
        if (current.length > 1) {
          setLiveCandles(current)
          const last = current[current.length - 1]
          setCurrentPrice(last?.close ?? 0)
          setMarketTimestamp(last ? Math.floor(last.time / 1000) : 0)
        }
      } catch {
        // The primary live stream remains responsible for the selected timeframe.
      } finally {
        if (historyWarmInFlightRef.current[selectedSymbol] === request) delete historyWarmInFlightRef.current[selectedSymbol]
      }
    }

    const cacheKey = selectedSymbol + ':' + timeframe
    const cached = candleCacheRef.current[cacheKey] ?? []
    setLiveCandles(cached)
    const last = cached[cached.length - 1]
    setCurrentPrice(last?.close ?? 0)
    setMarketTimestamp(last ? Math.floor(last.time / 1000) : 0)
    void warm()
  }, [selectedSymbol, activeProviderSelection, collectStructuralHistorySnapshot])

  useEffect(() => {
    if (activeProviderSelection?.providerId === 'ctrader') return
    const cacheKey = selectedSymbol + ':' + timeframe
    const cached = candleCacheRef.current[cacheKey] ?? []
    if (cached.length > 1) {
      setLiveCandles(cached)
      const last = cached[cached.length - 1]
      setCurrentPrice(last?.close ?? 0)
      setMarketTimestamp(last ? Math.floor(last.time / 1000) : 0)
    } else {
      setLiveCandles([])
    }
  }, [selectedSymbol, timeframe, activeProviderSelection?.providerId])

  useEffect(() => {
    let cancelled = false
    let stopQuotes: (() => void) | undefined
    const updateQuote = (symbol: string, quote: number) => {
      if (cancelled) return
      setWatchlist((previous) => previous.map((pair) => {
        if (pair.symbol !== symbol) return pair
        const reference = watchlistReferencePricesRef.current[pair.symbol] > 0
          ? watchlistReferencePricesRef.current[pair.symbol]
          : quote
        watchlistReferencePricesRef.current[pair.symbol] = reference
        const move = reference > 0 ? quote - reference : 0
        const percent = reference > 0 ? (move / reference) * 100 : 0
        return { ...pair, price: quote, change: move, changePercent: percent, status: 'open' }
      }))
    }

    const start = async (): Promise<void> => {
      // Subscribe to the known SHAFX FX watchlist immediately; the full Deriv
      // catalog is discovered separately so it cannot delay the first prices.
      let baselineStop: (() => void) | undefined
      try {
        baselineStop = await subscribeDerivForexQuotes(mockWatchlist.map((pair) => pair.symbol), (symbol, quote) => updateQuote(symbol, quote))
      } catch {
        // The chart's own feed remains independent if watchlist transport fails.
      }

      try {
        const active = await fetchDerivActiveForexSymbols()
        if (cancelled) return
        const symbols = active.map((item) => item.symbol).filter(Boolean)
        setWatchlist((previous) => {
          const existing = new Map(previous.map((pair) => [pair.symbol, pair]))
          for (const symbol of symbols) {
            if (!existing.has(symbol)) existing.set(symbol, { symbol, price: 0, change: 0, changePercent: 0, status: 'closed' })
          }
          return Array.from(existing.values())
        })
        // The terminal watcher stays on the curated SHAFX FX set. Discovered
        // symbols remain selectable in the market picker, while the chart opens
        // its own stream when a user selects one. This avoids flooding one public
        // WebSocket with hundreds of simultaneous subscriptions.
      } catch {
        // Keep baseline watchlist quotes available if catalog discovery fails.
      }

      stopQuotes = () => {
        baselineStop?.()
      }
    }
    // Let the primary chart stream establish first; the watchlist is non-critical
    // and opening several sockets at the same time can slow Deriv startup.
    const startupTimer = window.setTimeout(() => { void start() }, 1200)
    return () => {
      cancelled = true
      window.clearTimeout(startupTimer)
      stopQuotes?.()
    }
  }, [])

  useEffect(() => {
    const selection = activeProviderSelection
    if (selection?.providerId !== 'ctrader' || !selection.connectionId || !selection.accountId) return

    let cancelled = false
    const loadHistory = async (): Promise<void> => {
      try {
        const response = await fetch('/api/providers/ctrader', {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            providerId: 'ctrader',
            connectionId: selection.connectionId,
            accountId: selection.accountId,
            environment: selection.environment,
            action: 'history',
            lookbackDays: 1825,
          }),
        })
        const payload = await response.json().catch(() => ({})) as { ok?: boolean; history?: TradeOrder[] }
        const historySnapshot = payload.history
        if (cancelled || !response.ok || !payload.ok || !Array.isArray(historySnapshot)) return
        // Keep the validated response in a local constant so TypeScript retains
        // the array narrowing across the asynchronous state updater callback.
        // Broker history refreshes must not erase another provider/account's history
        // or a locally confirmed close that the broker history page has not surfaced yet.
        setTradeHistory((current) => reconcileCTraderTradeHistory(
          current,
          historySnapshot,
          { connectionId: String(selection.connectionId), accountId: String(selection.accountId) },
        ))
      } catch {
        // Keep any history already rendered when the broker history endpoint is temporarily unavailable.
      }
    }

    void loadHistory()
    const timer = window.setInterval(() => { void loadHistory() }, 30000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [activeProviderSelection?.connectionId, activeProviderSelection?.accountId, activeProviderSelection?.environment, activeProviderSelection?.providerId])

  useEffect(() => {
    const manager = accountStreamManager.current
    if (!activeProviderSelection?.providerId || !['deriv', 'ctrader'].includes(activeProviderSelection.providerId) || !activeProviderSelection.connectionId || !activeProviderSelection.accountId) {
      void manager.stopAll()
      return
    }

    let cancelled = false
    const accountType = activeProviderSelection.environment === 'demo' ? 'demo' as const : 'real' as const
    const spec = {
      providerId: activeProviderSelection.providerId,
      connectionId: activeProviderSelection.connectionId,
      accountId: activeProviderSelection.accountId,
      accountType,
    }
    const key = providerAccountStreamKey(spec)

    const start = async (): Promise<void> => {
      try {
        await manager.stopAll()
        await manager.start(
          spec,
          (snapshot) => {
            if (cancelled || key !== providerAccountStreamKey({
              providerId: activeProviderSelection.providerId,
              connectionId: activeProviderSelection.connectionId,
              accountId: activeProviderSelection.accountId ?? '',
              accountType: activeProviderSelection.environment === 'demo' ? 'demo' : 'real',
            })) return
            setAccountData((prev) => {
              const balance = Number(snapshot.balance ?? prev?.balance ?? 0)
              const floatingPL = Number(snapshot.floatingPL ?? prev?.floatingPL ?? 0)
              const equity = Number(snapshot.equity ?? (balance + floatingPL))
              const usedMargin = Number(snapshot.usedMargin ?? prev?.usedMargin ?? 0)
              const freeMargin = Number(snapshot.freeMargin ?? (equity - usedMargin))
              return {
                balance,
                currency: snapshot.currency || prev?.currency || 'USD',
                equity,
                usedMargin,
                freeMargin,
                floatingPL,
              }
            })
          },
          (status) => {
            if (cancelled) return
            if (status === 'error') pushStreamToast((activeProviderSelection.providerId === 'ctrader' ? 'cTrader' : 'Deriv') + ' account stream interrupted. SHAFX is reconnecting.')
          },
          (event: ProviderStreamEvent) => {
            if (cancelled || key !== providerAccountStreamKey({
              providerId: activeProviderSelection.providerId,
              connectionId: activeProviderSelection.connectionId,
              accountId: activeProviderSelection.accountId ?? '',
              accountType: activeProviderSelection.environment === 'demo' ? 'demo' : 'real',
            })) return

            if (event.type === 'position') {
              const trade = providerPositionToTrade(event.position)
              setOpenPositions((current) => {
                let previous = current.find((item) => item.id === trade.id ||
                  item.providerOrderId === trade.id || trade.providerOrderId === item.id ||
                  (Boolean(item.providerOrderId) && item.providerOrderId === trade.providerOrderId))
                // cTrader order IDs and position IDs are different. Match the local
                // just-opened trade to its broker position so it does not remain as
                // an orphan alongside the real position.
                if (!previous) {
                  const tolerance = trade.symbol.toUpperCase().includes('JPY') ? 0.05 : 0.0005
                  const similar = current.filter((item) =>
                    item.providerId === 'ctrader' &&
                    item.providerConnectionId === String(activeProviderSelection?.connectionId ?? '') &&
                    item.providerAccountId === String(activeProviderSelection?.accountId ?? '') &&
                    item.type === trade.type &&
                    (isUnresolvedProviderSymbol(trade.symbol) || providerSymbolsMatch(item.symbol, trade.symbol)) &&
                    Math.abs(item.entryPrice - trade.entryPrice) <= tolerance)
                  if (similar.length === 1) previous = similar[0]
                }
                const brokerQuote = latestCTraderQuoteForSymbol(latestCTraderQuotesRef.current, trade.symbol)
                const exitPrice = brokerQuote ? (trade.type === 'BUY' ? brokerQuote.bid : brokerQuote.ask) : null
                const pnlReferencePrice = positivePrice(exitPrice, trade.currentPrice, trade.entryPrice) ?? trade.entryPrice
                const brokerProfit = Number.isFinite(trade.profit) ? Number(trade.profit) : Number(previous?.profit ?? 0)
                const stopLoss = positivePrice(trade.stopLoss, trade.plannedStopLossPrice, previous?.stopLoss, previous?.plannedStopLossPrice)
                const takeProfit = positivePrice(trade.takeProfit, trade.plannedTakeProfitPrice, previous?.takeProfit, previous?.plannedTakeProfitPrice)
                const nextTrade: TradeOrder = {
                  ...previous,
                  ...trade,
                  id: trade.id,
                  symbol: positionChartSymbol(trade.symbol, previous?.symbol),
                  chartTimeframe: previous?.chartTimeframe ?? timeframe,
                  // A sparse stream may omit protection prices. Keep the desired
                  // levels visible, but only mark them confirmed if cTrader returns them.
                  stopLoss,
                  takeProfit,
                  plannedStopLossPrice: stopLoss,
                  plannedTakeProfitPrice: takeProfit,
                  brokerProtectionConfirmed: positivePrice(trade.stopLoss) !== null && positivePrice(trade.takeProfit) !== null,
                  openTime: parseCTraderOpenTime(event.position.metadata?.openTimestamp) ?? previous?.openTime ?? trade.openTime,
                  currentPrice: pnlReferencePrice,
                  pnlReferencePrice,
                  pnlReferenceProfit: brokerProfit,
                  pnlPipSize: previous?.pnlPipSize ?? getSymbolSpec(trade.symbol).pipSize,
                  pipValuePerLot: trade.pipValuePerLot ?? previous?.pipValuePerLot,
                  profit: brokerProfit,
                  stopLossPips: trade.stopLossPips ?? previous?.stopLossPips,
                  takeProfitPips: trade.takeProfitPips ?? previous?.takeProfitPips,
                  commission: trade.commission ?? previous?.commission,
                  payout: previous?.payout,
                }
                const next = current.filter((item) => item.id !== previous?.id && item.id !== trade.id &&
                  item.providerOrderId !== trade.id && !(trade.providerOrderId && item.id === trade.providerOrderId))
                return [...next, nextTrade].sort((a, b) => b.openTime.localeCompare(a.openTime))
              })
              setTradeHistory((current) => current.filter((item) => item.id !== trade.id))
              return
            }

            if (event.type === 'order') {
              const raw = (event.order.raw && typeof event.order.raw === 'object') ? event.order.raw as Record<string, unknown> : {}
              if (raw.closed !== true) return
              const trade = providerOrderToTrade(event.order)
              if (!trade) return
              setOpenPositions((current) => current.filter((item) => item.id !== trade.id))
              setTradeHistory((current) => {
                const next = [trade, ...current.filter((item) => item.id !== trade.id)]
                return next.sort((a, b) => String(b.closeTime || b.openTime).localeCompare(String(a.closeTime || a.openTime)))
              })
            }
          },
        )
      } catch (error) {
        if (!cancelled) pushToast(error instanceof Error ? error.message : 'Unable to connect the Deriv account stream.')
      }
    }
    void start()
    return () => { cancelled = true; void manager.stopAll() }
  }, [activeProviderSelection?.providerId, activeProviderSelection?.connectionId, activeProviderSelection?.accountId, activeProviderSelection?.environment, pushStreamToast])

  // Reconcile cTrader positions on startup so the chart can recover confirmed broker SL/TP.
  useEffect(() => {
    const selection = activeProviderSelection
    if (selection?.providerId !== 'ctrader' || !selection.connectionId || !selection.accountId) return
    let cancelled = false
    const refreshPositions = async (): Promise<void> => {
      try {
        const response = await fetch('/api/providers/ctrader', {
          method: 'POST', credentials: 'include', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            providerId: 'ctrader', connectionId: selection.connectionId,
            accountId: selection.accountId, environment: selection.environment, action: 'reconcile',
          }),
        })
        const payload = await response.json().catch(() => ({})) as { ok?: boolean; positions?: unknown[] }
        if (cancelled || !response.ok || !payload.ok || !Array.isArray(payload.positions)) return
        const reconciled: TradeOrder[] = []
        for (const item of payload.positions) {
          if (!item || typeof item !== 'object') continue
          const value = item as Record<string, unknown>
          const metadata = value.metadata && typeof value.metadata === 'object' ? value.metadata as Record<string, unknown> : {}
          const id = String(value.id ?? value.positionId ?? '')
          const symbol = String(value.symbol ?? '')
          const side = value.side === 'SELL' ? 'SELL' : value.side === 'BUY' ? 'BUY' : null
          const entryPrice = Number(value.entryPrice ?? 0)
          if (!id || !symbol || !side || !Number.isFinite(entryPrice) || entryPrice <= 0) continue
          const position: ProviderPosition = {
            id, symbol, side,
            quantity: Number(value.quantity ?? value.lots ?? value.volumeLots ?? 0),
            entryPrice, currentPrice: positivePrice(value.currentPrice) ?? undefined,
            stopLoss: positivePrice(value.stopLoss), takeProfit: positivePrice(value.takeProfit),
            unrealizedPL: Number(value.unrealizedPL ?? 0),
            metadata: { ...metadata, provider: 'ctrader', connectionId: String(selection.connectionId), accountId: String(selection.accountId) },
          }
          reconciled.push(providerPositionToTrade(position))
        }
        // Only clear stale positions for a confirmed empty snapshot. If any broker
        // row failed normalization, keep the last good state rather than treating
        // malformed provider data as an empty account.
        if (!isCompleteCTraderPositionSnapshot(payload.positions, reconciled)) return
        setOpenPositions((current) => reconcileCTraderPositionList(
          current,
          reconciled,
          {
            connectionId: String(selection.connectionId),
            accountId: String(selection.accountId),
            nowMs: Date.now(),
            symbolMatches: (localSymbol, brokerSymbol) =>
              isUnresolvedProviderSymbol(brokerSymbol) || providerSymbolsMatch(localSymbol, brokerSymbol),
          },
          (trade, previous) => {
            const brokerQuote = latestCTraderQuoteForSymbol(latestCTraderQuotesRef.current, trade.symbol)
            const exitPrice = brokerQuote ? (trade.type === 'BUY' ? brokerQuote.bid : brokerQuote.ask) : null
            const pnlReferencePrice = positivePrice(exitPrice, trade.currentPrice, previous?.currentPrice, trade.entryPrice) ?? trade.entryPrice
            const brokerProfit = Number.isFinite(trade.profit) ? Number(trade.profit) : Number(previous?.profit ?? 0)
            const sl = positivePrice(trade.stopLoss, trade.plannedStopLossPrice, previous?.stopLoss, previous?.plannedStopLossPrice)
            const tp = positivePrice(trade.takeProfit, trade.plannedTakeProfitPrice, previous?.takeProfit, previous?.plannedTakeProfitPrice)
            return {
              ...previous, ...trade,
              symbol: positionChartSymbol(trade.symbol, previous?.symbol),
              stopLoss: sl, takeProfit: tp,
              plannedStopLossPrice: sl, plannedTakeProfitPrice: tp,
              currentPrice: pnlReferencePrice, pnlReferencePrice, pnlReferenceProfit: brokerProfit,
              pnlPipSize: previous?.pnlPipSize ?? getSymbolSpec(trade.symbol).pipSize,
              pipValuePerLot: trade.pipValuePerLot ?? previous?.pipValuePerLot,
              profit: brokerProfit,
              chartTimeframe: previous?.chartTimeframe ?? timeframeRef.current,
              stopLossPips: trade.stopLossPips ?? previous?.stopLossPips,
              takeProfitPips: trade.takeProfitPips ?? previous?.takeProfitPips,
              commission: trade.commission ?? previous?.commission, payout: previous?.payout,
              brokerProtectionConfirmed: positivePrice(trade.stopLoss) !== null && positivePrice(trade.takeProfit) !== null,
            }
          },
        ))
      } catch {
        // Keep the last good position data if the broker is temporarily unavailable.
      }
    }
    void refreshPositions()
    const timer = window.setInterval(() => { void refreshPositions() }, 30_000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [activeProviderSelection?.accountId, activeProviderSelection?.connectionId, activeProviderSelection?.environment, activeProviderSelection?.providerId])

  const handleLiveUpdate = useCallback((candles: OHLCV[], price: number, epoch: number): void => {
    // A prior symbol/timeframe subscription can deliver a final callback after
    // a switch. Do not let that stale snapshot overwrite the active chart.
    if (selectedSymbolRef.current !== selectedSymbol || timeframeRef.current !== timeframe) return

    const valid = normalizeMarketCandles(candles)
    // Keep the last good chart mounted during transient invalid/empty snapshots.
    if (!valid.length) return

    const cacheKey = selectedSymbol + ':' + timeframe
    const cTraderActive = activeProviderSelection?.providerId === 'ctrader'
    const livePrice = cTraderActive && latestCTraderPriceRef.current && latestCTraderPriceRef.current > 0
      ? latestCTraderPriceRef.current
      : price
    candleCacheRef.current[cacheKey] = valid
    setLiveCandles(valid)
    setCurrentPrice(livePrice)
    setMarketTimestamp(Math.floor(epoch / 1000))
  }, [activeProviderSelection?.providerId, selectedSymbol, timeframe])

  useEffect(() => {
    const selection = activeProviderSelection
    if (selection?.providerId !== 'ctrader' || !selection.connectionId || !selection.accountId) return

    let cancelled = false
    const cacheKey = [
      String(selection.connectionId),
      String(selection.accountId),
      selection.environment,
      selectedSymbol,
      timeframe,
    ].join(':')
    const cachedCandles = cTraderCandleCacheRef.current[cacheKey] ?? []
    // Keep the exact symbol/timeframe's previously loaded bars visible during
    // refresh. This avoids a blank chart while the broker history request waits.
    liveCandlesRef.current = cachedCandles
    setLiveCandles(cachedCandles)
    // Keep the current broker quote and Bid/Ask rails while another timeframe's
    // historical bars load. Cached candle close is not the current live price.
    const cachedLast = cachedCandles[cachedCandles.length - 1]
    if (cachedLast && !(latestCTraderPriceRef.current && latestCTraderPriceRef.current > 0)) {
      setCurrentPrice(cachedLast.close)
      setMarketTimestamp(Math.floor(cachedLast.time))
    }

    const load = async (): Promise<void> => {
      try {
        const candles = await fetchCTraderHistoricalCandles({
          connectionId: String(selection.connectionId),
          accountId: String(selection.accountId),
          environment: selection.environment === 'live' ? 'live' : 'demo',
          symbol: selectedSymbol,
          timeframe,
          count: 300,
        })
        if (cancelled || !candles.length) return
        // A quote may arrive before the slower historical snapshot. Merge the
        // two so the history response cannot rewind or erase current live ticks.
        const liveDuringLoad = cTraderCandleCacheRef.current[cacheKey] ?? liveCandlesRef.current
        const mergedCandles = mergeCTraderHistoricalAndLiveCandles(candles, liveDuringLoad)
        cTraderCandleCacheRef.current[cacheKey] = mergedCandles
        candleCacheRef.current[selectedSymbol + ':' + timeframe] = mergedCandles
        liveCandlesRef.current = mergedCandles
        setLiveCandles(mergedCandles)
        const last = mergedCandles[mergedCandles.length - 1]
        if (last && !(latestCTraderPriceRef.current && latestCTraderPriceRef.current > 0)) {
          setCurrentPrice(last.close)
          setMarketTimestamp(Math.floor(last.time))
        }
      } catch (error) {
        if (!cancelled) pushStreamToast(error instanceof Error ? error.message : 'cTrader chart history could not be loaded.')
      }
    }

    void load()
    return () => { cancelled = true }
  }, [activeProviderSelection?.accountId, activeProviderSelection?.connectionId, activeProviderSelection?.environment, activeProviderSelection?.providerId, pushStreamToast, selectedSymbol, timeframe])

  // Warm the other chart intervals in the background once per symbol/account.
  // This lets timeframe buttons swap cached bars immediately after the initial load.
  useEffect(() => {
    const selection = activeProviderSelection
    if (selection?.providerId !== 'ctrader' || !selection.connectionId || !selection.accountId) return
    let cancelled = false
    const connectionId = String(selection.connectionId)
    const accountId = String(selection.accountId)
    const environment = selection.environment === 'live' ? 'live' : 'demo'
    const symbol = selectedSymbol
    const keyFor = (targetTimeframe: Timeframe): string => [connectionId, accountId, selection.environment, symbol, targetTimeframe].join(':')
    const pending = TIMEFRAMES.filter((targetTimeframe) => targetTimeframe !== timeframeRef.current &&
      (cTraderCandleCacheRef.current[keyFor(targetTimeframe)] ?? []).length < 2)
    let nextIndex = 0
    const worker = async (): Promise<void> => {
      while (!cancelled) {
        const targetTimeframe = pending[nextIndex++]
        if (!targetTimeframe) return
        if (targetTimeframe === timeframeRef.current) continue
        const cacheKey = keyFor(targetTimeframe)
        if ((cTraderCandleCacheRef.current[cacheKey] ?? []).length > 1) continue
        try {
          const history = await fetchCTraderHistoricalCandles({ connectionId, accountId, environment, symbol, timeframe: targetTimeframe, count: 300 })
          if (cancelled || selectedSymbolRef.current !== symbol || !history.length) continue
          const latestLive = cTraderCandleCacheRef.current[cacheKey] ??
            (timeframeRef.current === targetTimeframe ? liveCandlesRef.current : [])
          const merged = mergeCTraderHistoricalAndLiveCandles(history, latestLive)
          if (!merged.length) continue
          cTraderCandleCacheRef.current[cacheKey] = merged
          candleCacheRef.current[symbol + ':' + targetTimeframe] = merged
          if (timeframeRef.current === targetTimeframe) {
            liveCandlesRef.current = merged
            setLiveCandles(merged)
          }
        } catch {
          // The foreground loader handles the selected interval; other intervals retry on a later visit.
        }
      }
    }
    // Two workers avoid firing every broker-history request at once. Once
    // the background histories settle, rebuild visible levels from the new cache.
    void Promise.all([worker(), worker()]).then(() => {
      if (!cancelled && selectedSymbolRef.current === symbol) {
        setStructuralHistorySnapshot(collectStructuralHistorySnapshot(symbol, selection))
        setTrendRefreshVersion((version) => version + 1)
      }
    })
    return () => { cancelled = true }
  }, [activeProviderSelection?.accountId, activeProviderSelection?.connectionId, activeProviderSelection?.environment, activeProviderSelection?.providerId, collectStructuralHistorySnapshot, selectedSymbol])

  useEffect(() => {
    const selection = activeProviderSelection
    if (selection?.providerId !== 'ctrader' || !selection.connectionId || !selection.accountId) return

    // Old quote requests can finish after cleanup. Capture identity and reject
    // callbacks that no longer belong to the active symbol/timeframe.
    let cancelled = false
    let historyRepairInFlight = false
    let lastHistoryRepairAt = 0
    let lastHistoryGapRepairSignature = ''
    const subscriptionSymbol = selectedSymbol
    const historyRepairKeyFor = (targetTimeframe: Timeframe): string => [
      String(selection.connectionId),
      String(selection.accountId),
      selection.environment,
      subscriptionSymbol,
      targetTimeframe,
    ].join(':')

    const repairSkippedCandles = async (targetTimeframe: Timeframe, force = false): Promise<void> => {
      // Backfill actual broker bars after a gap, and always refresh once when
      // the tab resumes so users never need to change timeframe or reload manually.
      // Never synthesize flat candles to hide missing history.
      if (cancelled || historyRepairInFlight || (!force && Date.now() - lastHistoryRepairAt < 15_000)) return
      historyRepairInFlight = true
      lastHistoryRepairAt = Date.now()
      try {
        const history = await fetchCTraderHistoricalCandles({
          connectionId: String(selection.connectionId),
          accountId: String(selection.accountId),
          environment: selection.environment === 'live' ? 'live' : 'demo',
          symbol: subscriptionSymbol,
          timeframe: targetTimeframe,
          count: 300,
        })
        if (cancelled || selectedSymbolRef.current !== subscriptionSymbol) return

        const historyRepairKey = historyRepairKeyFor(targetTimeframe)
        const latestLive = cTraderCandleCacheRef.current[historyRepairKey] ??
          (timeframeRef.current === targetTimeframe ? liveCandlesRef.current : [])
        const repaired = mergeCTraderHistoricalAndLiveCandles(history, latestLive)
        const unchanged = repaired.length === latestLive.length && repaired.every((bar, index) => {
          const previous = latestLive[index]
          return previous &&
            previous.time === bar.time &&
            previous.open === bar.open &&
            previous.high === bar.high &&
            previous.low === bar.low &&
            previous.close === bar.close
        })
        if (unchanged) return

        cTraderCandleCacheRef.current[historyRepairKey] = repaired
        candleCacheRef.current[subscriptionSymbol + ':' + targetTimeframe] = repaired
        if (timeframeRef.current === targetTimeframe) {
          liveCandlesRef.current = repaired
          setLiveCandles(repaired)
        }
        // Keep the quote/header time from the live stream; this request repairs
        // candle history only and must never make the visible price jump backward.
      } catch {
        // A later genuine gap can retry; do not replace good live candles with a failed refresh.
      } finally {
        historyRepairInFlight = false
      }
    }

    const unsubscribe = subscribeCTraderLiveQuote({
      connectionId: selection.connectionId,
      accountId: selection.accountId,
      environment: selection.environment === 'live' ? 'live' : 'demo',
      symbol: subscriptionSymbol,
    }, (nextQuote, nextInstrument, update) => {
      if (cancelled || selectedSymbolRef.current !== subscriptionSymbol) return

      // Use broker-reported contract constraints for Trade Bot sizing. The general
      // workspace still uses its existing spec; this gate is scoped to Trade Bot.
      const tradeBotSource = {
        providerId: 'ctrader',
        connectionId: selection.connectionId,
        accountId: selection.accountId,
        environment: selection.environment === 'live' ? 'live' as const : 'demo' as const,
      }
      const tradeBotSpecKey = tradeBotMarketSourceKey(subscriptionSymbol, tradeBotSource)
      const resolvedTradeBotSpec = cTraderInstrumentToSymbolSpec(subscriptionSymbol, nextInstrument)
      setTradeBotBrokerSpec((previous) => {
        if (previous?.sourceKey === tradeBotSpecKey && JSON.stringify(previous.symbolSpec) === JSON.stringify(resolvedTradeBotSpec)) return previous
        return { sourceKey: tradeBotSpecKey, symbolSpec: resolvedTradeBotSpec }
      })

      // The quote stream belongs to the symbol/account; timeframe changes
      // only switch candle aggregation and must not interrupt Bid/Ask.
      const subscriptionTimeframe = timeframeRef.current
      const bid = Number(nextQuote.bid)
      const ask = Number(nextQuote.ask)
      const price = Number.isFinite(bid) && bid > 0
        ? bid
        : Number.isFinite(ask) && ask > 0
          ? ask
          : 0
      if (!price) return
      const epochMs = Date.parse(nextQuote.timestamp)
      const timestamp = Number.isFinite(epochMs) ? epochMs : Date.now()
      latestCTraderQuotesRef.current[normalizeProviderSymbol(subscriptionSymbol)] = {
        symbol: subscriptionSymbol,
        bid: Number.isFinite(bid) && bid > 0 ? bid : price,
        ask: Number.isFinite(ask) && ask > 0 ? ask : price,
        updatedAt: Date.now(),
      }
      const bucket = cTraderQuoteBucket(timestamp, subscriptionTimeframe)

      // Quote freshness and candle timestamp validity are separate concerns.
      // A successful current quote should always feed the Bid/Ask rails, even if
      // the provider timestamp sits behind this timeframe's latest cached candle.
      // Only update OHLC when its candle bucket is valid and the quote actually
      // changed (or crossed a provider-minute boundary); heartbeat-only packets
      // keep the live status fresh without repainting identical candles.
      const currentCandles = normalizeMarketCandles(liveCandlesRef.current)
      const last = currentCandles[currentCandles.length - 1]
      const candleBucketIsCurrent = isCTraderQuoteBucketCurrent(bucket, last?.time)
      const skippedCandleBucket = candleBucketIsCurrent &&
        shouldRepairCTraderHistoryForGap(last?.time, bucket, subscriptionTimeframe)
      const recentGapSignature = getRecentCTraderCandleGapSignature(currentCandles, subscriptionTimeframe)
      const newlyDetectedHistoryGap = Boolean(recentGapSignature && recentGapSignature !== lastHistoryGapRepairSignature)

      if (candleBucketIsCurrent && (update.pricesChanged || update.quoteClockAdvanced || update.resumed)) {
        // Candle OHLC is bid-based. Preserve the forming candle's open and use
        // actual Ask/Bid quote changes to update its range and close.
        const nextCandles = applyCTraderQuoteToCandles(currentCandles, bucket, price)
        if (nextCandles.length > 0) {
          const cTraderKey = historyRepairKeyFor(subscriptionTimeframe)
          liveCandlesRef.current = nextCandles
          cTraderCandleCacheRef.current[cTraderKey] = nextCandles
          candleCacheRef.current[subscriptionSymbol + ':' + subscriptionTimeframe] = nextCandles
          setLiveCandles(nextCandles)
        }
      }
      if (update.resumed) {
        void repairSkippedCandles(subscriptionTimeframe, true)
      } else if (newlyDetectedHistoryGap && recentGapSignature) {
        lastHistoryGapRepairSignature = recentGapSignature
        void repairSkippedCandles(subscriptionTimeframe)
      } else if (skippedCandleBucket) {
        void repairSkippedCandles(subscriptionTimeframe)
      }

      latestCTraderPriceRef.current = price
      const quoteIdentity = [
        subscriptionSymbol,
        'ctrader',
        String(selection.connectionId),
        String(selection.accountId),
        selection.environment === 'live' ? 'live' : 'demo',
      ].join(':')
      liveQuoteIdentityRef.current = quoteIdentity
      setLiveQuoteIdentity(quoteIdentity)
      setLiveBidPrice(Number.isFinite(bid) && bid > 0 ? bid : price)
      setLiveAskPrice(Number.isFinite(ask) && ask > 0 ? ask : price)
      setCurrentPrice(price)
      setMarketTimestamp(Math.floor(timestamp / 1000))
      setLiveMarketActive(true)
      if (cTraderQuoteStaleTimerRef.current !== null) window.clearTimeout(cTraderQuoteStaleTimerRef.current)
      cTraderQuoteStaleTimerRef.current = window.setTimeout(() => {
        // This timer survives timeframe changes. A true symbol/account change
        // invalidates its identity and clears it in the source-identity effect.
        if (liveQuoteIdentityRef.current !== quoteIdentity) return
        liveQuoteIdentityRef.current = null
        latestCTraderPriceRef.current = null
        setLiveQuoteIdentity(null)
        setLiveBidPrice(0)
        setLiveAskPrice(0)
        setLiveMarketActive(false)
        cTraderQuoteStaleTimerRef.current = null
      }, 15_000)
    })
    return () => {
      cancelled = true
      unsubscribe()
      // Keep the current-quote freshness timer alive on a timeframe-only cleanup.
      // A provider/symbol/account switch is handled by the identity effect above.
    }
  }, [activeProviderSelection?.accountId, activeProviderSelection?.connectionId, activeProviderSelection?.environment, activeProviderSelection?.providerId, selectedSymbol])

  const handleLiveActiveChange = useCallback((active: boolean): void => {
    setLiveMarketActive(active)
  }, [])

  const marketAnalysis = useMemo<MarketAnalysis>(() => {
    if (liveCandles.length < 5) {
      return {
        bias: 'Neutral',
        structure: { type: 'Waiting for live candles', status: 'Developing' },
        liquidity: { previousHigh: null, previousLow: null, equalHighs: false, equalLows: false, zones: [] },
        supportResistance: { nearestSupport: null, nearestResistance: null },
      }
    }
    const swings = findSwingPoints(liveCandles, 2)
    const structure = analyzeMarketStructure(liveCandles, 2)
    const tolerance = selectedSymbol.includes('JPY') ? 0.1 : 0.001
    const supportResistance = analyzeSupportResistance(liveCandles, tolerance, swings)
    const liquidity = analyzeLiquidity(liveCandles, swings, tolerance)
    return {
      bias: structure.bias === 'Bullish' ? 'Bullish' : structure.bias === 'Bearish' ? 'Bearish' : 'Neutral',
      structure: { type: structure.structureType, status: structure.status },
      liquidity: {
        previousHigh: liquidity.nearestBuySide?.referencePrice ?? null,
        previousLow: liquidity.nearestSellSide?.referencePrice ?? null,
        equalHighs: liquidity.pools.some((pool) => pool.association === 'equal-highs'),
        equalLows: liquidity.pools.some((pool) => pool.association === 'equal-lows'),
        zones: liquidity.pools.slice(0, 4).map((pool) => pool.association),
      },
      supportResistance,
    }
  }, [liveCandles, selectedSymbol])

  // Deriv's public FX stream gives SHAFX one live market price rather than a broker-side
  // bid/ask pair. Keep the terminal MT5-like at the fractional-pip level without rounding
  // away the final price digit on each tick. The spread remains a display estimate until
  // a broker-side bid/ask feed is available.
  const usingCTrader = activeProviderSelection?.providerId === 'ctrader'
  const selectedCTraderQuoteIdentity = [
    selectedSymbol,
    'ctrader',
    String(activeProviderSelection?.connectionId ?? ''),
    String(activeProviderSelection?.accountId ?? ''),
    activeProviderSelection?.environment === 'live' ? 'live' : 'demo',
  ].join(':')
  const cTraderQuoteMatchesChart = usingCTrader &&
    liveQuoteIdentity === selectedCTraderQuoteIdentity
  const chartBidRaw = usingCTrader
    ? cTraderQuoteMatchesChart && liveMarketActive && liveBidPrice > 0 ? liveBidPrice : 0
    : liveMarketActive && Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : 0
  const chartBidPrice = chartBidRaw > 0 ? Number(chartBidRaw.toFixed(symbolSpec.pricePrecision)) : 0
  const chartSpread = Math.max(symbolSpec.pipSize * 0.2, symbolSpec.pipSize / 10)
  const chartAskPrice = usingCTrader
    ? cTraderQuoteMatchesChart && liveMarketActive && liveAskPrice > 0 ? Number(liveAskPrice.toFixed(symbolSpec.pricePrecision)) : 0
    : chartBidPrice > 0
      ? (() => {
        const chartAskCandidate = Number((chartBidPrice + chartSpread).toFixed(symbolSpec.pricePrecision))
        return chartAskCandidate > chartBidPrice
          ? chartAskCandidate
          : Number((chartBidPrice + symbolSpec.pipSize).toFixed(symbolSpec.pricePrecision))
      })()
      : 0
  const chartQuoteReady = liveMarketActive && (!usingCTrader || cTraderQuoteMatchesChart) && chartBidPrice > 0 && chartAskPrice > 0

  // Recalculate the selected cTrader position's floating P/L on every fresh quote.
  // Broker snapshots remain the anchor; quote movement fills in the 3-second polling gap.
  const liveOpenPositions = useMemo(() => openPositions.map((position) => {
    if (!usingCTrader || !chartQuoteReady || position.providerId !== 'ctrader' ||
      !providerSymbolsMatch(position.symbol, selectedSymbol)) return position
    const exitPrice = position.type === 'BUY' ? liveBidPrice : liveAskPrice
    const pipSize = positivePrice(position.pnlPipSize, getSymbolSpec(position.symbol).pipSize)
    const pipValuePerLot = positivePrice(position.pipValuePerLot)
    const lots = positivePrice(position.volumeLots, position.lotSize)
    if (!Number.isFinite(exitPrice) || exitPrice <= 0 || !pipSize || !pipValuePerLot || !lots) {
      return { ...position, currentPrice: Number.isFinite(exitPrice) && exitPrice > 0 ? exitPrice : position.currentPrice }
    }
    const referencePrice = positivePrice(position.pnlReferencePrice, position.currentPrice, position.entryPrice) ?? position.entryPrice
    const referenceProfit = Number.isFinite(position.pnlReferenceProfit)
      ? Number(position.pnlReferenceProfit)
      : Number(position.profit ?? 0)
    const signedPipMove = ((exitPrice - referencePrice) / pipSize) * (position.type === 'BUY' ? 1 : -1)
    return {
      ...position,
      currentPrice: exitPrice,
      profit: referenceProfit + signedPipMove * pipValuePerLot * lots,
    }
  }), [openPositions, usingCTrader, chartQuoteReady, selectedSymbol, liveBidPrice, liveAskPrice])

  // Recompute levels when completed history changes, including a backfill that preserves the last candle time.
  const structuralCandleSignature = useMemo(() => liveCandles.slice(0, -1)
    .map((candle) => [candle.time, candle.open, candle.high, candle.low, candle.close].join(':'))
    .join('|'), [liveCandles])
  // A symbol change intentionally blanks old source history until its own caches load.
  const structuralHistories = structuralHistorySnapshot.symbol === selectedSymbol
    ? structuralHistorySnapshot.histories
    : EMPTY_STRUCTURAL_HISTORIES
  const chartAnnotations = useMemo(() => {
    const historyByTimeframe: Partial<Record<Timeframe, OHLCV[]>> = { ...structuralHistories }
    // Use the latest selected-interval candles from React state, while the
    // source history signature keeps incomplete live ticks from re-running scans.
    historyByTimeframe[timeframe] = liveCandles
    return buildMultiTimeframeStructuralAnnotations(selectedSymbol, timeframe, historyByTimeframe, visibleChartBars)
  }, [selectedSymbol, timeframe, structuralHistories, structuralCandleSignature, trendRefreshVersion, visibleChartBars])

  const selectedOpenPosition = useMemo(
    () => liveOpenPositions.find((position) =>
      position.status === 'open' && providerSymbolsMatch(position.symbol, selectedSymbol)) ?? null,
    [liveOpenPositions, selectedSymbol],
  )

  // Keep every open position for the selected symbol on the chart.
  // The ticket can stay focused on the newest position, but its siblings must
  // remain visible with their own entry / stop / target levels.
  const chartOpenPositions = useMemo(
    () => liveOpenPositions.filter((position) =>
      position.status === 'open' && providerSymbolsMatch(position.symbol, selectedSymbol)),
    [liveOpenPositions, selectedSymbol],
  )

  const openPositionsOnOtherSymbols = useMemo(
    () => liveOpenPositions.filter((position) =>
      position.status === 'open' && !providerSymbolsMatch(position.symbol, selectedSymbol)),
    [liveOpenPositions, selectedSymbol],
  )

  // Each open position gets its own entry/SL/TP levels. Shared Bid/Ask labels
  // are rendered once by the chart; coincident SL/TP prices are grouped.
  const brokerPositionTradeLines = useMemo<ChartAnnotation[]>(
    () => buildOpenPositionsChartLines(chartOpenPositions, accountData?.currency ?? 'USD'),
    [chartOpenPositions, accountData?.currency],
  )

  const combinedTradeLines = useMemo(() => {
    // For cTrader, the selected broker position is the source of truth. Do not
    // add the ticket's local preview lines as a second copy of the same position.
    if (usingCTrader) return brokerPositionTradeLines

    // Draft ticket SL/TP are sizing previews, not active chart levels.
    const draftLevelIds = new Set(['shafx-cfd-sl', 'shafx-cfd-tp', 'plan-sl', 'plan-tp'])
    return [
      ...tradeLines.filter((line) =>
        !draftLevelIds.has(line.id) &&
        !brokerPositionTradeLines.some((broker) => broker.id === line.id),
      ),
      ...brokerPositionTradeLines,
    ]
  }, [brokerPositionTradeLines, tradeLines, usingCTrader])

  // The chart's trade map includes entries and exits for this symbol only.
  // Marker coordinates resolve against historical candle timestamps; no prices
  // are invented and trades outside the loaded history simply remain in the blotter.
  const chartTradeMarkers = useMemo<TradeChartMarker[]>(() => {
    const seen = new Set<string>()
    const trades = [...liveOpenPositions, ...tradeHistory.slice(0, 20)]
    return trades
      .filter((trade) => providerSymbolsMatch(trade.symbol, selectedSymbol))
      .filter((trade) => {
        if (!trade.id || seen.has(trade.id)) return false
        seen.add(trade.id)
        return Number.isFinite(trade.entryPrice) && trade.entryPrice > 0 && Boolean(trade.openTime)
      })
      .map((trade) => ({
        id: trade.id,
        side: trade.type,
        openTime: trade.openTime,
        closeTime: trade.closeTime,
        entryPrice: trade.entryPrice,
        exitPrice: trade.exitPrice,
        volume: Number(trade.volumeLots ?? trade.lotSize ?? 0),
        status: trade.status,
        profit: Number(trade.profit ?? 0),
      }))
  }, [liveOpenPositions, selectedSymbol, tradeHistory])

  // Deriv public market data requires no authenticated account. Keep chart startup
  // independent from the slower OAuth/account synchronization path.
  const activeMarketConnection = useMemo(() => ({
    providerId: 'deriv',
    connectionId: activeProviderSelection?.connectionId ?? 'public-market',
    accountId: activeProviderSelection?.accountId,
    environment: activeProviderSelection?.environment ?? 'demo',
    state: 'connected' as const,
    connectedAt: new Date().toISOString(),
  }), [activeProviderSelection?.providerId, activeProviderSelection?.connectionId, activeProviderSelection?.accountId, activeProviderSelection?.environment])
  const activeProviderName = activeProviderSelection?.providerId === 'ctrader' ? 'Deriv cTrader' : 'Deriv'
  const accountModeLabel = activeProviderSelection?.environment === 'live' ? 'REAL ACCOUNT' : 'DEMO ACCOUNT'
  const accountModeTone = activeProviderSelection?.environment === 'live' ? 'text-shafx-accent' : 'text-shafx-success'
  const chartToolMode: ChartToolMode = chartTool

  const derivOrderConnection = activeProviderSelection?.connectionId && activeProviderSelection.accountId
    ? {
        connectionId: activeProviderSelection.connectionId,
        accountId: activeProviderSelection.accountId,
        environment: activeProviderSelection.environment,
      }
    : null

  const handleClosePosition = useCallback(async (id: string): Promise<TradeOrder | null> => {
    const existing = openPositions.find((order) => order.id === id) || tradeHistory.find((order) => order.id === id)
    if (!derivOrderConnection) {
      pushToast('Connect a trading account before closing a trade.')
      return null
    }
    try {
      let closed: TradeOrder | null = null
      if (activeProviderSelection?.providerId === 'ctrader') {
        const response = await fetch('/api/providers/ctrader', {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerId: 'ctrader', connectionId: derivOrderConnection.connectionId, accountId: derivOrderConnection.accountId, environment: derivOrderConnection.environment, action: 'closePosition', positionId: id }),
        })
        const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; order?: { timestamp?: string } }
        if (!response.ok || !payload.ok) throw new Error(payload.error || 'Unable to close the cTrader position.')
        const result = payload.order
        closed = {
          ...(existing || {
            id,
            symbol: selectedSymbol,
            type: 'BUY' as const,
            lotSize: 0,
            entryPrice: 0,
            stopLoss: null,
            takeProfit: null,
            riskPercent: 0,
            riskAmount: 0,
            rewardAmount: 0,
            riskRewardRatio: 0,
            status: 'open' as const,
            openTime: new Date().toISOString(),
          }),
          status: 'closed',
          closeTime: result?.timestamp || new Date().toISOString(),
          profit: existing?.profit ?? 0,
        }
      } else {
        closed = await closeDerivContract(derivOrderConnection, id, existing)
      }

      if (!closed) return null
      setOpenPositions((current) => current.filter((order) => order.id !== id))
      setTradeHistory((current) => [closed as TradeOrder, ...current.filter((order) => order.id !== id)])
      setTradeLines((current) => current.filter((line) => !line.id.startsWith(id + '-')))
      return closed
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Unable to close the selected trade.')
      return null
    }
  }, [activeProviderSelection, derivOrderConnection, openPositions, pushToast, selectedSymbol, tradeHistory])

  const handleBulkClose = useCallback(async (mode: 'winning' | 'losing' | 'all'): Promise<void> => {
    const candidates = liveOpenPositions
      .filter((trade) => mode === 'all' || (mode === 'winning' ? Number(trade.profit ?? 0) > 0 : Number(trade.profit ?? 0) < 0))
      .map((trade) => trade.id)

    if (!candidates.length) return

    let closedCount = 0
    for (const id of candidates) {
      const closed = await handleClosePosition(id)
      if (closed) closedCount += 1
    }

    if (closedCount > 0) {
      pushToast('Closed ' + closedCount + ' ' + (closedCount === 1 ? 'trade' : 'trades') + '.')
    }
  }, [handleClosePosition, liveOpenPositions, pushToast])

  // Deriv's authenticated account stream is the source of truth for
  // balance, equity, free margin and floating P/L. Do not overwrite broker
  // accounting with the public chart price.
  const brokerAccountData = accountData ?? {
    balance: 0,
    equity: 0,
    usedMargin: 0,
    freeMargin: 0,
    floatingPL: 0,
    currency: 'USD',
  }
  const liveFloatingPnlAdjustment = usingCTrader && chartQuoteReady
    ? liveOpenPositions.reduce((total, position) => {
      if (position.providerId !== 'ctrader' || !providerSymbolsMatch(position.symbol, selectedSymbol)) return total
      const previous = openPositions.find((item) => item.id === position.id)
      if (!previous) return total
      return total + Number(position.profit ?? 0) - Number(previous.profit ?? 0)
    }, 0)
    : 0
  const resolvedAccountData: AccountData = {
    ...brokerAccountData,
    floatingPL: brokerAccountData.floatingPL + liveFloatingPnlAdjustment,
    equity: brokerAccountData.equity + liveFloatingPnlAdjustment,
    freeMargin: brokerAccountData.freeMargin + liveFloatingPnlAdjustment,
  }

  const handleTrendToggle = (): void => {
    const showNext = !trendVisible
    if (showNext) {
      setStructuralHistorySnapshot(collectStructuralHistorySnapshot(selectedSymbol, activeProviderSelection))
      setTrendRefreshVersion((version) => version + 1)
    }
    // Hiding avoids a rescan; the chart removes structure immediately while
    // broker entry/SL/TP and Bid/Ask overlays remain visible.
    setTrendVisible(showNext)
  }

  const handleVisibleChartBarsChange = useCallback((count: number): void => {
    const zoomTier = count >= 240 ? 240 : count >= 140 ? 140 : 0
    setVisibleChartBars((current) => current === zoomTier ? current : zoomTier)
  }, [])

  const handleReviewSetup = useCallback((setup?: SetupCandidate | null): void => {
    setReviewSetup(setup || null)
    setMobileTab('chat')
    setMobileDockOpen(false)
  }, [])

  const openMobileDock = (next: WorkspaceDock): void => {
    const willOpen = dock !== next || !mobileDockOpen
    setMobileDockOpen((open) => dock === next ? !open : true)
    setDock(next)
    if (!willOpen) setMobileDockOpen(false)
  }

  const showMarket = !['bot', 'history', 'funds', 'account'].includes(mobileTab)
  const showChat = mobileTab === 'chat'
  const showBot = mobileTab === 'bot'
  const showHistory = mobileTab === 'history'
  const showFunds = mobileTab === 'funds'
  const showAccount = mobileTab === 'account'

  // cTrader supplies the authenticated live quote stream. Do not mount the
  // public Deriv candle stream at the same time: both feeds can update
  // liveCandles and make the chart oscillate between two price sources.
  const liveControl = activeProviderSelection?.providerId === 'ctrader'
    ? <div className="flex min-h-10 items-center gap-2 rounded-lg border border-shafx-success/25 bg-shafx-success/5 px-3 text-[10px] font-semibold text-shafx-success">
        <span className="h-2 w-2 rounded-full bg-shafx-success" />
        cTrader LIVE
      </div>
    : <ProviderLiveControl
        providerId="deriv"
        connection={activeMarketConnection}
        symbol={selectedSymbol}
        timeframe={timeframe}
        onUpdate={handleLiveUpdate}
        onActiveChange={handleLiveActiveChange}
      />

  const signalBotMarketSource = {
    providerId: activeProviderSelection?.providerId ?? null,
    connectionId: activeProviderSelection?.connectionId ?? null,
    accountId: activeProviderSelection?.accountId ?? null,
    environment: activeProviderSelection?.environment ?? null,
  }
  const expectedTradeBotSpecKey = tradeBotMarketSourceKey(selectedSymbol, signalBotMarketSource)
  const tradeBotSymbolSpec = tradeBotBrokerSpec?.sourceKey === expectedTradeBotSpecKey
    ? tradeBotBrokerSpec.symbolSpec
    : null
  const tradeBotSymbolSpecError = tradeBotBrokerSpec?.sourceKey === expectedTradeBotSpecKey
    ? tradeBotBrokerSpec.error ?? null
    : null

  const dockContent = {
    insights: <div className="space-y-3">
      <FXMoveMatrix pairs={watchlist} />
      <MarketAnalysisPanel analysis={marketAnalysis} pricePrecision={symbolSpec.pricePrecision} pipSize={symbolSpec.pipSize} currentPrice={currentPrice} timeframe={timeframe} />
<AIAssistantPanel symbol={selectedSymbol} timeframe={timeframe} candles={liveCandles} setup={reviewSetup} onReviewSetup={() => handleReviewSetup(reviewSetup)} />
    </div>,
    chat: <div className="space-y-3">
      <AIAssistantPanel symbol={selectedSymbol} timeframe={timeframe} candles={liveCandles} setup={reviewSetup} onReviewSetup={() => handleReviewSetup(reviewSetup)} />
      <OrderPanel providerSelection={activeProviderSelection} symbol={selectedSymbol} currentPrice={currentPrice} bidPrice={chartBidPrice} askPrice={chartAskPrice} accountBalance={resolvedAccountData.balance} accountFreeMargin={resolvedAccountData.freeMargin} accountCurrency={resolvedAccountData.currency} symbolSpec={symbolSpec} timeframe={timeframe} connection={derivOrderConnection} activePosition={selectedOpenPosition} onTradeClosed={(id) => { void handleClosePosition(id) }} onTradeLinesChange={setTradeLines} onTradeOpened={(order) => {
      setOpenPositions((current) => [order, ...current.filter((item) => item.id !== order.id)])
      setTradeHistory((current) => current.filter((item) => item.id !== order.id))
      setTradeLines([])
      setReviewSetup(null)
      pushToast(order.providerId === 'ctrader' && order.brokerProtectionConfirmed === false
         ? 'Trade opened, but cTrader did not confirm broker SL/TP. ' +
          (order.brokerProtectionError ? 'Details: ' + order.brokerProtectionError + ' ' : '') +
          'Verify the actual SL/TP in cTrader before relying on it.'
         : (activeProviderSelection?.providerId === 'ctrader' ? 'cTrader ' : 'Deriv ') + order.type + ' trade opened on ' + (order.chartTimeframe ?? timeframe) + '.')
    }} aiSetup={reviewSetup} />
    </div>,
    bot: <div className="space-y-4"><ErrorBoundary><SignalDeskPanel symbol={selectedSymbol} timeframe={timeframe} marketSource={signalBotMarketSource} onReviewSetup={handleReviewSetup} /></ErrorBoundary><ErrorBoundary><TradeBotPanel symbol={selectedSymbol} timeframe={timeframe} marketSource={signalBotMarketSource} accountBalance={resolvedAccountData.balance} accountCurrency={resolvedAccountData.currency} symbolSpec={tradeBotSymbolSpec} symbolSpecError={tradeBotSymbolSpecError} onReviewSetup={handleReviewSetup} /></ErrorBoundary></div>,
    liquidity: <LiquidityPanel key={selectedSymbol} symbol={selectedSymbol} price={currentPrice} precision={symbolSpec.pricePrecision} pipSize={symbolSpec.pipSize} candles={liveCandles} />,
    orders: <OrderPanel providerSelection={activeProviderSelection} symbol={selectedSymbol} currentPrice={currentPrice} bidPrice={chartBidPrice} askPrice={chartAskPrice} accountBalance={resolvedAccountData.balance} accountCurrency={resolvedAccountData.currency} symbolSpec={symbolSpec} timeframe={timeframe} connection={derivOrderConnection} activePosition={selectedOpenPosition} onTradeClosed={(id) => { void handleClosePosition(id) }} onTradeLinesChange={setTradeLines} onTradeOpened={(order) => {
      setOpenPositions((current) => [order, ...current.filter((item) => item.id !== order.id)])
      setTradeHistory((current) => current.filter((item) => item.id !== order.id))
      setTradeLines([])
      setReviewSetup(null)
      pushToast(order.providerId === 'ctrader' && order.brokerProtectionConfirmed === false
         ? 'Trade opened, but cTrader did not confirm broker SL/TP. ' +
          (order.brokerProtectionError ? 'Details: ' + order.brokerProtectionError + ' ' : '') +
          'Verify the actual SL/TP in cTrader before relying on it.'
         : (activeProviderSelection?.providerId === 'ctrader' ? 'cTrader ' : 'SHAFX ') + order.type + ' trade opened on ' + (order.chartTimeframe ?? timeframe) + '.')
    }} aiSetup={reviewSetup} />,

  }

  return <div className={'shafx-terminal-root min-h-[100svh] w-full min-w-0 overflow-x-hidden bg-shafx-bg text-shafx-text lg:flex lg:min-h-0 lg:h-[100svh] lg:flex-col lg:overflow-hidden' + (isLandscapeCompactViewport ? ' shafx-landscape-mode' : '')}>
    <TopNav symbol={selectedSymbol} price={currentPrice} pricePrecision={symbolSpec.pricePrecision} pairs={watchlist} onSelectPair={setSelectedSymbol} view={mobileTab === 'history' ? 'history' : mobileTab === 'account' || mobileTab === 'funds' ? 'account' : 'market'} />
    <main className="shafx-mobile-content flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-visible lg:flex-row lg:overflow-hidden">
      <WorkspaceRail tool={chartTool} onToolChange={setChartTool} dock={dock} onDockChange={setDock} />
      <aside className="shafx-watchlist-panel hidden w-[220px] min-w-[210px] max-w-[240px] flex-shrink-0 border-r border-shafx-border bg-[#090D13] lg:block">
        <Watchlist pairs={watchlist} selectedPair={selectedSymbol} onSelectPair={setSelectedSymbol} />
      </aside>

      <section className={`shafx-market-section ${showMarket ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col overflow-visible lg:overflow-hidden`}>
        <div className="lg:hidden"><WorkspaceStatus provider={activeProviderName} mode="broker" symbol={selectedSymbol} price={currentPrice} precision={symbolSpec.pricePrecision} live={liveMarketActive} /></div>
        <div className="lg:hidden border-b border-shafx-border bg-shafx-surface/70 px-2 py-2 sm:px-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-shafx-border bg-shafx-bg/80 px-3 py-3"><div className="flex items-center justify-between gap-2"><span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-shafx-textMuted">Account</span><span className={accountModeTone + " font-mono text-[8px] font-bold"}>{accountModeLabel}</span></div><div className="mt-1.5 font-mono text-base font-bold tabular-nums">{resolvedAccountData.currency} {resolvedAccountData.balance.toFixed(2)}</div></div>
            <div className="rounded-xl border border-shafx-border bg-shafx-bg/80 px-3 py-3"><div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-shafx-textMuted">Equity</div><div className="mt-1.5 font-mono text-base font-bold tabular-nums">{resolvedAccountData.currency} {resolvedAccountData.equity.toFixed(2)}</div><div className="mt-2 flex items-center justify-between gap-2 border-t border-shafx-border/80 pt-1.5"><span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-shafx-textMuted">Floating P/L</span><span className={'font-mono text-xs font-bold tabular-nums ' + (resolvedAccountData.floatingPL >= 0 ? 'text-shafx-success' : 'text-shafx-danger')}>{resolvedAccountData.floatingPL >= 0 ? '+' : ''}{resolvedAccountData.currency} {resolvedAccountData.floatingPL.toFixed(2)}</span></div></div>
            <div className="rounded-xl border border-shafx-border bg-shafx-bg/80 px-3 py-3"><div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-shafx-textMuted">{activeProviderSelection?.providerId === 'ctrader' ? 'cTrader connection' : 'Deriv connection'}</div><div className="mt-1.5 text-sm font-semibold">{liveMarketActive ? 'Live market stream' : 'Waiting for market'}</div><div className="text-[9px] text-shafx-textMuted">Auto reconnect enabled</div></div>
            <div className="rounded-xl border border-shafx-border bg-shafx-bg/80 px-3 py-3"><div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-shafx-textMuted">Free margin</div><div className="mt-1.5 font-mono text-base font-bold tabular-nums">{resolvedAccountData.currency} {resolvedAccountData.freeMargin.toFixed(2)}</div></div>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-visible">
          <div className="shafx-market-header flex min-h-10 flex-shrink-0 items-center justify-between gap-3 border-b border-shafx-border bg-[#0A0E14] px-3 sm:px-4 lg:min-h-12">
            <div className="flex min-w-0 items-center gap-2"><span className="truncate text-sm font-semibold">{selectedSymbol}</span><span className="font-mono text-xs font-semibold tabular-nums text-shafx-textMuted">{chartQuoteReady ? chartBidPrice.toFixed(symbolSpec.pricePrecision) : '—'}</span><span className={'rounded-full border px-2 py-0.5 text-[8px] font-semibold ' + (chartQuoteReady ? 'border-[#2F80FF]/30 bg-[#2F80FF]/10 text-[#9AC2FF]' : 'border-[#59616D] bg-[#151A21] text-[#AAB2BD]')}>{chartQuoteReady ? 'LIVE' : 'WAITING'}</span></div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button type="button" onClick={handleTrendToggle} aria-pressed={trendVisible} aria-label={trendVisible ? 'Hide support, resistance and liquidity' : 'Show support, resistance and liquidity'} className={trendVisible ? 'inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-shafx-accent/35 bg-shafx-accent/[0.09] px-2.5 text-[9px] font-bold text-shafx-accent transition sm:px-3' : 'inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-shafx-border bg-shafx-bg/80 px-2.5 text-[9px] font-bold text-shafx-textMuted transition sm:px-3'}>
                <TrendingUp className="h-3.5 w-3.5" />
                <span>Trend</span>
                <span className={trendVisible ? 'rounded-full bg-shafx-accent px-1.5 py-0.5 text-[7px] font-bold text-white' : 'rounded-full border border-shafx-border px-1.5 py-0.5 text-[7px] font-bold'}>{trendVisible ? 'ON' : 'OFF'}</span>
              </button>
              {activeProviderSelection?.providerId !== 'ctrader' ? liveControl : null}
            </div>
          </div>
           <div className="shafx-timeframe-bar flex min-h-11 flex-shrink-0 items-center gap-1 overflow-x-auto border-b border-shafx-border bg-[#0C1118] px-3 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-4">
             <span className="mr-1 hidden text-[8px] font-bold uppercase tracking-[0.16em] text-shafx-textMuted sm:inline">TIMEFRAME</span>
             {TIMEFRAMES.map((tf) => (
               <button key={tf} type="button" onClick={() => handleTimeframeChange(tf)} aria-pressed={timeframe === tf} className={'min-h-9 flex-shrink-0 rounded-md px-3 text-[9px] font-bold tracking-wide transition ' + (timeframe === tf ? 'bg-shafx-accent text-white shadow-md' : 'text-shafx-textMuted hover:bg-shafx-bg hover:text-shafx-text')}>
                 {tf}
               </button>
             ))}
             <span className="ml-auto hidden rounded-lg border border-shafx-border bg-shafx-bg px-2 py-1 font-mono text-[8px] text-shafx-textMuted md:inline">{timeframe}</span>
           </div>
           <MobileChartTools tool={chartTool} onToolChange={setChartTool} candleTheme={chartSettings.candleTheme} chartMode={chartSettings.chartMode} />
           <div
             className="shafx-chart-stage relative min-h-0 p-1 sm:p-2 lg:flex-1"
             data-shafx-open-position-count={liveOpenPositions.filter((position) => position.status === 'open').length}
             data-shafx-matched-open-position-count={chartOpenPositions.length}
             data-shafx-trade-line-count={combinedTradeLines.length}
             data-shafx-unmatched-position-symbols={openPositionsOnOtherSymbols.map((position) => position.symbol).join(',')}
           >
             {usingCTrader && openPositionsOnOtherSymbols.length > 0 && chartOpenPositions.length === 0 &&
               <div role="status" className="pointer-events-none absolute left-3 right-3 top-3 z-30 rounded-lg border border-[#F5B942]/35 bg-[#17130C]/95 px-3 py-2 text-[10px] leading-4 text-[#F5C75E] shadow-xl">
                 {openPositionsOnOtherSymbols.some((position) => isUnresolvedProviderSymbol(position.symbol))
                   ? 'cTrader reports an open position, but its instrument name could not be resolved yet. SHAFX is withholding entry / SL / TP lines rather than plotting them on the wrong chart.'
                   : 'An open cTrader position is on ' + [...new Set(openPositionsOnOtherSymbols.map((position) => position.symbol))].join(', ') + '. Select that instrument to view its entry / SL / TP lines.'}
               </div>}
             <CandlestickChart data={liveCandles} symbol={selectedSymbol} timeframe={timeframe} annotations={chartAnnotations} showStructuralOverlays={trendVisible} onVisibleBarCountChange={handleVisibleChartBarsChange} tradeLines={combinedTradeLines} tradeMarkers={chartTradeMarkers} bidPrice={chartBidPrice} askPrice={chartAskPrice} quoteReady={chartQuoteReady} toolMode={chartToolMode} pipSize={symbolSpec.pipSize} onToolNotice={pushToast} showGrid={chartSettings.showGrid} showPriceLabels={chartSettings.showPriceLabels} candleTheme={chartSettings.candleTheme} chartMode={chartSettings.chartMode} marketTimestamp={marketTimestamp} onTimeframeChange={handleTimeframeChange} replayMode={false} />
             {liveCandles.length === 0 && <div role="status" aria-live="polite" className="pointer-events-none absolute inset-0 z-40 flex min-h-[320px] items-center justify-center bg-shafx-bg/80 text-sm text-shafx-textMuted">Waiting for the live market stream…</div>}
           </div>
          <div className="shafx-landscape-secondary grid grid-cols-2 gap-2 border-t border-shafx-border bg-shafx-surface/55 p-2 sm:grid-cols-4">
            <button type="button" onClick={() => openMobileDock('insights')} className="rounded-xl border border-shafx-border bg-shafx-bg px-3 py-2 text-left hover:border-shafx-accent/30"><span className="text-[9px] text-shafx-textMuted">Structure</span><div className="mt-1 text-xs font-semibold">{marketAnalysis.bias} • {marketAnalysis.structure.type}</div></button>
            <button type="button" onClick={() => openMobileDock('liquidity')} className="rounded-xl border border-shafx-border bg-shafx-bg px-3 py-2 text-left hover:border-shafx-accent/30"><span className="text-[9px] text-shafx-textMuted">Liquidity</span><div className="mt-1 text-xs font-semibold">{marketAnalysis.liquidity.previousHigh?.toFixed(symbolSpec.pricePrecision) ?? '—'}</div></button>
            <button type="button" onClick={() => openMobileDock('orders')} className="rounded-xl border border-shafx-border bg-shafx-bg px-3 py-2 text-left hover:border-shafx-accent/30"><span className="text-[9px] text-shafx-textMuted">Account</span><div className="mt-1 text-xs font-semibold">{accountModeLabel}</div></button>
            <button type="button" onClick={() => { setMobileTab('account'); setMobileDockOpen(false) }} className="rounded-xl border border-shafx-border bg-shafx-bg px-3 py-2 text-left hover:border-shafx-accent/30"><span className="text-[9px] text-shafx-textMuted">Funding</span><div className="mt-1 text-xs font-semibold">Deposit • Withdraw</div></button>
          </div>
          <div className="shafx-trades-dock hidden h-36 flex-shrink-0 xl:h-40 border-t border-shafx-border bg-[#090D13] p-2 lg:block"><TradesPanel openPositions={liveOpenPositions} pendingOrders={pendingOrders} tradeHistory={tradeHistory} currentPrice={currentPrice} selectedSymbol={selectedSymbol} onClosePosition={(id) => { void handleClosePosition(id) }} onBulkClose={handleBulkClose} currency={resolvedAccountData.currency} botPaperHistory={botPaperHistory} /></div>
          {mobileDockOpen && <div id="mobile-market-workspace" className="border-t border-shafx-border bg-shafx-surface p-3 lg:hidden">
            <div className="mb-3 flex items-center justify-between gap-3"><div><div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-shafx-textMuted">Market workspace</div><div className="text-sm font-semibold">{dock === 'insights' ? 'Structure & AI' : dock === 'liquidity' ? 'Liquidity' : 'Deriv account'}</div></div><button type="button" onClick={() => setMobileDockOpen(false)} className="min-h-10 rounded-xl border border-shafx-border px-3 text-[10px] font-semibold text-shafx-textMuted">Close</button></div>
            {dockContent[dock === 'agent' || dock === 'research' ? 'insights' : dock]}
          </div>}
        </div>
      </section>

      {isCompactViewport && <aside className={showChat && !(mobileDockOpen && dock === 'orders') ? 'w-full flex-shrink-0 overflow-visible p-3 pb-4 lg:hidden' : 'hidden'}><div className="space-y-3"><AIAssistantPanel symbol={selectedSymbol} timeframe={timeframe} candles={liveCandles} setup={reviewSetup} onReviewSetup={() => handleReviewSetup(reviewSetup)} /><OrderPanel providerSelection={activeProviderSelection} symbol={selectedSymbol} currentPrice={currentPrice} bidPrice={chartBidPrice} askPrice={chartAskPrice} accountBalance={resolvedAccountData.balance} accountFreeMargin={resolvedAccountData.freeMargin} accountCurrency={resolvedAccountData.currency} symbolSpec={symbolSpec} timeframe={timeframe} connection={derivOrderConnection} activePosition={selectedOpenPosition} onTradeClosed={(id) => { void handleClosePosition(id) }} onTradeLinesChange={setTradeLines} onTradeOpened={(order) => {
      setOpenPositions((current) => [order, ...current.filter((item) => item.id !== order.id)])
      setTradeHistory((current) => current.filter((item) => item.id !== order.id))
      setTradeLines([])
      setReviewSetup(null)
      pushToast(order.providerId === 'ctrader' && order.brokerProtectionConfirmed === false
         ? 'Trade opened, but cTrader did not confirm broker SL/TP. ' +
          (order.brokerProtectionError ? 'Details: ' + order.brokerProtectionError + ' ' : '') +
          'Verify the actual SL/TP in cTrader before relying on it.'
         : (activeProviderSelection?.providerId === 'ctrader' ? 'cTrader ' : 'SHAFX ') + order.type + ' trade opened on ' + (order.chartTimeframe ?? timeframe) + '.')
    }} aiSetup={reviewSetup} /></div></aside>}
      <aside className={showBot ? 'w-full flex-shrink-0 overflow-visible p-3 pb-4 lg:hidden' : 'hidden'}><div className="space-y-4"><ErrorBoundary><SignalDeskPanel symbol={selectedSymbol} timeframe={timeframe} marketSource={signalBotMarketSource} onReviewSetup={handleReviewSetup} /></ErrorBoundary><ErrorBoundary><TradeBotPanel symbol={selectedSymbol} timeframe={timeframe} marketSource={signalBotMarketSource} accountBalance={resolvedAccountData.balance} accountCurrency={resolvedAccountData.currency} symbolSpec={tradeBotSymbolSpec} symbolSpecError={tradeBotSymbolSpecError} onReviewSetup={handleReviewSetup} /></ErrorBoundary></div></aside>
      <aside className={showHistory ? 'w-full flex-shrink-0 overflow-visible p-3 pb-4 lg:hidden' : 'hidden'}><div className="h-[calc(100svh-92px)] min-h-[520px]"><TradesPanel defaultTab="history" openPositions={liveOpenPositions} pendingOrders={pendingOrders} tradeHistory={tradeHistory} currentPrice={currentPrice} selectedSymbol={selectedSymbol} onClosePosition={(id) => { void handleClosePosition(id) }} onBulkClose={handleBulkClose} currency={resolvedAccountData.currency} botPaperHistory={botPaperHistory} /></div></aside>
      <aside className={showFunds ? 'w-full flex-shrink-0 overflow-visible p-3 pb-4 lg:hidden' : 'hidden'}><div className="space-y-3"><DerivCashierLinks /></div></aside>
      <aside className={showAccount ? 'w-full flex-shrink-0 overflow-visible p-3 pb-4 lg:hidden' : 'hidden'}><div className="space-y-3"><AccountPanel account={resolvedAccountData} activeProviderSelection={activeProviderSelection} /></div></aside>

       {!isCompactViewport && <aside className="shafx-desktop-right-panel hidden w-[320px] min-w-[300px] max-w-[340px] flex-shrink-0 flex-col overflow-hidden border-l border-shafx-border bg-[#090D13] lg:flex xl:w-[340px] 2xl:w-[360px]">
        <div className="shafx-right-panel-header flex h-12 flex-shrink-0 items-center justify-between border-b border-shafx-border px-4"><div><div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-shafx-textMuted">{dock === 'orders' ? 'TRADE' : 'WORKSPACE'}</div><div className="text-xs font-semibold">{dock === 'insights' ? 'Market intelligence' : dock === 'chat' ? 'Chat & Order Ticket' : dock === 'bot' ? 'SHAFX Bots' : dock === 'liquidity' ? 'Liquidity & depth' : 'Trade ticket'}</div></div></div>
        <div className="shafx-right-panel-content min-h-0 flex-1 overflow-y-auto p-4">{dockContent[dock === 'agent' || dock === 'research' ? 'insights' : dock]}</div>
      </aside>}
    </main>
    <MobileNav activeTab={mobileTab} onChange={setMobileTab} />
    <footer className="hidden h-7 items-center justify-between border-t border-shafx-border bg-[#080B10] px-4 text-[9px] text-shafx-textMuted lg:flex"><span>SHAFX • {activeProviderName} workspace • {accountModeLabel}</span><span>{liveMarketActive ? (activeProviderSelection?.providerId === 'ctrader' ? 'cTrader market stream active' : 'Deriv market stream active') : 'Connecting to market'}</span></footer>
    <Toast toast={toast} onDismiss={dismissToast} />
  </div>
}

const App: React.FC = () => <ErrorBoundary><TerminalProvider><TerminalContent /></TerminalProvider></ErrorBoundary>

export default App
