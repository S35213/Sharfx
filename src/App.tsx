import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

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
import { buildStructuralChartAnnotations } from './components/chart/buildAIChartAnnotations'
import { Watchlist } from './components/watchlist/Watchlist'
import { MarketAnalysisPanel } from './components/analysis/MarketAnalysis'
import { AIAssistantPanel } from './components/ai/AIAssistantPanel'
import { SignalDeskPanel } from './components/ai/SignalDeskPanel'
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
import { normalizeProviderSymbol } from './lib/normalizeProviderSymbol'
import type { SetupCandidate } from './engine/setup/types'
import { mockWatchlist } from './data/mock/watchlist'
import { fetchDerivActiveForexSymbols, fetchDerivMultiTimeframeCandles, subscribeDerivForexQuotes } from './data/deriv/DerivPublicMarketFeed'
import { applyCTraderQuoteToCandles, cTraderQuoteBucket, fetchCTraderHistoricalCandles, isCTraderQuoteBucketCurrent, mergeCTraderHistoricalAndLiveCandles, subscribeCTraderLiveQuote } from './data/ctrader/CTraderLiveQuote'

const providerPositionToTrade = (position: ProviderPosition): TradeOrder => {
  const metadata = position.metadata || {}
  const raw = (metadata.raw && typeof metadata.raw === 'object') ? metadata.raw as Record<string, unknown> : {}
  const entryPrice = Number(position.entryPrice ?? 0)
  const currentPrice = Number(position.currentPrice ?? 0)

  if (metadata.provider === 'ctrader') {
    const lots = Number(position.quantity)
    const stopLoss = Number(position.stopLoss)
    const takeProfit = Number(position.takeProfit)
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
      stopLoss: Number.isFinite(stopLoss) && stopLoss > 0 ? stopLoss : null,
      takeProfit: Number.isFinite(takeProfit) && takeProfit > 0 ? takeProfit : null,
      plannedStopLossPrice: Number.isFinite(stopLoss) && stopLoss > 0 ? stopLoss : null,
      plannedTakeProfitPrice: Number.isFinite(takeProfit) && takeProfit > 0 ? takeProfit : null,
      riskPercent: 0,
      riskAmount: 0,
      rewardAmount: 0,
      riskRewardRatio: 0,
      status: 'open',
      openTime: typeof metadata.openTimestamp === 'string' && metadata.openTimestamp
        ? new Date(Number(metadata.openTimestamp)).toISOString()
        : new Date().toISOString(),
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
  const [openPositions, setOpenPositions] = useState<TradeOrder[]>([])
  const [pendingOrders] = useState<TradeOrder[]>([])
  const [tradeHistory, setTradeHistory] = useState<TradeOrder[]>([])
  const [botPaperHistory, setBotPaperHistory] = useState<BotPaperTrade[]>(() => readBotPaperHistory())
  const [reviewSetup, setReviewSetup] = useState<SetupCandidate | null>(null)
  const [liveMarketActive, setLiveMarketActive] = useState(false)
  const [chartSettings, setChartSettings] = useState<ChartWorkspaceSettings>(() => readChartWorkspaceSettings())
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [tradeLines, setTradeLines] = useState<ChartAnnotation[]>([])
  const [chartTool, setChartTool] = useState<WorkspaceTool>('cursor')
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
  const latestCTraderPriceRef = useRef<number | null>(null)
  const liveQuoteIdentityRef = useRef<string | null>(null)
  const toastId = useRef(0)
  const lastStreamToastAt = useRef(0)
  const lastStreamToastText = useRef('')

  // Keep the newest rendered candle synchronously available to the broker
  // quote callback, so it can reject an old quote before moving the price tags.
  useLayoutEffect(() => {
    liveCandlesRef.current = liveCandles
  }, [liveCandles])

  useEffect(() => {
    // Invalidate the last quote when the chart identity changes. The rendered
    // values are gated by this identity, avoiding stale tags without an extra
    // setState render from inside an effect.
    liveQuoteIdentityRef.current = null
    latestCTraderPriceRef.current = null
  }, [selectedSymbol, timeframe, activeProviderSelection?.providerId])

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
    setTimeframe(nextTimeframe)

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
    setLiveBidPrice(0)
    setLiveAskPrice(0)
    setLiveQuoteIdentity(null)
    latestCTraderPriceRef.current = null
    liveQuoteIdentityRef.current = null
    const last = nextCandles[nextCandles.length - 1]
    setCurrentPrice(last?.close ?? 0)
    setMarketTimestamp(last ? Math.floor(last.time / 1000) : 0)
  }, [activeProviderSelection?.providerId, setTimeframe])

  const handleBotPaperRoundClosed = useCallback((trade: BotPaperTrade): void => {
    setBotPaperHistory((current) => [trade, ...current.filter((item) => item.id !== trade.id)].slice(0, 200))
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(BOT_PAPER_HISTORY_STORAGE_KEY, JSON.stringify(botPaperHistory))
  }, [botPaperHistory])
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
  }, [selectedSymbol, activeProviderSelection?.providerId])

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
        if (cancelled || !response.ok || !payload.ok || !Array.isArray(payload.history)) return
        setTradeHistory(payload.history)
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
                const previous = current.find((item) => item.id === trade.id)
                const nextTrade: TradeOrder = {
                  ...trade,
                  chartTimeframe: previous?.chartTimeframe ?? timeframe,
                  plannedStopLossPrice: previous?.plannedStopLossPrice ?? null,
                  plannedTakeProfitPrice: previous?.plannedTakeProfitPrice ?? null,
                  commission: previous?.commission,
                  payout: previous?.payout,
                }
                const next = current.filter((item) => item.id !== trade.id)
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
    setLiveMarketActive(false)
    const cachedLast = cachedCandles[cachedCandles.length - 1]
    if (cachedLast) {
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

  useEffect(() => {
    const selection = activeProviderSelection
    if (selection?.providerId !== 'ctrader' || !selection.connectionId || !selection.accountId) return

    // Old quote requests can finish after cleanup. Capture identity and reject
    // callbacks that no longer belong to the active symbol/timeframe.
    let cancelled = false
    const subscriptionSymbol = selectedSymbol
    const subscriptionTimeframe = timeframe
    const unsubscribe = subscribeCTraderLiveQuote({
      connectionId: selection.connectionId,
      accountId: selection.accountId,
      environment: selection.environment === 'live' ? 'live' : 'demo',
      symbol: subscriptionSymbol,
    }, (nextQuote) => {
      if (
        cancelled ||
        selectedSymbolRef.current !== subscriptionSymbol ||
        timeframeRef.current !== subscriptionTimeframe
      ) return

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
      const bucket = cTraderQuoteBucket(timestamp, subscriptionTimeframe)

      // Validate the quote against the displayed timeframe's latest candle BEFORE
      // changing currentPrice or BUY/SELL. Previously a stale bucket moved those
      // labels, while the candle updater below discarded the same tick.
      const currentCandles = normalizeMarketCandles(liveCandlesRef.current)
      const last = currentCandles[currentCandles.length - 1]
      if (!isCTraderQuoteBucketCurrent(bucket, last?.time)) return

      // Candle OHLC is bid-based. This shared helper preserves the candle open,
      // extends its wick, and updates close on every accepted tick so Lightweight
      // Charts can switch the forming body between up/down colors when close crosses open.
      const nextCandles = applyCTraderQuoteToCandles(currentCandles, bucket, price)
      if (nextCandles.length > 0) {
        // Commit the candle and the quote markers from the same accepted tick.
        const cTraderKey = [
          String(selection.connectionId),
          String(selection.accountId),
          selection.environment,
          subscriptionSymbol,
          subscriptionTimeframe,
        ].join(':')
        liveCandlesRef.current = nextCandles
        cTraderCandleCacheRef.current[cTraderKey] = nextCandles
        candleCacheRef.current[subscriptionSymbol + ':' + subscriptionTimeframe] = nextCandles
        setLiveCandles(nextCandles)
      }

      latestCTraderPriceRef.current = price
      const quoteIdentity = [
        subscriptionSymbol,
        subscriptionTimeframe,
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
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [activeProviderSelection?.accountId, activeProviderSelection?.connectionId, activeProviderSelection?.environment, activeProviderSelection?.providerId, selectedSymbol, timeframe])

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
    timeframe,
    'ctrader',
    String(activeProviderSelection?.connectionId ?? ''),
    String(activeProviderSelection?.accountId ?? ''),
    activeProviderSelection?.environment === 'live' ? 'live' : 'demo',
  ].join(':')
  const cTraderQuoteMatchesChart = usingCTrader &&
    liveQuoteIdentity === selectedCTraderQuoteIdentity
  const latestCandleClose = Number(liveCandles[liveCandles.length - 1]?.close ?? 0)
  const chartBidRaw = usingCTrader
    ? cTraderQuoteMatchesChart && liveBidPrice > 0 ? liveBidPrice : latestCandleClose
    : Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : latestCandleClose
  const chartBidPrice = Number(chartBidRaw.toFixed(symbolSpec.pricePrecision))
  const chartSpread = Math.max(symbolSpec.pipSize * 0.2, symbolSpec.pipSize / 10)
  const chartAskPrice = usingCTrader
    ? cTraderQuoteMatchesChart && liveAskPrice > 0
      ? Number(liveAskPrice.toFixed(symbolSpec.pricePrecision))
      : chartBidPrice > 0
        ? (() => {
          const chartAskCandidate = Number((chartBidPrice + chartSpread).toFixed(symbolSpec.pricePrecision))
          return chartAskCandidate > chartBidPrice
            ? chartAskCandidate
            : Number((chartBidPrice + symbolSpec.pipSize).toFixed(symbolSpec.pricePrecision))
        })()
        : 0
    : (() => {
      const chartAskCandidate = Number((chartBidPrice + chartSpread).toFixed(symbolSpec.pricePrecision))
      return chartAskCandidate > chartBidPrice
        ? chartAskCandidate
        : Number((chartBidPrice + symbolSpec.pipSize).toFixed(symbolSpec.pricePrecision))
    })()

  const structureBarTime = liveCandles.length ? Number(liveCandles[liveCandles.length - 1]?.time ?? 0) : 0
  const chartAnnotations = useMemo(() => buildStructuralChartAnnotations(selectedSymbol, liveCandles, timeframe)
    .map((annotation) => ({ ...annotation, id: 'live-' + timeframe + '-' + annotation.id })), [selectedSymbol, timeframe, structureBarTime])

  const selectedOpenPosition = useMemo(
    () => openPositions.find((position) => position.symbol === selectedSymbol) ?? null,
    [openPositions, selectedSymbol],
  )

  const brokerPositionTradeLines = useMemo<ChartAnnotation[]>(() => {
    const position = selectedOpenPosition
    if (!position || !Number.isFinite(position.entryPrice) || position.entryPrice <= 0) return []

    const entryColor = position.type === 'BUY' ? '#22D3A5' : '#FF5C75'
    const lines: ChartAnnotation[] = [
      {
        id: position.id + '-entry',
        price: position.entryPrice,
        label: position.type + ' ENTRY',
        color: entryColor,
        lineWidth: 2,
      },
    ]

    const stopLossPrice = Number(position.plannedStopLossPrice)
    if (Number.isFinite(stopLossPrice) && stopLossPrice > 0) {
      lines.push({
        id: position.id + '-sl',
        price: stopLossPrice,
        label: 'STOP LOSS',
        color: '#FF5C75',
        lineWidth: 2,
      })
    }

    const takeProfitPrice = Number(position.plannedTakeProfitPrice)
    if (Number.isFinite(takeProfitPrice) && takeProfitPrice > 0) {
      lines.push({
        id: position.id + '-tp',
        price: takeProfitPrice,
        label: 'TAKE PROFIT',
        color: '#22D3A5',
        lineWidth: 2,
      })
    }

    return lines
  }, [selectedOpenPosition])

  const combinedTradeLines = useMemo(
    () => [
      ...tradeLines.filter((line) => !brokerPositionTradeLines.some((broker) => broker.id === line.id)),
      ...brokerPositionTradeLines,
    ],
    [brokerPositionTradeLines, tradeLines],
  )

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
    const candidates = openPositions
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
  }, [handleClosePosition, openPositions, pushToast])

  // Deriv's authenticated account stream is the source of truth for
  // balance, equity, free margin and floating P/L. Do not overwrite broker
  // accounting with the public chart price.
  const resolvedAccountData = accountData ?? {
    balance: 0,
    equity: 0,
    usedMargin: 0,
    freeMargin: 0,
    floatingPL: 0,
    currency: 'USD',
  }

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
      pushToast((activeProviderSelection?.providerId === 'ctrader' ? 'cTrader ' : 'Deriv ') + order.type + ' trade opened on ' + (order.chartTimeframe ?? timeframe) + '.')
    }} aiSetup={reviewSetup} />
    </div>,
    bot: <SignalDeskPanel
      symbol={selectedSymbol}
      timeframe={timeframe}
      candles={liveCandles}
      currentPrice={currentPrice}
      analysis={marketAnalysis}
      setup={reviewSetup}
      accountBalance={resolvedAccountData.balance}
      accountCurrency={resolvedAccountData.currency}
      connected={Boolean(derivOrderConnection)}
      onReviewSetup={handleReviewSetup}
      onPaperRoundClosed={handleBotPaperRoundClosed}
    />,
    liquidity: <LiquidityPanel key={selectedSymbol} symbol={selectedSymbol} price={currentPrice} precision={symbolSpec.pricePrecision} pipSize={symbolSpec.pipSize} candles={liveCandles} />,
    orders: <OrderPanel providerSelection={activeProviderSelection} symbol={selectedSymbol} currentPrice={currentPrice} bidPrice={chartBidPrice} askPrice={chartAskPrice} accountBalance={resolvedAccountData.balance} accountCurrency={resolvedAccountData.currency} symbolSpec={symbolSpec} timeframe={timeframe} connection={derivOrderConnection} activePosition={selectedOpenPosition} onTradeClosed={(id) => { void handleClosePosition(id) }} onTradeLinesChange={setTradeLines} onTradeOpened={(order) => {
      setOpenPositions((current) => [order, ...current.filter((item) => item.id !== order.id)])
      setTradeHistory((current) => current.filter((item) => item.id !== order.id))
      setTradeLines([])
      setReviewSetup(null)
      pushToast((activeProviderSelection?.providerId === 'ctrader' ? 'cTrader ' : 'SHAFX ') + order.type + ' trade opened on ' + (order.chartTimeframe ?? timeframe) + '.')
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
            <div className="rounded-xl border border-shafx-border bg-shafx-bg/80 px-3 py-2"><div className="flex items-center justify-between gap-2"><span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-shafx-textMuted">Account</span><span className={accountModeTone + " font-mono text-[8px] font-bold"}>{accountModeLabel}</span></div><div className="mt-1 font-mono text-sm font-bold tabular-nums">{resolvedAccountData.currency} {resolvedAccountData.balance.toFixed(2)}</div></div>
            <div className="rounded-xl border border-shafx-border bg-shafx-bg/80 px-3 py-2"><div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-shafx-textMuted">Equity</div><div className="mt-1 font-mono text-sm font-bold tabular-nums">{resolvedAccountData.currency} {resolvedAccountData.equity.toFixed(4)}</div><div className={resolvedAccountData.floatingPL >= 0 ? 'text-[8px] text-shafx-success' : 'text-[8px] text-shafx-danger'}>{resolvedAccountData.floatingPL >= 0 ? '+' : ''}{resolvedAccountData.floatingPL.toFixed(4)} floating</div></div>
            <div className="rounded-xl border border-shafx-border bg-shafx-bg/80 px-3 py-2"><div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-shafx-textMuted">{activeProviderSelection?.providerId === 'ctrader' ? 'cTrader connection' : 'Deriv connection'}</div><div className="mt-1 text-xs font-semibold">{liveMarketActive ? 'Live market stream' : 'Connecting'}</div><div className="text-[8px] text-shafx-textMuted">Auto reconnect enabled</div></div>
            <div className="rounded-xl border border-shafx-border bg-shafx-bg/80 px-3 py-2"><div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-shafx-textMuted">Free margin</div><div className="mt-1 font-mono text-sm font-bold tabular-nums">{resolvedAccountData.currency} {resolvedAccountData.freeMargin.toFixed(4)}</div></div>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-visible">
          <div className="shafx-market-header flex min-h-10 flex-shrink-0 items-center justify-between gap-3 border-b border-shafx-border bg-[#0A0E14] px-3 sm:px-4 lg:min-h-12">
            <div className="flex min-w-0 items-center gap-2"><span className="truncate text-sm font-semibold">{selectedSymbol}</span><span className="font-mono text-xs font-semibold tabular-nums text-shafx-textMuted">{Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice.toFixed(symbolSpec.pricePrecision) : '—'}</span><span className={'rounded-full border px-2 py-0.5 text-[8px] font-semibold ' + (liveMarketActive ? 'border-shafx-success/25 bg-shafx-success/5 text-shafx-success' : 'border-shafx-warning/25 bg-shafx-warning/5 text-shafx-warning')}>{liveMarketActive ? 'LIVE' : 'CONNECTING'}</span></div>
            <div className="flex items-center gap-1.5">{liveControl}</div>
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
           <div className="shafx-chart-stage relative min-h-0 p-1 sm:p-2 lg:flex-1">
             <CandlestickChart data={liveCandles} symbol={selectedSymbol} timeframe={timeframe} annotations={chartAnnotations} tradeLines={combinedTradeLines} bidPrice={chartBidPrice} askPrice={chartAskPrice} toolMode={chartToolMode} pipSize={symbolSpec.pipSize} onToolNotice={pushToast} showGrid={chartSettings.showGrid} showPriceLabels={chartSettings.showPriceLabels} candleTheme={chartSettings.candleTheme} chartMode={chartSettings.chartMode} marketTimestamp={marketTimestamp} onTimeframeChange={handleTimeframeChange} replayMode={false} />
             {liveCandles.length === 0 && <div role="status" aria-live="polite" className="pointer-events-none absolute inset-0 z-40 flex min-h-[320px] items-center justify-center bg-shafx-bg/80 text-sm text-shafx-textMuted">Waiting for the live market stream…</div>}
           </div>
          <div className="shafx-landscape-secondary grid grid-cols-2 gap-2 border-t border-shafx-border bg-shafx-surface/55 p-2 sm:grid-cols-4">
            <button type="button" onClick={() => openMobileDock('insights')} className="rounded-xl border border-shafx-border bg-shafx-bg px-3 py-2 text-left hover:border-shafx-accent/30"><span className="text-[9px] text-shafx-textMuted">Structure</span><div className="mt-1 text-xs font-semibold">{marketAnalysis.bias} • {marketAnalysis.structure.type}</div></button>
            <button type="button" onClick={() => openMobileDock('liquidity')} className="rounded-xl border border-shafx-border bg-shafx-bg px-3 py-2 text-left hover:border-shafx-accent/30"><span className="text-[9px] text-shafx-textMuted">Liquidity</span><div className="mt-1 text-xs font-semibold">{marketAnalysis.liquidity.previousHigh?.toFixed(symbolSpec.pricePrecision) ?? '—'}</div></button>
            <button type="button" onClick={() => openMobileDock('orders')} className="rounded-xl border border-shafx-border bg-shafx-bg px-3 py-2 text-left hover:border-shafx-accent/30"><span className="text-[9px] text-shafx-textMuted">Account</span><div className="mt-1 text-xs font-semibold">{accountModeLabel}</div></button>
            <button type="button" onClick={() => { setMobileTab('account'); setMobileDockOpen(false) }} className="rounded-xl border border-shafx-border bg-shafx-bg px-3 py-2 text-left hover:border-shafx-accent/30"><span className="text-[9px] text-shafx-textMuted">Funding</span><div className="mt-1 text-xs font-semibold">Deposit • Withdraw</div></button>
          </div>
          <div className="shafx-trades-dock hidden h-36 flex-shrink-0 xl:h-40 border-t border-shafx-border bg-[#090D13] p-2 lg:block"><TradesPanel openPositions={openPositions} pendingOrders={pendingOrders} tradeHistory={tradeHistory} currentPrice={currentPrice} selectedSymbol={selectedSymbol} onClosePosition={(id) => { void handleClosePosition(id) }} onBulkClose={handleBulkClose} currency={resolvedAccountData.currency} botPaperHistory={botPaperHistory} /></div>
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
      pushToast((activeProviderSelection?.providerId === 'ctrader' ? 'cTrader ' : 'SHAFX ') + order.type + ' trade opened on ' + (order.chartTimeframe ?? timeframe) + '.')
    }} aiSetup={reviewSetup} /></div></aside>}
      <aside className={showBot ? 'w-full flex-shrink-0 overflow-visible p-3 pb-4 lg:hidden' : 'hidden'}><SignalDeskPanel symbol={selectedSymbol} timeframe={timeframe} candles={liveCandles} currentPrice={currentPrice} analysis={marketAnalysis} setup={reviewSetup} accountBalance={resolvedAccountData.balance} accountCurrency={resolvedAccountData.currency} connected={Boolean(derivOrderConnection)} onReviewSetup={handleReviewSetup} onPaperRoundClosed={handleBotPaperRoundClosed} /></aside>
      <aside className={showHistory ? 'w-full flex-shrink-0 overflow-visible p-3 pb-4 lg:hidden' : 'hidden'}><div className="h-[calc(100svh-92px)] min-h-[520px]"><TradesPanel defaultTab="history" openPositions={openPositions} pendingOrders={pendingOrders} tradeHistory={tradeHistory} currentPrice={currentPrice} selectedSymbol={selectedSymbol} onClosePosition={(id) => { void handleClosePosition(id) }} onBulkClose={handleBulkClose} currency={resolvedAccountData.currency} botPaperHistory={botPaperHistory} /></div></aside>
      <aside className={showFunds ? 'w-full flex-shrink-0 overflow-visible p-3 pb-4 lg:hidden' : 'hidden'}><div className="space-y-3"><DerivCashierLinks /></div></aside>
      <aside className={showAccount ? 'w-full flex-shrink-0 overflow-visible p-3 pb-4 lg:hidden' : 'hidden'}><div className="space-y-3"><AccountPanel account={resolvedAccountData} activeProviderSelection={activeProviderSelection} /></div></aside>

       {!isCompactViewport && <aside className="shafx-desktop-right-panel hidden w-[320px] min-w-[300px] max-w-[340px] flex-shrink-0 flex-col overflow-hidden border-l border-shafx-border bg-[#090D13] lg:flex xl:w-[340px] 2xl:w-[360px]">
        <div className="shafx-right-panel-header flex h-12 flex-shrink-0 items-center justify-between border-b border-shafx-border px-4"><div><div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-shafx-textMuted">{dock === 'orders' ? 'TRADE' : 'WORKSPACE'}</div><div className="text-xs font-semibold">{dock === 'insights' ? 'Market intelligence' : dock === 'chat' ? 'Chat & Order Ticket' : dock === 'bot' ? 'SHAFX Signal Desk' : dock === 'liquidity' ? 'Liquidity & depth' : 'Trade ticket'}</div></div></div>
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
