import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, PanelRight, SlidersHorizontal } from 'lucide-react'
import { TerminalProvider, useTerminal } from './app/TerminalContext'
import { ErrorBoundary } from './app/ErrorBoundary'
import { useAuth } from './app/AuthContext'
import { TopNav } from './components/layout/TopNav'
import { MobileNav, type MobileNavTab } from './components/layout/MobileNav'
import { WorkspaceRail, type WorkspaceDock, type WorkspaceTool } from './components/layout/WorkspaceRail'
import { MobileChartTools } from './components/layout/MobileChartTools'
import { WorkspaceStatus } from './components/layout/WorkspaceStatus'
import { ProviderLiveControl } from './components/market/ProviderLiveControl'
import { DerivCashierLinks } from './components/market/DerivCashierLinks'
import { LiquidityPanel } from './components/market/LiquidityPanel'
import { ProviderCapabilityPanel } from './components/market/ProviderCapabilityPanel'
import { FXMoveMatrix } from './components/market/FXMoveMatrix'
import { CandlestickChart, type ChartAnnotation, type ChartToolMode } from './components/chart/CandlestickChart'
import { analyzeCurrentSetup, buildStructuralChartAnnotations } from './components/chart/buildAIChartAnnotations'
import { Watchlist } from './components/watchlist/Watchlist'
import { MarketAnalysisPanel } from './components/analysis/MarketAnalysis'
import { AIAssistantPanel } from './components/ai/AIAssistantPanel'
import { TradingAgentPanel } from './components/ai/TradingAgentPanel'
import type { SetupCandidate } from './engine/setup/types'
import { BacktestPanel } from './components/backtest/BacktestPanel'
import { ReplayPanel } from './components/backtest/ReplayPanel'
import { PerformancePanel } from './components/performance/PerformancePanel'
import { TradingJournalPanel } from './components/performance/TradingJournalPanel'
import { OrderPanel } from './components/order/OrderPanel'
import { AccountPanel } from './components/account/AccountPanel'
import { TradesPanel } from './components/trades/TradesPanel'
import { Toast, type ToastMessage } from './components/common/Toast'
import { SimulationPulse } from './components/activity/SimulationPulse'
import { SimulationFlowChart } from './components/activity/SimulationFlowChart'
import { CHART_SETTINGS_EVENT, readChartWorkspaceSettings, type ChartWorkspaceSettings } from './app/chartSettings'
import { marketDataSource } from './data/createMarketDataSource'
import { ProviderAccountStreamManager, providerAccountStreamKey } from './data/provider/ProviderAccountStreamManager'
import { chooseDefaultProviderSelection, getProviderConnections, getStoredProviderSelection, subscribeToProviderSelection, type ActiveProviderSelection } from './data/provider/providerConnections'
import { getConversionRate } from './data/mock/symbols'
import { applyDemoProfit, setDemoOpenPositions, setDemoTradeHistory } from './engine/simulator/accountStore'
import { submitSimulatedOrder } from './engine/simulator/submitSimulatedOrder'
import { closeSimulatedPosition, markSimulatedPosition } from './engine/simulator/positionManager'
import { SimulatorRealtimeMarketEngine } from './engine/simulator/realtimeMarketEngine'
import { providerCatalog } from './integrations/catalog'
import type { AccountData, AIAnalysis, MarketAnalysis, MarketPair, OHLCV, SimulatedOrderDraft, SymbolSpec, TradeOrder } from './types'

const isBrokerMode = (): boolean => typeof window !== 'undefined' && window.sessionStorage.getItem('shafx-trading-mode') === 'broker'
const isSimulatorMode = (): boolean => !isBrokerMode()
const BOT_AUTORUN_KEY = 'shafx-bot-autostart'
const BOT_ORDER_IDS_KEY = 'shafx-bot-order-ids'
const readStoredBotOrderIds = (): string[] => {
  if (typeof window === 'undefined') return []
  try {
    const value = JSON.parse(window.localStorage.getItem(BOT_ORDER_IDS_KEY) ?? '[]')
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

const TerminalContent: React.FC = () => {
  const { selectedSymbol, setSelectedSymbol, timeframe, setTimeframe } = useTerminal()
  const { user } = useAuth()
  const [activeProviderSelection, setActiveProviderSelection] = useState<ActiveProviderSelection | null>(() => getStoredProviderSelection())
  const [currentPrice, setCurrentPrice] = useState(1.08542)
  const [simulatedPrice, setSimulatedPrice] = useState(1.08542)
  const [marketTimestamp, setMarketTimestamp] = useState<number>(0)
  const [candles, setCandles] = useState<OHLCV[]>([])
  const [liveCandles, setLiveCandles] = useState<OHLCV[]>([])
  const [simulatedCandles, setSimulatedCandles] = useState<OHLCV[]>([])
  const [simulatedM1Candles, setSimulatedM1Candles] = useState<OHLCV[]>([])
  const [reviewedSetup, setReviewedSetup] = useState<SetupCandidate | null>(null)
  useEffect(() => { setReviewedSetup(null) }, [selectedSymbol])
  const simulatedPriceRef = useRef(1.08542)
  const simulatedEngineRef = useRef<SimulatorRealtimeMarketEngine | null>(null)
  const simulatedEngineSymbolRef = useRef<string | null>(null)
  const [liveMarketActive, setLiveMarketActive] = useState(false)
  const [replayCount, setReplayCount] = useState(0)
  const [mobileTab, setMobileTab] = useState<MobileNavTab>('market')
  const [mobileDockOpen, setMobileDockOpen] = useState(false)
  const [accountData, setAccountData] = useState<AccountData | null>(null)
  const [symbolSpec, setSymbolSpec] = useState<SymbolSpec | null>(null)
  const [watchlist, setWatchlist] = useState<MarketPair[]>([])
  const [marketAnalysis, setMarketAnalysis] = useState<MarketAnalysis | null>(null)
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null)
  const [openPositions, setOpenPositions] = useState<TradeOrder[]>([])
  const [pendingOrders, setPendingOrders] = useState<TradeOrder[]>([])
  const [tradeHistory, setTradeHistory] = useState<TradeOrder[]>([])
  const [botOrderIds, setBotOrderIds] = useState<string[]>(readStoredBotOrderIds)
  const [botRunning, setBotRunning] = useState(false)
  const [chartSettings, setChartSettings] = useState<ChartWorkspaceSettings>(() => readChartWorkspaceSettings())
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [chartTool, setChartTool] = useState<WorkspaceTool>('cursor')
  const [dock, setDock] = useState<WorkspaceDock>('insights')

  const accountInitialized = useRef(false)
  const simulatorInitialized = useRef(false)
  const accountStreamManager = useRef(new ProviderAccountStreamManager())
  const symbolSpecCache = useRef<Record<string, SymbolSpec>>({})
  const toastId = useRef(0)
  const openPositionsRef = useRef<TradeOrder[]>([])
  const positionRefreshTimer = useRef<number | null>(null)
  const positionRefreshInFlight = useRef(false)
  const positionRefreshQueued = useRef(false)
  const currentPriceForPositionsRef = useRef(currentPrice)
  const selectedSymbolForPositionsRef = useRef(selectedSymbol)
  const symbolSpecForPositionsRef = useRef<SymbolSpec | null>(symbolSpec)
  const watchlistForPositionsRef = useRef<MarketPair[]>([])
  const accountCurrencyForPositionsRef = useRef('USD')

  const pushToast = useCallback((text: string) => {
    toastId.current += 1
    setToast({ id: toastId.current, text })
  }, [])

  useEffect(() => {
    const onChartSettings = (event: Event): void => {
      const detail = (event as CustomEvent<ChartWorkspaceSettings>).detail
      if (detail) setChartSettings(detail)
    }
    window.addEventListener(CHART_SETTINGS_EVENT, onChartSettings)
    return () => window.removeEventListener(CHART_SETTINGS_EVENT, onChartSettings)
  }, [])

  useEffect(() => {
    let cancelled = false
    const refreshSelection = async (): Promise<void> => {
      try {
        const connections = await getProviderConnections()
        const selected = chooseDefaultProviderSelection(connections)
        if (!cancelled) setActiveProviderSelection(selected)
      } catch {
        if (!cancelled) setActiveProviderSelection(getStoredProviderSelection())
      }
    }
    void refreshSelection()
    const unsubscribe = subscribeToProviderSelection(() => { void refreshSelection() })
    return () => { cancelled = true; unsubscribe() }
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      try {
        const [wl, acc, spec, cands, ma, ai, positions, pending, history] = await Promise.all([
          marketDataSource.getWatchlist(),
          marketDataSource.getAccountData(),
          marketDataSource.getSymbolSpec(selectedSymbol),
          marketDataSource.getCandles(selectedSymbol, timeframe),
          marketDataSource.getMarketAnalysis(selectedSymbol),
          marketDataSource.getAIAnalysis(selectedSymbol),
          marketDataSource.getOpenPositions(),
          marketDataSource.getPendingOrders(),
          marketDataSource.getTradeHistory(),
        ])
        if (cancelled) return
        symbolSpecCache.current[selectedSymbol] = spec
        setWatchlist(wl)
        setSymbolSpec(spec)
        setCandles(cands)
        setLiveCandles([])
        if (!isBrokerMode()) {
          const m1 = await marketDataSource.getCandles(selectedSymbol, 'M1', 12000)
          const sameSymbolContinuation = simulatedEngineRef.current !== null && simulatedEngineSymbolRef.current === selectedSymbol
          const carryBid = sameSymbolContinuation ? simulatedPriceRef.current : (m1[m1.length - 1]?.close ?? acc.balance)
          const carryTimestamp = sameSymbolContinuation ? marketTimestamp : m1[m1.length - 1]?.time
          const engine = new SimulatorRealtimeMarketEngine(spec, timeframe, m1, carryBid, carryTimestamp)
          simulatedEngineRef.current = engine
          simulatedEngineSymbolRef.current = selectedSymbol
          const snapshot = engine.snapshot()
          setSimulatedCandles(snapshot.candles)
          setSimulatedM1Candles(snapshot.m1Candles.slice(-3000))
          setSimulatedPrice(snapshot.bid)
          simulatedPriceRef.current = snapshot.bid
          setMarketTimestamp(snapshot.timestamp)
        } else {
          simulatedEngineRef.current = null
          simulatedEngineSymbolRef.current = null
          setSimulatedCandles(cands)
          setSimulatedM1Candles([])
          setSimulatedPrice(cands[cands.length - 1]?.close ?? acc.balance)
          simulatedPriceRef.current = cands[cands.length - 1]?.close ?? acc.balance
          setMarketTimestamp(cands[cands.length - 1]?.time ?? Math.floor(Date.now() / 1000))
        }
        setReplayCount(cands.length)
        setMarketAnalysis(ma)
        setAiAnalysis(ai)
        if (!accountInitialized.current) { accountInitialized.current = true; setAccountData(acc) }
        if (!simulatorInitialized.current) { simulatorInitialized.current = true; setOpenPositions(positions); setPendingOrders(pending); setTradeHistory(history) }
        const pair = wl.find((p) => p.symbol === selectedSymbol)
        const initialChartPrice = cands[cands.length - 1]?.close ?? pair?.price
        if (Number.isFinite(initialChartPrice)) setCurrentPrice(Number(initialChartPrice))
      } catch (err) {
        if (!cancelled) pushToast(err instanceof Error ? err.message : 'Unable to load market data.')
      }
    }
    void load()
    return () => { cancelled = true }
  }, [pushToast, selectedSymbol, timeframe])

  const activeSelectionKey = activeProviderSelection
    ? providerAccountStreamKey({
        providerId: activeProviderSelection.providerId,
        connectionId: activeProviderSelection.connectionId,
        accountId: activeProviderSelection.accountId ?? '',
        accountType: activeProviderSelection.environment === 'demo' ? 'demo' : 'real',
      })
    : ''

  useEffect(() => {
    const brokerMode = isBrokerMode()
    const manager = accountStreamManager.current
    if (!brokerMode) { void manager.stopAll(); return }

    let cancelled = false
    const startAll = async (): Promise<void> => {
      try {
        const connections = await getProviderConnections()
        if (cancelled) return
        const specs = connections
          .filter((connection) => connection.state === 'connected')
          .flatMap((connection) => connection.accounts
            .filter((account) => account.active)
            .map((account) => ({
              providerId: connection.providerId,
              connectionId: connection.id,
              accountId: account.providerAccountId,
              accountType: account.environment === 'demo' ? 'demo' as const : 'real' as const,
            })))
        if (!specs.length) { pushToast('No connected provider accounts are available.'); return }

        await Promise.all(specs.map(async (spec) => {
          const key = providerAccountStreamKey(spec)
          await manager.start(
            spec,
            (snapshot) => {
              if (key !== activeSelectionKey) return
              setAccountData((prev) => {
                if (!prev) return prev
                const floatingPL = prev.floatingPL
                const equity = Number((snapshot.balance + floatingPL).toFixed(2))
                const freeMargin = Number((equity - prev.usedMargin).toFixed(2))
                if (prev.balance === snapshot.balance && prev.currency === snapshot.currency && prev.equity === equity && prev.freeMargin === freeMargin) return prev
                return { ...prev, balance: snapshot.balance, currency: snapshot.currency, equity, freeMargin }
              })
            },
            (status) => { if (key === activeSelectionKey && status === 'error') pushToast(spec.providerId + ' account stream interrupted — SHAFX is reconnecting.') },
          )
        }))
      } catch (error) {
        if (!cancelled) pushToast(error instanceof Error ? error.message : 'Unable to start provider account streams.')
      }
    }

    void manager.stopAll().then(startAll)
    return () => { cancelled = true; void manager.stopAll() }
  }, [activeSelectionKey, pushToast])

  useEffect(() => {
    if (!isSimulatorMode()) return
    setDemoOpenPositions(openPositions)
    setDemoTradeHistory(tradeHistory)
  }, [openPositions, tradeHistory])

  const visibleCandles = useMemo(() => replayCount > 0 && replayCount < candles.length ? candles.slice(0, replayCount) : candles, [candles, replayCount])
  useEffect(() => {
    if (isBrokerMode() || !symbolSpec || !simulatedEngineRef.current) return

    const timer = window.setInterval(() => {
      const engine = simulatedEngineRef.current
      if (!engine) return

      const snapshot = engine.tickOnce(1)
      setSimulatedCandles(snapshot.candles)
      setSimulatedM1Candles(snapshot.m1Candles.slice(-3000))
      setSimulatedPrice(snapshot.bid)
      setMarketTimestamp(snapshot.timestamp)
      setCurrentPrice(snapshot.bid)
    }, 1000)

    return () => window.clearInterval(timer)
  }, [selectedSymbol, symbolSpec, timeframe])


  const replayActive = !isSimulatorMode() && !liveMarketActive && visibleCandles.length > 0 && visibleCandles.length < candles.length
  const chartCandles = liveMarketActive && liveCandles.length > 0
    ? liveCandles
    : isSimulatorMode() && simulatedCandles.length > 0
      ? simulatedCandles
      : replayActive
        ? visibleCandles
        : visibleCandles
  const displayPrice = liveMarketActive && liveCandles.length > 0
    ? (liveCandles[liveCandles.length - 1]?.close ?? currentPrice)
    : isSimulatorMode()
      ? simulatedPrice
      : replayActive
        ? (visibleCandles[visibleCandles.length - 1]?.close ?? currentPrice)
        : currentPrice
  // The chart's primary price is always the latest candle close. This keeps the
  // simulated Bid/Sell stream and the candle OHLC data on one source of truth.
  const chartLastPrice = isSimulatorMode() ? simulatedPrice : (chartCandles[chartCandles.length - 1]?.close ?? displayPrice)
  const chartSpread = symbolSpec ? symbolSpec.pipSize * 0.8 : 0.00008
  const chartAskPrice = Number((chartLastPrice + chartSpread).toFixed(symbolSpec?.pricePrecision ?? 5))
  const conversionRate = symbolSpec ? getConversionRate(symbolSpec.quoteCurrency, accountData?.currency ?? 'USD') : undefined

  // The forming candle changes every simulator tick. Structural levels do not
  // need to be rebuilt on every tick because the annotation builder already
  // excludes that forming candle. Keep the annotation source stable until a
  // completed candle, symbol, or timeframe actually changes; this prevents
  // price-line labels from flickering while the market is moving.
  const structureCandleIndex = Math.max(0, chartCandles.length - 2)
  const structureCandle = chartCandles[structureCandleIndex]
  const chartStructureSourceKey = chartCandles.length === 0
    ? 'empty'
    : [chartCandles.length, structureCandle?.time, structureCandle?.open, structureCandle?.high, structureCandle?.low, structureCandle?.close].join(':')
  const structuralChartCandles = useMemo(() => [...chartCandles], [chartStructureSourceKey])

  // Support/resistance/liquidity on the main chart belong to the timeframe
  // the trader is actually viewing. The builder ignores the forming candle,
  // so these levels stay structural instead of following the live BUY/SELL
  // quote. Higher-timeframe context remains a separate overlay below.
  const chartAnnotations = useMemo(() => buildStructuralChartAnnotations(selectedSymbol, structuralChartCandles, timeframe)
    .map((annotation) => ({ ...annotation, id: `structure-${timeframe}-${annotation.id}` })),
  [structuralChartCandles, selectedSymbol, timeframe])

  const tradeLines = useMemo<ChartAnnotation[]>(() => openPositions
    .filter((trade) => trade.symbol === selectedSymbol && trade.status === 'open')
    .flatMap((trade) => {
      const lines: ChartAnnotation[] = [
        { id: `trade-${trade.id}-entry`, price: trade.entryPrice, label: `${trade.type} Entry • ${trade.lotSize.toFixed(2)} lots`, color: trade.type === 'BUY' ? '#22D3A5' : '#FF5C75', lineWidth: 3 },
      ]
      if (Number.isFinite(Number(trade.stopLoss))) lines.push({ id: `trade-${trade.id}-sl`, price: Number(trade.stopLoss), label: `${trade.type} SL`, color: '#F5B84B', lineWidth: 2 })
      if (Number.isFinite(Number(trade.takeProfit))) lines.push({ id: `trade-${trade.id}-tp`, price: Number(trade.takeProfit), label: `${trade.type} TP`, color: '#7C5CFC', lineWidth: 2 })
      return lines
    }), [openPositions, selectedSymbol])

  const aiSetup = useMemo(() => analyzeCurrentSetup(selectedSymbol, chartCandles)?.preferredSetup ?? null, [selectedSymbol, chartCandles])
  const activeProviderId = activeProviderSelection?.providerId ?? 'simulator'
  const activeProviderDescriptor = providerCatalog.find((item) => item.id === activeProviderId) ?? providerCatalog.find((item) => item.id === 'simulator')
  const activeProviderName = activeProviderDescriptor?.name ?? (activeProviderId === 'simulator' ? 'SHAFX Simulator' : activeProviderId)
  const chartToolMode: ChartToolMode = chartTool
  const brokerMode = isBrokerMode()
  const activeMarketConnection = brokerMode && activeProviderSelection ? {
    providerId: activeProviderSelection.providerId,
    connectionId: activeProviderSelection.connectionId,
    accountId: activeProviderSelection.accountId,
    environment: activeProviderSelection.environment,
    state: 'connected' as const,
    connectedAt: new Date().toISOString(),
  } : undefined

  const reviewAISetup = useCallback((nextSetup: SetupCandidate | null = null): void => {
    setReviewedSetup(nextSetup ?? aiSetup)
    setMobileTab('market')
    setDock('orders')
    setMobileDockOpen(true)
    window.setTimeout(() => document.getElementById('mobile-market-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }, [aiSetup])

  const handleLiveUpdate = useCallback((nextCandles: OHLCV[], price: number, epoch: number): void => { setLiveCandles(nextCandles); setCurrentPrice(price); setMarketTimestamp(Math.floor(epoch / 1000)) }, [])
  const handleLiveActiveChange = useCallback((active: boolean): void => { setLiveMarketActive(active); if (!active) setLiveCandles([]) }, [])
  const handleOrderSubmit = useCallback((draft: SimulatedOrderDraft): void => {
    try {
      const order = submitSimulatedOrder(draft)
      setOpenPositions((prev) => [...prev, order])
      pushToast(`Simulated ${order.type} ${order.lotSize.toFixed(2)} lots ${order.symbol} placed.`)
    } catch (err) { pushToast(err instanceof Error ? err.message : 'Unable to place simulated order.') }
  }, [pushToast])
  const handleBotOrder = useCallback((order: TradeOrder): void => {
    setBotOrderIds((prev) => {
      const next = prev.includes(order.id) ? prev : [...prev, order.id]
      try { window.localStorage.setItem(BOT_ORDER_IDS_KEY, JSON.stringify(next)) } catch { /* storage may be unavailable */ }
      return next
    })
    setOpenPositions((prev) => prev.some((item) => item.id === order.id) ? prev : [...prev, order])
    pushToast('SHAFX Bot opened simulated ' + order.type + ' ' + order.symbol + '.')
  }, [pushToast])

  const closePosition = useCallback(async (id: string): Promise<TradeOrder | null> => {
    const order = openPositions.find((item) => item.id === id)
    if (!order || !accountData) return null
    try {
      let spec: SymbolSpec
      let exitPrice: number | undefined
      if (order.symbol === selectedSymbol && symbolSpec) {
        spec = symbolSpec
        exitPrice = displayPrice
      } else {
        const [fetchedSpec, wl] = await Promise.all([marketDataSource.getSymbolSpec(order.symbol), marketDataSource.getWatchlist()])
        spec = fetchedSpec
        exitPrice = wl.find((item) => item.symbol === order.symbol)?.price
      }
      if (!exitPrice) throw new Error('No simulated market price is available for this position.')
      const rate = getConversionRate(spec.quoteCurrency, accountData.currency)
      const closed = closeSimulatedPosition(order, { exitPrice, conversionRate: rate }, spec)
      const realized = closed.profit ?? 0
      if (isSimulatorMode()) applyDemoProfit(realized)
      setOpenPositions((prev) => prev.filter((item) => item.id !== id))
      setTradeHistory((prev) => [closed, ...prev])
      setAccountData((prev) => {
        if (!prev) return prev
        const balance = Number((prev.balance + realized).toFixed(2))
        const floatingPL = openPositions.filter((item) => item.id !== id && item.status === 'open').reduce((sum, item) => sum + (item.profit ?? 0), 0)
        const equity = Number((balance + floatingPL).toFixed(2))
        return { ...prev, balance, equity, floatingPL, freeMargin: Number((equity - prev.usedMargin).toFixed(2)) }
      })
      pushToast(`Simulated ${closed.type} ${closed.symbol} closed at ${exitPrice.toFixed(spec.pricePrecision)}.`)
      return closed
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to close simulated position.')
      return null
    }
  }, [accountData, displayPrice, openPositions, pushToast, selectedSymbol, symbolSpec])

  const handleClosePosition = useCallback(async (id: string): Promise<void> => {
    await closePosition(id)
  }, [closePosition])
  const handleBulkClose = useCallback(async (mode: 'winning' | 'losing' | 'all'): Promise<void> => {
    if (!isSimulatorMode() || !accountData || openPositions.length === 0) return

    const targets = mode === 'all'
      ? openPositions
      : openPositions.filter((position) => mode === 'winning' ? (position.profit ?? 0) > 0 : (position.profit ?? 0) < 0)

    if (targets.length === 0) {
      pushToast(mode === 'winning' ? 'No profitable open positions to close.' : mode === 'losing' ? 'No losing open positions to close.' : 'No open positions to close.')
      return
    }

    try {
      const prices = new Map(watchlist.map((pair) => [pair.symbol, pair.price]))
      prices.set(selectedSymbol, displayPrice)

      const uniqueSymbols = [...new Set(targets.map((position) => position.symbol))]
      const specs = await Promise.all(uniqueSymbols.map(async (symbol) => {
        if (symbol === selectedSymbol && symbolSpec) return [symbol, symbolSpec] as const
        if (symbolSpecCache.current[symbol]) return [symbol, symbolSpecCache.current[symbol]] as const
        const spec = await marketDataSource.getSymbolSpec(symbol)
        symbolSpecCache.current[symbol] = spec
        return [symbol, spec] as const
      }))

      const specMap = new Map(specs)
      const idsToClose = new Set(targets.map((position) => position.id))
      const closed: TradeOrder[] = []

      for (const position of targets) {
        const spec = specMap.get(position.symbol)
        const exitPrice = prices.get(position.symbol)
        if (!spec || typeof exitPrice !== 'number' || !Number.isFinite(exitPrice)) continue
        const rate = getConversionRate(spec.quoteCurrency, accountData.currency)
        closed.push(closeSimulatedPosition(position, { exitPrice, conversionRate: rate }, spec))
      }

      if (closed.length === 0) {
        pushToast('No selected positions could be closed at current simulated prices.')
        return
      }

      const realized = Number(closed.reduce((sum, position) => sum + (position.profit ?? 0), 0).toFixed(2))
      if (isSimulatorMode()) applyDemoProfit(realized)
      setOpenPositions((prev) => prev.filter((position) => !idsToClose.has(position.id)))
      setTradeHistory((prev) => [...closed, ...prev])
      setAccountData((prev) => {
        if (!prev) return prev
        const remaining = openPositions.filter((position) => !idsToClose.has(position.id))
        const floatingPL = remaining.reduce((sum, position) => sum + (position.profit ?? 0), 0)
        const balance = Number((prev.balance + realized).toFixed(2))
        const equity = Number((balance + floatingPL).toFixed(2))
        return { ...prev, balance, equity, floatingPL, freeMargin: Number((equity - prev.usedMargin).toFixed(2)) }
      })

      const sign = realized >= 0 ? '+' : ''
      const label = mode === 'all' ? 'all' : mode === 'winning' ? 'winning' : 'losing'
      pushToast(`Closed ${closed.length} ${label} position${closed.length === 1 ? '' : 's'} • ${sign}${realized.toFixed(2)} ${accountData.currency}.`)
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to bulk close simulated positions.')
    }
  }, [accountData, displayPrice, openPositions, pushToast, selectedSymbol, symbolSpec, watchlist])

  const handleBotClose = useCallback(async (id: string): Promise<TradeOrder | null> => {
    return closePosition(id)
  }, [closePosition])

  useEffect(() => {
    openPositionsRef.current = openPositions
    currentPriceForPositionsRef.current = displayPrice
    selectedSymbolForPositionsRef.current = selectedSymbol
    symbolSpecForPositionsRef.current = symbolSpec
    watchlistForPositionsRef.current = watchlist
    accountCurrencyForPositionsRef.current = accountData?.currency ?? 'USD'
  }, [accountData?.currency, displayPrice, openPositions, selectedSymbol, symbolSpec, watchlist])

  const queuePositionRefresh = useCallback((): void => {
    if (positionRefreshTimer.current !== null) return
    positionRefreshTimer.current = window.setTimeout(async () => {
      positionRefreshTimer.current = null
      if (positionRefreshInFlight.current) {
        positionRefreshQueued.current = true
        return
      }

      const positions = openPositionsRef.current
      if (!accountData || positions.length === 0) return

      positionRefreshInFlight.current = true
      try {
        const prices = new Map(watchlistForPositionsRef.current.map((pair) => [pair.symbol, pair.price]))
        prices.set(selectedSymbolForPositionsRef.current, currentPriceForPositionsRef.current)
        const uniqueSymbols = [...new Set(positions.map((position) => position.symbol))]
        const specs = await Promise.all(uniqueSymbols.map(async (symbol) => {
          if (symbol === selectedSymbolForPositionsRef.current && symbolSpecForPositionsRef.current) {
            return [symbol, symbolSpecForPositionsRef.current] as const
          }
          if (symbolSpecCache.current[symbol]) return [symbol, symbolSpecCache.current[symbol]] as const
          const spec = await marketDataSource.getSymbolSpec(symbol)
          symbolSpecCache.current[symbol] = spec
          return [symbol, spec] as const
        }))

        const specMap = new Map(specs)
        const updated = positions.map((position) => {
          const spec = specMap.get(position.symbol)
          const price = prices.get(position.symbol)
          if (!spec || typeof price !== 'number') return position
          const rate = getConversionRate(spec.quoteCurrency, accountCurrencyForPositionsRef.current)
          return markSimulatedPosition(position, { currentPrice: price, symbolSpec: spec, conversionRate: rate })
        })

        const newlyClosed = updated.filter((position, index) => positions[index].status === 'open' && position.status === 'closed')
        const stillOpen = updated.filter((position) => position.status === 'open')
        const realized = newlyClosed.reduce((sum, position) => sum + (position.profit ?? 0), 0)

        if (newlyClosed.length > 0) {
          if (isSimulatorMode()) applyDemoProfit(realized)
          setOpenPositions(stillOpen)
          setTradeHistory((prev) => [...newlyClosed, ...prev])
          newlyClosed.forEach((position) => pushToast(`Simulated ${position.type} ${position.symbol} closed automatically.`))
        } else if (updated.some((position, index) => position.profit !== positions[index].profit)) {
          setOpenPositions(updated)
        }

        const floatingPL = stillOpen.reduce((sum, position) => sum + (position.profit ?? 0), 0)
        setAccountData((prev) => {
          if (!prev) return prev
          const balance = newlyClosed.length > 0 && isSimulatorMode() ? Number((prev.balance + realized).toFixed(2)) : prev.balance
          const equity = Number((balance + floatingPL).toFixed(2))
          const freeMargin = Number((equity - prev.usedMargin).toFixed(2))
          if (prev.balance === balance && prev.equity === equity && prev.floatingPL === floatingPL && prev.freeMargin === freeMargin) return prev
          return { ...prev, balance, equity, floatingPL, freeMargin }
        })
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Unable to update open positions.')
      } finally {
        positionRefreshInFlight.current = false
        if (positionRefreshQueued.current) {
          positionRefreshQueued.current = false
          queuePositionRefresh()
        }
      }
    }, 150)
  }, [accountData, pushToast])

  useEffect(() => {
    if (openPositions.length > 0) queuePositionRefresh()
  }, [displayPrice, openPositions.length, queuePositionRefresh])

  useEffect(() => () => {
    if (positionRefreshTimer.current !== null) window.clearTimeout(positionRefreshTimer.current)
  }, [])


  if (!accountData || !symbolSpec || !marketAnalysis || !aiAnalysis) return <div className="flex h-full items-center justify-center bg-shafx-bg text-shafx-text">Preparing SHAFX workspace…</div>

  const activePosition = openPositions.find((position) => position.symbol === selectedSymbol && position.status === 'open') ?? null
  const showMarket = mobileTab === 'market'
  const showAgent = mobileTab === 'agent'
  const showHistory = mobileTab === 'history'
  const showAccount = mobileTab === 'account'
  const liveControl = <ProviderLiveControl providerId={activeProviderId} connection={activeMarketConnection} symbol={selectedSymbol} timeframe={timeframe} onUpdate={handleLiveUpdate} onActiveChange={handleLiveActiveChange} />
  const botProps = { symbol: selectedSymbol, timeframe, candles: chartCandles, botOrderIds, scanM1Candles: simulatedM1Candles, currentPrice: displayPrice, activePosition, tradeHistory, accountBalance: accountData.balance, accountCurrency: accountData.currency, symbolSpec, conversionRate, botPlan: user?.botPlan ?? 'FREE' as const, botAutostartKey: BOT_AUTORUN_KEY, onBotOrder: handleBotOrder, onBotClose: handleBotClose, onBotRunningChange: setBotRunning, onReviewSetup: reviewAISetup }

  const openMobileDock = (next: WorkspaceDock): void => {
    setMobileDockOpen((open) => dock === next ? !open : true)
    setDock(next)
  }

  const dockContent = {
    insights: <div className="space-y-3"><FXMoveMatrix pairs={watchlist} /><MarketAnalysisPanel analysis={marketAnalysis} pricePrecision={symbolSpec.pricePrecision} /><AIAssistantPanel symbol={selectedSymbol} timeframe={timeframe} candles={chartCandles} setup={aiSetup} onReviewSetup={reviewAISetup} /></div>,
    liquidity: <LiquidityPanel symbol={selectedSymbol} price={displayPrice} precision={symbolSpec.pricePrecision} pipSize={symbolSpec.pipSize} candles={chartCandles} />,
    orders: <div className="space-y-3">
      {brokerMode && activeProviderDescriptor ? <ProviderCapabilityPanel descriptor={activeProviderDescriptor} environment={activeProviderSelection?.environment ?? 'demo'} /> : <OrderPanel key={selectedSymbol + ':' + symbolSpec.pricePrecision + ':' + symbolSpec.lotStep} symbol={selectedSymbol} currentPrice={displayPrice} accountBalance={accountData.balance} accountCurrency={accountData.currency} symbolSpec={symbolSpec} conversionRate={conversionRate} onSubmitOrder={handleOrderSubmit} aiSetup={reviewedSetup ?? aiSetup} autoApplyAISetup={reviewedSetup !== null} />}
      {isSimulatorMode() && (
        <div className="rounded-xl border border-shafx-border bg-shafx-surface/80 p-3">
          <div className="flex items-center justify-between gap-2">
            <div><div className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-shafx-textMuted">Position management</div><div className="mt-1 text-[10px] text-shafx-textMuted">{openPositions.length} open positions</div></div>
            <span className="font-mono text-[9px] text-shafx-textMuted">SIMULATOR</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <button type="button" onClick={() => void handleBulkClose('winning')} disabled={!openPositions.some((position) => (position.profit ?? 0) > 0)} className="min-h-10 rounded-lg border border-shafx-success/25 bg-shafx-success/[0.05] px-2 text-[9px] font-semibold text-shafx-success disabled:opacity-35">Close winning</button>
            <button type="button" onClick={() => void handleBulkClose('losing')} disabled={!openPositions.some((position) => (position.profit ?? 0) < 0)} className="min-h-10 rounded-lg border border-shafx-danger/25 bg-shafx-danger/[0.05] px-2 text-[9px] font-semibold text-shafx-danger disabled:opacity-35">Close losing</button>
            <button type="button" onClick={() => void handleBulkClose('all')} disabled={openPositions.length === 0} className="min-h-10 rounded-lg border border-shafx-border bg-shafx-bg px-2 text-[9px] font-semibold text-shafx-text disabled:opacity-35">Close all</button>
          </div>
        </div>
      )}
      <div className="min-h-[280px]"><TradesPanel openPositions={openPositions} pendingOrders={pendingOrders} tradeHistory={tradeHistory} currentPrice={displayPrice} selectedSymbol={selectedSymbol} onClosePosition={handleClosePosition} onBulkClose={handleBulkClose} /></div>
    </div>,
    agent: <div className="space-y-3"><SimulationPulse key={selectedSymbol} selectedSymbol={selectedSymbol} openPositions={openPositions} tradeHistory={tradeHistory} botOrderIds={botOrderIds} botRunning={botRunning} /><SimulationFlowChart key={selectedSymbol} selectedSymbol={selectedSymbol} openPositions={openPositions} tradeHistory={tradeHistory} /><TradingAgentPanel {...botProps} /><PerformancePanel tradeHistory={tradeHistory} currency={accountData.currency} /></div>,
    research: <div className="space-y-3"><ReplayPanel candles={candles} replayCount={replayCount || candles.length} onReplayCountChange={setReplayCount} /><BacktestPanel symbol={selectedSymbol} candles={candles} symbolSpec={symbolSpec} initialBalance={accountData.balance} accountCurrency={accountData.currency} conversionRate={conversionRate} /><PerformancePanel tradeHistory={tradeHistory} currency={accountData.currency} /><TradingJournalPanel tradeHistory={tradeHistory} currency={accountData.currency} /></div>,
  }[dock]

  return <div className="min-h-screen w-full min-w-0 overflow-x-hidden bg-shafx-bg text-shafx-text lg:flex lg:h-[calc(100vh-28px)] lg:flex-col lg:overflow-hidden">
    <TopNav symbol={selectedSymbol} price={displayPrice} pricePrecision={symbolSpec.pricePrecision} timeframe={timeframe} onTimeframeChange={setTimeframe} pairs={watchlist} onSelectPair={setSelectedSymbol} view={mobileTab} />
    <main className="shafx-mobile-content flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-visible lg:flex-row lg:overflow-hidden">
      <WorkspaceRail tool={chartTool} onToolChange={(next) => setChartTool(next)} dock={dock} onDockChange={setDock} />

      <aside className="hidden w-[clamp(210px,20vw,280px)] min-w-0 flex-shrink-0 flex-col gap-3 border-r border-shafx-border bg-shafx-surface/40 p-3 lg:flex lg:overflow-y-auto">
        <Watchlist pairs={watchlist} selectedPair={selectedSymbol} onSelectPair={setSelectedSymbol} />
        <AccountPanel account={accountData} />
        {brokerMode && activeProviderId === 'deriv' && <DerivCashierLinks />}
      </aside>

      <section className={`${showMarket ? '' : 'hidden'} min-w-0 flex-1 flex-col overflow-visible lg:flex lg:overflow-hidden`}>
        <WorkspaceStatus provider={activeProviderName} mode={brokerMode ? 'broker' : 'demo'} symbol={selectedSymbol} price={displayPrice} precision={symbolSpec.pricePrecision} live={liveMarketActive} />
        <div className="flex min-h-0 flex-1 flex-col overflow-visible">
          <div className="flex min-h-10 flex-shrink-0 items-center justify-between gap-2 border-b border-shafx-border bg-shafx-surface/45 px-3 sm:px-4">
            <div className="flex min-w-0 items-center gap-2"><span className="truncate text-xs font-semibold">{selectedSymbol}</span><span className="rounded-md border border-shafx-border bg-shafx-bg px-2 py-1 text-[9px] text-shafx-textMuted">{liveMarketActive ? `LIVE • ${activeProviderName}` : 'SIMULATED MARKET'}</span></div>
            <div className="flex items-center gap-1.5"><span className="hidden text-[9px] uppercase tracking-[0.15em] text-shafx-textMuted sm:block">Feed</span>{liveControl}<button type="button" onClick={() => setDock(dock === 'orders' ? 'insights' : 'orders')} className="flex min-h-10 items-center gap-1.5 rounded-xl border border-shafx-border bg-shafx-bg px-2.5 text-[9px] font-semibold hover:border-shafx-accent/40"><SlidersHorizontal className="h-3.5 w-3.5 text-shafx-accent" />Trade</button></div>
          </div>
          <MobileChartTools tool={chartTool} onToolChange={setChartTool} candleTheme={chartSettings.candleTheme} chartMode={chartSettings.chartMode} />
          <div className="relative h-[58vh] min-h-[420px] p-2 sm:h-[62vh] sm:min-h-[480px] sm:p-3 lg:h-auto lg:min-h-[520px] lg:flex-1">
            <CandlestickChart data={chartCandles} symbol={selectedSymbol} timeframe={timeframe} annotations={chartAnnotations} tradeLines={tradeLines} bidPrice={chartLastPrice} askPrice={chartAskPrice} toolMode={chartToolMode} pipSize={symbolSpec.pipSize} onToolNotice={pushToast} showGrid={chartSettings.showGrid} showPriceLabels={chartSettings.showPriceLabels} candleTheme={chartSettings.candleTheme} chartMode={chartSettings.chartMode} marketTimestamp={marketTimestamp} />
            <div className="pointer-events-none absolute bottom-5 right-5 z-10 hidden items-center gap-1.5 rounded-xl border border-shafx-border bg-shafx-surface/90 px-2.5 py-1.5 text-[9px] text-shafx-textMuted backdrop-blur sm:flex"><Maximize2 className="h-3 w-3 text-shafx-accent" />Scroll / pinch to navigate</div>
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-shafx-border bg-shafx-surface/55 p-2 sm:grid-cols-4">
            <button type="button" onClick={() => openMobileDock('insights')} className="rounded-xl border border-shafx-border bg-shafx-bg px-3 py-2 text-left hover:border-shafx-accent/30"><span className="text-[9px] text-shafx-textMuted">Structure</span><div className="mt-1 text-xs font-semibold">{marketAnalysis.bias} • {marketAnalysis.structure.type}</div></button>
            <button type="button" onClick={() => openMobileDock('liquidity')} className="rounded-xl border border-shafx-border bg-shafx-bg px-3 py-2 text-left hover:border-shafx-accent/30"><span className="text-[9px] text-shafx-textMuted">Liquidity</span><div className="mt-1 text-xs font-semibold">Prev H {marketAnalysis.liquidity.previousHigh?.toFixed(symbolSpec.pricePrecision) ?? '—'}</div></button>
            <button type="button" onClick={() => openMobileDock('orders')} className="rounded-xl border border-shafx-border bg-shafx-bg px-3 py-2 text-left hover:border-shafx-accent/30"><span className="text-[9px] text-shafx-textMuted">Risk</span><div className="mt-1 text-xs font-semibold">Open trade workspace</div></button>
            <button type="button" onClick={() => openMobileDock('research')} className="rounded-xl border border-shafx-border bg-shafx-bg px-3 py-2 text-left hover:border-shafx-accent/30"><span className="text-[9px] text-shafx-textMuted">Research</span><div className="mt-1 text-xs font-semibold">Replay • Backtest</div></button>
          </div>
          <div className="hidden h-56 flex-shrink-0 border-t border-shafx-border bg-shafx-surface/25 p-2 lg:block"><TradesPanel openPositions={openPositions} pendingOrders={pendingOrders} tradeHistory={tradeHistory} currentPrice={displayPrice} selectedSymbol={selectedSymbol} onClosePosition={handleClosePosition} onBulkClose={handleBulkClose} /></div>

          {mobileDockOpen && <div id="mobile-market-workspace" className="border-t border-shafx-border bg-shafx-surface p-3 lg:hidden">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div><div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-shafx-textMuted">Market workspace</div><div className="text-sm font-semibold">{dock === 'insights' ? 'Structure & AI' : dock === 'liquidity' ? 'Liquidity' : dock === 'orders' ? 'Risk & trade ticket' : 'Research tools'}</div></div>
              <button type="button" onClick={() => setMobileDockOpen(false)} className="min-h-10 rounded-xl border border-shafx-border px-3 text-[10px] font-semibold text-shafx-textMuted">Close</button>
            </div>
            {dockContent}
          </div>}
        </div>
      </section>

      <aside className={`${showAgent ? '' : 'hidden'} w-full flex-shrink-0 overflow-visible p-3 pb-4 lg:hidden`}><SimulationPulse key={selectedSymbol} selectedSymbol={selectedSymbol} openPositions={openPositions} tradeHistory={tradeHistory} botOrderIds={botOrderIds} botRunning={botRunning} /><div className="mt-3"><SimulationFlowChart key={selectedSymbol} selectedSymbol={selectedSymbol} openPositions={openPositions} tradeHistory={tradeHistory} /><div className="mt-3"><TradingAgentPanel {...botProps} />{brokerMode && activeProviderId === 'deriv' && <div className="mt-3"><DerivCashierLinks /></div>}</div></div></aside>
      <aside className={`${showHistory ? '' : 'hidden'} w-full flex-shrink-0 overflow-visible p-3 pb-4 lg:hidden`}><div className="space-y-3"><TradesPanel openPositions={openPositions} pendingOrders={pendingOrders} tradeHistory={tradeHistory} currentPrice={displayPrice} selectedSymbol={selectedSymbol} onClosePosition={handleClosePosition} onBulkClose={handleBulkClose} /><PerformancePanel tradeHistory={tradeHistory} currency={accountData.currency} /><SimulationFlowChart key={selectedSymbol} selectedSymbol={selectedSymbol} openPositions={openPositions} tradeHistory={tradeHistory} /><TradingJournalPanel tradeHistory={tradeHistory} currency={accountData.currency} /></div></aside>
      <aside className={`${showAccount ? '' : 'hidden'} w-full flex-shrink-0 overflow-visible p-3 pb-4 lg:hidden`}><div className="space-y-3"><AccountPanel account={accountData} />{brokerMode && activeProviderId === 'deriv' && <DerivCashierLinks />}</div></aside>

      <aside className="hidden w-[clamp(300px,28vw,420px)] min-w-0 flex-shrink-0 flex-col overflow-hidden border-l border-shafx-border bg-shafx-surface/50 lg:flex">
        <div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-shafx-border px-3"><div><div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-shafx-textMuted">Workspace panel</div><div className="text-sm font-semibold">{dock === 'insights' ? 'Market intelligence' : dock === 'liquidity' ? 'Liquidity & depth' : dock === 'orders' ? 'Orders & positions' : dock === 'agent' ? 'SHAFX Bot' : 'Research lab'}</div></div><PanelRight className="h-4 w-4 text-shafx-textMuted" /></div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{dockContent}</div>
      </aside>
    </main>
    <MobileNav activeTab={mobileTab} onChange={setMobileTab} />
    <footer className="hidden h-7 items-center justify-between border-t border-shafx-border bg-[#080B10] px-4 text-[9px] text-shafx-textMuted lg:flex"><span>SHAFX • {brokerMode ? `Provider workspace • ${activeProviderName}` : 'Simulator workspace'}</span><span>{replayActive ? 'Visual replay active' : liveMarketActive ? 'Provider market stream active' : 'Demo market data'}</span></footer>
    <Toast toast={toast} onDismiss={() => setToast(null)} />
  </div>
}

const App: React.FC = () => <ErrorBoundary><TerminalProvider><TerminalContent /></TerminalProvider></ErrorBoundary>
export default App
