import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PanelRight, SlidersHorizontal } from 'lucide-react'
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
import { ProviderCapabilityPanel } from './components/market/ProviderCapabilityPanel'
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
import type { AccountData, MarketAnalysis, MarketPair, OHLCV, SymbolSpec, TradeOrder } from './types'
import type { SetupCandidate } from './engine/setup/types'
import { mockWatchlist } from './data/mock/watchlist'
import { fetchDerivActiveForexSymbols, subscribeDerivForexQuotes } from './data/deriv/DerivPublicMarketFeed'

const normalizeProviderSymbol = (value: string): string => {
  if (/^frx[A-Z0-9]{6}$/i.test(value)) {
    const pair = value.slice(3).toUpperCase()
    return pair.slice(0, 3) + '/' + pair.slice(3)
  }
  return value
}

const providerPositionToTrade = (position: ProviderPosition): TradeOrder => {
  const metadata = position.metadata || {}
  const stake = Number(metadata.stake ?? position.quantity ?? 0)
  const multiplierValue = Number(metadata.multiplier ?? 0)
  const entryPrice = Number(position.entryPrice ?? 0)
  return {
    id: String(position.id),
    symbol: normalizeProviderSymbol(position.symbol),
    type: position.side,
    lotSize: Number.isFinite(stake) ? stake : 0,
    entryPrice: Number.isFinite(entryPrice) ? entryPrice : 0,
    stopLoss: position.stopLoss ?? null,
    takeProfit: position.takeProfit ?? null,
    riskPercent: 0,
    riskAmount: Number.isFinite(stake) ? stake : 0,
    rewardAmount: 0,
    riskRewardRatio: 0,
    status: 'open',
    openTime: typeof metadata.purchaseTime === 'number'
      ? new Date(metadata.purchaseTime * 1000).toISOString()
      : new Date().toISOString(),
    profit: Number.isFinite(position.unrealizedPL) ? position.unrealizedPL : 0,
    providerOrderId: String(position.id),
    brokerProduct: 'DERIV_MULTIPLIER',
    stake: Number.isFinite(stake) ? stake : 0,
    multiplier: Number.isFinite(multiplierValue) && multiplierValue > 0 ? multiplierValue : undefined,
  }
}

const providerOrderToTrade = (order: ProviderOrderResult): TradeOrder | null => {
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
    openTime: typeof raw.purchaseTime === 'number'
      ? new Date(raw.purchaseTime * 1000).toISOString()
      : order.timestamp || new Date().toISOString(),
    closeTime: order.timestamp || new Date().toISOString(),
    profit: Number.isFinite(profit) ? profit : 0,
    providerOrderId: contractId,
    brokerProduct: 'DERIV_MULTIPLIER',
    stake: Number.isFinite(stake) ? stake : undefined,
    multiplier: Number(raw.multiplier) > 0 ? Number(raw.multiplier) : undefined,
  }
}

const TerminalContent: React.FC = () => {
  const { selectedSymbol, setSelectedSymbol, timeframe, setTimeframe } = useTerminal()
  const [activeProviderSelection, setActiveProviderSelection] = useState<ActiveProviderSelection | null>(() => getStoredProviderSelection())
  const [currentPrice, setCurrentPrice] = useState(0)
  const [marketTimestamp, setMarketTimestamp] = useState(0)
  const [liveCandles, setLiveCandles] = useState<OHLCV[]>([])
  const [accountData, setAccountData] = useState<AccountData | null>(null)
  const [watchlist, setWatchlist] = useState<MarketPair[]>(() => mockWatchlist.map((pair) => ({ ...pair, price: 0, change: 0, changePercent: 0, status: 'closed' })))
  const [symbolSpec, setSymbolSpec] = useState<SymbolSpec>(() => SYMBOL_SPECS[selectedSymbol] ?? SYMBOL_SPECS['EUR/USD'])
  const [openPositions, setOpenPositions] = useState<TradeOrder[]>([])
  const [pendingOrders] = useState<TradeOrder[]>([])
  const [tradeHistory, setTradeHistory] = useState<TradeOrder[]>([])
  const [reviewSetup, setReviewSetup] = useState<SetupCandidate | null>(null)
  const [liveMarketActive, setLiveMarketActive] = useState(false)
  const [chartSettings, setChartSettings] = useState<ChartWorkspaceSettings>(() => readChartWorkspaceSettings())
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [chartTool, setChartTool] = useState<WorkspaceTool>('cursor')
  const [dock, setDock] = useState<WorkspaceDock>('insights')
  const [mobileTab, setMobileTab] = useState<MobileNavTab>('market')
  const [mobileDockOpen, setMobileDockOpen] = useState(false)
  const [isLandscapeCompactViewport, setIsLandscapeCompactViewport] = useState(() => typeof window !== 'undefined' && window.matchMedia('(orientation: landscape) and (max-width: 999px)').matches)
  const accountStreamManager = useRef(new ProviderAccountStreamManager())
  const selectedSymbolRef = useRef(selectedSymbol)
  const watchlistReferencePricesRef = useRef<Record<string, number>>({})
  const candleCacheRef = useRef<Record<string, OHLCV[]>>({})
  const toastId = useRef(0)

  const pushToast = useCallback((text: string) => {
    toastId.current += 1
    setToast({ id: toastId.current, text })
  }, [])
  const dismissToast = useCallback(() => setToast(null), [])

  useEffect(() => { selectedSymbolRef.current = selectedSymbol }, [selectedSymbol])

  useEffect(() => {
    const compactMedia = window.matchMedia('(max-width: 999px)')
    const landscapeMedia = window.matchMedia('(orientation: landscape) and (max-width: 999px)')
    const sync = () => { setIsLandscapeCompactViewport(landscapeMedia.matches) }
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
        if (cancelled || !selected || selected.providerId !== 'deriv' || !selected.accountId) return
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
    const cacheKey = selectedSymbol + ':' + timeframe
    const cached = candleCacheRef.current[cacheKey] ?? []
    setLiveCandles(cached)
    const last = cached[cached.length - 1]
    setCurrentPrice(last?.close ?? 0)
    setMarketTimestamp(last ? Math.floor(last.time / 1000) : 0)
    setLiveMarketActive(false)
  }, [selectedSymbol, timeframe])

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
    const manager = accountStreamManager.current
    if (!activeProviderSelection?.providerId || activeProviderSelection.providerId !== 'deriv' || !activeProviderSelection.connectionId || !activeProviderSelection.accountId) {
      void manager.stopAll()
      return
    }

    let cancelled = false
    const accountType = activeProviderSelection.environment === 'demo' ? 'demo' as const : 'real' as const
    const spec = {
      providerId: 'deriv',
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
            if (status === 'error') pushToast('Deriv account stream interrupted. SHAFX is reconnecting.')
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
                const next = current.filter((item) => item.id !== trade.id)
                return [...next, trade].sort((a, b) => b.openTime.localeCompare(a.openTime))
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
  }, [activeProviderSelection?.providerId, activeProviderSelection?.connectionId, activeProviderSelection?.accountId, activeProviderSelection?.environment, pushToast])

  const handleLiveUpdate = useCallback((candles: OHLCV[], price: number, epoch: number): void => {
    const valid = candles.filter((candle, index) =>
      Number.isFinite(candle.time) &&
      Number.isFinite(candle.open) &&
      Number.isFinite(candle.high) &&
      Number.isFinite(candle.low) &&
      Number.isFinite(candle.close) &&
      (index === 0 || candle.time > candles[index - 1].time)
    )
    const cacheKey = selectedSymbolRef.current + ':' + timeframe
    candleCacheRef.current[cacheKey] = valid
    setLiveCandles(valid)
    setCurrentPrice(price)
    setMarketTimestamp(Math.floor(epoch / 1000))
  }, [timeframe])

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

  const chartAnnotations = useMemo(() => buildStructuralChartAnnotations(selectedSymbol, liveCandles, timeframe)
    .map((annotation) => ({ ...annotation, id: 'live-' + timeframe + '-' + annotation.id })), [liveCandles, selectedSymbol, timeframe])

  const tradeLines = useMemo<ChartAnnotation[]>(() => [], [])
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
  const activeProviderName = 'Deriv'
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
      pushToast('Connect Deriv before closing a trade.')
      return null
    }
    try {
      const closed = await closeDerivContract(derivOrderConnection, id, existing)
      if (!closed) return null
      setOpenPositions((current) => current.filter((order) => order.id !== id))
      setTradeHistory((current) => [closed, ...current.filter((order) => order.id !== id)])
      return closed
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Unable to close the Deriv trade.')
      return null
    }
  }, [derivOrderConnection, openPositions, pushToast, tradeHistory])

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

  const liveControl = <ProviderLiveControl
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
      <OrderPanel symbol={selectedSymbol} currentPrice={currentPrice} bidPrice={currentPrice} askPrice={currentPrice} accountBalance={resolvedAccountData.balance} accountCurrency={resolvedAccountData.currency} symbolSpec={symbolSpec} timeframe={timeframe} connection={derivOrderConnection} onTradeOpened={(order) => { setOpenPositions((current) => [...current, order]); setTradeHistory((current) => current.filter((item) => item.id !== order.id)); setReviewSetup(null); pushToast('Deriv ' + order.type + ' trade opened on ' + (order.chartTimeframe ?? timeframe) + '.') }} aiSetup={reviewSetup} />
    </div>,
    chat: <div className="space-y-3">
      <AIAssistantPanel symbol={selectedSymbol} timeframe={timeframe} candles={liveCandles} setup={reviewSetup} onReviewSetup={() => handleReviewSetup(reviewSetup)} />
      <OrderPanel symbol={selectedSymbol} currentPrice={currentPrice} bidPrice={currentPrice} askPrice={currentPrice} accountBalance={resolvedAccountData.balance} accountCurrency={resolvedAccountData.currency} symbolSpec={symbolSpec} timeframe={timeframe} connection={derivOrderConnection} onTradeOpened={(order) => { setOpenPositions((current) => [...current, order]); setTradeHistory((current) => current.filter((item) => item.id !== order.id)); setReviewSetup(null); pushToast('Deriv ' + order.type + ' trade opened on ' + (order.chartTimeframe ?? timeframe) + '.') }} aiSetup={reviewSetup} />
    </div>,
    bot: <SignalDeskPanel
      symbol={selectedSymbol}
      timeframe={timeframe}
      currentPrice={currentPrice}
      analysis={marketAnalysis}
      setup={reviewSetup}
      accountBalance={resolvedAccountData.balance}
      accountCurrency={resolvedAccountData.currency}
      connected={Boolean(derivOrderConnection)}
      onReviewSetup={handleReviewSetup}
    />,
    liquidity: <LiquidityPanel key={selectedSymbol} symbol={selectedSymbol} price={currentPrice} precision={symbolSpec.pricePrecision} pipSize={symbolSpec.pipSize} candles={liveCandles} />,
    orders: <ProviderCapabilityPanel descriptor={{
      id: 'deriv',
      name: 'Deriv',
      kind: 'broker',
      status: 'available',
      executionMode: 'external',
      authMethods: ['oauth2'],
      description: activeProviderSelection?.environment === 'demo'
        ? 'Connected Deriv demo account • demo order placement is enabled for testing.'
        : 'Connected Deriv live account • live order placement is disabled during SHAFX release testing.',
      capabilities: {
        accountRead: true, marketData: true, historicalCandles: true, realtimeMarketData: true, realtimeAccountData: true,
        positionsRead: false, ordersRead: false, orderPlacement: true, orderCancellation: false, orderModification: false,
        orderLookupByClientOrderId: false, positionClose: true, multipleAccounts: true, demoAccounts: true, symbolMetadata: false,
        funding: { deposit: 'redirect', withdrawal: 'redirect' },
      },
    }} environment={activeProviderSelection?.environment ?? 'demo'} />,
  }

  return <div className={'shafx-terminal-root min-h-[100svh] w-full min-w-0 overflow-x-hidden bg-shafx-bg text-shafx-text lg:flex lg:h-[calc(100vh-28px)] lg:flex-col lg:overflow-hidden' + (isLandscapeCompactViewport ? ' shafx-landscape-mode' : '')}>
    <TopNav symbol={selectedSymbol} price={currentPrice} pricePrecision={symbolSpec.pricePrecision} timeframe={timeframe} onTimeframeChange={setTimeframe} pairs={watchlist} onSelectPair={setSelectedSymbol} view={mobileTab === 'history' ? 'history' : mobileTab === 'account' || mobileTab === 'funds' ? 'account' : 'market'} />
    <main className="shafx-mobile-content flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-visible lg:flex-row lg:overflow-hidden">
      <WorkspaceRail tool={chartTool} onToolChange={setChartTool} dock={dock} onDockChange={setDock} />
      <aside className="hidden w-[clamp(210px,20vw,280px)] min-w-0 flex-shrink-0 flex-col gap-3 border-r border-shafx-border bg-shafx-surface/40 p-3 lg:flex lg:overflow-y-auto">
        <Watchlist pairs={watchlist} selectedPair={selectedSymbol} onSelectPair={setSelectedSymbol} />
        <AccountPanel account={resolvedAccountData} activeProviderSelection={activeProviderSelection} />
      </aside>

      <section className={`shafx-market-section ${showMarket ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col overflow-visible lg:overflow-hidden`}>
        <div className="shafx-landscape-secondary"><WorkspaceStatus provider={activeProviderName} mode="broker" symbol={selectedSymbol} price={currentPrice} precision={symbolSpec.pricePrecision} live={liveMarketActive} /></div>
        <div className="shafx-landscape-secondary border-b border-shafx-border bg-shafx-surface/70 px-2 py-2 sm:px-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-shafx-border bg-shafx-bg/80 px-3 py-2"><div className="flex items-center justify-between gap-2"><span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-shafx-textMuted">Account</span><span className={accountModeTone + " font-mono text-[8px] font-bold"}>{accountModeLabel}</span></div><div className="mt-1 font-mono text-sm font-bold tabular-nums">{resolvedAccountData.currency} {resolvedAccountData.balance.toFixed(2)}</div></div>
            <div className="rounded-xl border border-shafx-border bg-shafx-bg/80 px-3 py-2"><div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-shafx-textMuted">Equity</div><div className="mt-1 font-mono text-sm font-bold tabular-nums">{resolvedAccountData.currency} {resolvedAccountData.equity.toFixed(2)}</div><div className={resolvedAccountData.floatingPL >= 0 ? 'text-[8px] text-shafx-success' : 'text-[8px] text-shafx-danger'}>{resolvedAccountData.floatingPL >= 0 ? '+' : ''}{resolvedAccountData.floatingPL.toFixed(2)} floating</div></div>
            <div className="rounded-xl border border-shafx-border bg-shafx-bg/80 px-3 py-2"><div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-shafx-textMuted">Deriv connection</div><div className="mt-1 text-xs font-semibold">{liveMarketActive ? 'Live market stream' : 'Connecting'}</div><div className="text-[8px] text-shafx-textMuted">Auto reconnect enabled</div></div>
            <div className="rounded-xl border border-shafx-border bg-shafx-bg/80 px-3 py-2"><div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-shafx-textMuted">Free margin</div><div className="mt-1 font-mono text-sm font-bold tabular-nums">{resolvedAccountData.currency} {resolvedAccountData.freeMargin.toFixed(2)}</div></div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-visible">
          <div className="flex min-h-10 flex-shrink-0 items-center justify-between gap-2 border-b border-shafx-border bg-shafx-surface/45 px-3 sm:px-4">
            <div className="flex min-w-0 items-center gap-2"><span className="truncate text-xs font-semibold">{selectedSymbol}</span><span className={'rounded-md border px-2 py-1 text-[9px] ' + (liveMarketActive ? 'border-shafx-success/25 bg-shafx-success/5 text-shafx-success' : 'border-shafx-warning/25 bg-shafx-warning/5 text-shafx-warning')}>{liveMarketActive ? 'LIVE • DERIV' : 'CONNECTING • DERIV'}</span></div>
            <div className="flex items-center gap-1.5"><span className="hidden text-[9px] uppercase tracking-[0.15em] text-shafx-textMuted sm:block">Feed</span>{liveControl}<button type="button" onClick={() => setDock(dock === 'orders' ? 'insights' : 'orders')} className="flex min-h-10 items-center gap-1.5 rounded-xl border border-shafx-border bg-shafx-bg px-2.5 text-[9px] font-semibold hover:border-shafx-accent/40"><SlidersHorizontal className="h-3.5 w-3.5 text-shafx-accent" />Account</button></div>
          </div>
          <MobileChartTools tool={chartTool} onToolChange={setChartTool} candleTheme={chartSettings.candleTheme} chartMode={chartSettings.chartMode} />
          <div className="shafx-chart-stage relative min-h-0 p-1 sm:p-2 lg:flex-1">
            {liveCandles.length > 0 ? <CandlestickChart data={liveCandles} symbol={selectedSymbol} timeframe={timeframe} annotations={chartAnnotations} tradeLines={tradeLines} bidPrice={currentPrice} askPrice={currentPrice} toolMode={chartToolMode} pipSize={symbolSpec.pipSize} onToolNotice={pushToast} showGrid={chartSettings.showGrid} showPriceLabels={chartSettings.showPriceLabels} candleTheme={chartSettings.candleTheme} chartMode={chartSettings.chartMode} marketTimestamp={marketTimestamp} onTimeframeChange={setTimeframe} replayMode={false} /> : <div className="flex h-full min-h-[320px] items-center justify-center text-sm text-shafx-textMuted">Waiting for the live Deriv market stream…</div>}
          </div>
          <div className="shafx-landscape-secondary grid grid-cols-2 gap-2 border-t border-shafx-border bg-shafx-surface/55 p-2 sm:grid-cols-4">
            <button type="button" onClick={() => openMobileDock('insights')} className="rounded-xl border border-shafx-border bg-shafx-bg px-3 py-2 text-left hover:border-shafx-accent/30"><span className="text-[9px] text-shafx-textMuted">Structure</span><div className="mt-1 text-xs font-semibold">{marketAnalysis.bias} • {marketAnalysis.structure.type}</div></button>
            <button type="button" onClick={() => openMobileDock('liquidity')} className="rounded-xl border border-shafx-border bg-shafx-bg px-3 py-2 text-left hover:border-shafx-accent/30"><span className="text-[9px] text-shafx-textMuted">Liquidity</span><div className="mt-1 text-xs font-semibold">{marketAnalysis.liquidity.previousHigh?.toFixed(symbolSpec.pricePrecision) ?? '—'}</div></button>
            <button type="button" onClick={() => openMobileDock('orders')} className="rounded-xl border border-shafx-border bg-shafx-bg px-3 py-2 text-left hover:border-shafx-accent/30"><span className="text-[9px] text-shafx-textMuted">Account</span><div className="mt-1 text-xs font-semibold">{accountModeLabel}</div></button>
            <button type="button" onClick={() => { setMobileTab('account'); setMobileDockOpen(false) }} className="rounded-xl border border-shafx-border bg-shafx-bg px-3 py-2 text-left hover:border-shafx-accent/30"><span className="text-[9px] text-shafx-textMuted">Funding</span><div className="mt-1 text-xs font-semibold">Deposit • Withdraw</div></button>
          </div>
          <div className="hidden h-56 flex-shrink-0 border-t border-shafx-border bg-shafx-surface/25 p-2 lg:block"><TradesPanel openPositions={openPositions} pendingOrders={pendingOrders} tradeHistory={tradeHistory} currentPrice={currentPrice} selectedSymbol={selectedSymbol} onClosePosition={(id) => { void handleClosePosition(id) }} /></div>
          {mobileDockOpen && <div id="mobile-market-workspace" className="border-t border-shafx-border bg-shafx-surface p-3 lg:hidden">
            <div className="mb-3 flex items-center justify-between gap-3"><div><div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-shafx-textMuted">Market workspace</div><div className="text-sm font-semibold">{dock === 'insights' ? 'Structure & AI' : dock === 'liquidity' ? 'Liquidity' : 'Deriv account'}</div></div><button type="button" onClick={() => setMobileDockOpen(false)} className="min-h-10 rounded-xl border border-shafx-border px-3 text-[10px] font-semibold text-shafx-textMuted">Close</button></div>
            {dockContent[dock === 'agent' || dock === 'research' ? 'insights' : dock]}
          </div>}
        </div>
      </section>

      <aside className={showChat ? 'w-full flex-shrink-0 overflow-visible p-3 pb-4 lg:hidden' : 'hidden'}><div className="space-y-3"><AIAssistantPanel symbol={selectedSymbol} timeframe={timeframe} candles={liveCandles} setup={reviewSetup} onReviewSetup={() => handleReviewSetup(reviewSetup)} /><OrderPanel symbol={selectedSymbol} currentPrice={currentPrice} bidPrice={currentPrice} askPrice={currentPrice} accountBalance={resolvedAccountData.balance} accountCurrency={resolvedAccountData.currency} symbolSpec={symbolSpec} timeframe={timeframe} connection={derivOrderConnection} onTradeOpened={(order) => { setOpenPositions((current) => [...current, order]); setTradeHistory((current) => current.filter((item) => item.id !== order.id)); setReviewSetup(null); pushToast('Deriv ' + order.type + ' trade opened on ' + (order.chartTimeframe ?? timeframe) + '.') }} aiSetup={reviewSetup} /></div></aside>
      <aside className={showBot ? 'w-full flex-shrink-0 overflow-visible p-3 pb-4 lg:hidden' : 'hidden'}><SignalDeskPanel symbol={selectedSymbol} timeframe={timeframe} currentPrice={currentPrice} analysis={marketAnalysis} setup={reviewSetup} accountBalance={resolvedAccountData.balance} accountCurrency={resolvedAccountData.currency} connected={Boolean(derivOrderConnection)} onReviewSetup={handleReviewSetup} /></aside>
      <aside className={showHistory ? 'w-full flex-shrink-0 overflow-visible p-3 pb-4 lg:hidden' : 'hidden'}><div className="space-y-3"><TradesPanel positionsOnly openPositions={openPositions} pendingOrders={pendingOrders} tradeHistory={tradeHistory} currentPrice={currentPrice} selectedSymbol={selectedSymbol} onClosePosition={(id) => { void handleClosePosition(id) }} /></div></aside>
      <aside className={showFunds ? 'w-full flex-shrink-0 overflow-visible p-3 pb-4 lg:hidden' : 'hidden'}><div className="space-y-3"><DerivCashierLinks /></div></aside>
      <aside className={showAccount ? 'w-full flex-shrink-0 overflow-visible p-3 pb-4 lg:hidden' : 'hidden'}><div className="space-y-3"><AccountPanel account={resolvedAccountData} activeProviderSelection={activeProviderSelection} /></div></aside>

      <aside className="hidden w-[clamp(300px,28vw,420px)] min-w-0 flex-shrink-0 flex-col overflow-hidden border-l border-shafx-border bg-shafx-surface/50 lg:flex">
        <div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-shafx-border px-3"><div><div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-shafx-textMuted">Workspace panel</div><div className="text-sm font-semibold">{dock === 'insights' ? 'Market intelligence' : dock === 'chat' ? 'Chat & Order Ticket' : dock === 'bot' ? 'SHAFX Signal Desk' : dock === 'liquidity' ? 'Liquidity & depth' : 'Deriv account'}</div></div><PanelRight className="h-4 w-4 text-shafx-textMuted" /></div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{dockContent[dock === 'agent' || dock === 'research' ? 'insights' : dock]}</div>
      </aside>
    </main>
    <MobileNav activeTab={mobileTab} onChange={setMobileTab} />
    <footer className="hidden h-7 items-center justify-between border-t border-shafx-border bg-[#080B10] px-4 text-[9px] text-shafx-textMuted lg:flex"><span>SHAFX • Deriv workspace • {accountModeLabel}</span><span>{liveMarketActive ? 'Deriv market stream active' : 'Connecting to Deriv'}</span></footer>
    <Toast toast={toast} onDismiss={dismissToast} />
  </div>
}

const App: React.FC = () => <ErrorBoundary><TerminalProvider><TerminalContent /></TerminalProvider></ErrorBoundary>

export default App
