import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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
import { providerRegistry } from './integrations/catalog'
import { analyzeLiquidity } from './engine/liquidity'
import { analyzeMarketStructure, findSwingPoints } from './engine/marketStructure'
import { analyzeSupportResistance } from './engine/supportResistance'
import { TIMEFRAMES, type AccountData, type BotPaperTrade, type MarketAnalysis, type MarketPair, type OHLCV, type SymbolSpec, type TradeOrder } from './types'
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

  const handleBotPaperRoundClosed = useCallback((trade: BotPaperTrade): void => {
    setBotPaperHistory((current) => [trade, ...current.filter((item) => item.id !== trade.id)].slice(0, 200))
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(BOT_PAPER_HISTORY_STORAGE_KEY, JSON.stringify(botPaperHistory))
  }, [botPaperHistory])
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
            if (status === 'error') pushToast((activeProviderSelection.providerId === 'ctrader' ? 'cTrader' : 'Deriv') + ' account stream interrupted. SHAFX is reconnecting.')
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

  // Deriv's public FX stream gives SHAFX one live market price rather than a broker-side
  // bid/ask pair. Keep the terminal MT5-like at the fractional-pip level without rounding
  // away the final price digit on each tick. The spread remains a display estimate until
  // a broker-side bid/ask feed is available.
  const chartBidRaw = Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : (liveCandles[liveCandles.length - 1]?.close ?? 0)
  const chartBidPrice = Number(chartBidRaw.toFixed(symbolSpec.pricePrecision))
  const chartSpread = Math.max(symbolSpec.pipSize * 0.2, symbolSpec.pipSize / 10)
  const chartAskCandidate = Number((chartBidPrice + chartSpread).toFixed(symbolSpec.pricePrecision))
  const chartAskPrice = chartAskCandidate > chartBidPrice
    ? chartAskCandidate
    : Number((chartBidPrice + symbolSpec.pipSize).toFixed(symbolSpec.pricePrecision))

  const chartAnnotations = useMemo(() => buildStructuralChartAnnotations(selectedSymbol, liveCandles, timeframe)
    .map((annotation) => ({ ...annotation, id: 'live-' + timeframe + '-' + annotation.id })), [liveCandles, selectedSymbol, timeframe])

  const selectedOpenPosition = useMemo(
    () => openPositions.find((position) => position.symbol === selectedSymbol) ?? null,
    [openPositions, selectedSymbol],
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
        const adapter = providerRegistry.get('ctrader')
        const connection = {
          providerId: 'ctrader',
          connectionId: derivOrderConnection.connectionId,
          accountId: derivOrderConnection.accountId,
          environment: derivOrderConnection.environment,
          state: 'connected' as const,
          connectedAt: new Date().toISOString(),
        }
        const result = await adapter.closePosition?.(connection, derivOrderConnection.accountId, id)
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
  }, [activeProviderSelection?.providerId, derivOrderConnection, openPositions, pushToast, selectedSymbol, tradeHistory])

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
    </div>,
    chat: <div className="space-y-3">
      <AIAssistantPanel symbol={selectedSymbol} timeframe={timeframe} candles={liveCandles} setup={reviewSetup} onReviewSetup={() => handleReviewSetup(reviewSetup)} />
      <OrderPanel symbol={selectedSymbol} currentPrice={currentPrice} bidPrice={chartBidPrice} askPrice={chartAskPrice} accountBalance={resolvedAccountData.balance} accountFreeMargin={resolvedAccountData.freeMargin} accountCurrency={resolvedAccountData.currency} symbolSpec={symbolSpec} timeframe={timeframe} connection={derivOrderConnection} providerSelection={activeProviderSelection} activePosition={selectedOpenPosition} onTradeClosed={(id) => { void handleClosePosition(id) }} onTradeLinesChange={setTradeLines} onTradeOpened={(order) => {
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
    orders: <OrderPanel symbol={selectedSymbol} currentPrice={currentPrice} bidPrice={chartBidPrice} askPrice={chartAskPrice} accountBalance={resolvedAccountData.balance} accountCurrency={resolvedAccountData.currency} symbolSpec={symbolSpec} timeframe={timeframe} connection={derivOrderConnection} activePosition={selectedOpenPosition} onTradeClosed={(id) => { void handleClosePosition(id) }} onTradeLinesChange={setTradeLines} onTradeOpened={(order) => {
      setOpenPositions((current) => [order, ...current.filter((item) => item.id !== order.id)])
      setTradeHistory((current) => current.filter((item) => item.id !== order.id))
      setTradeLines([])
      setReviewSetup(null)
      pushToast('Deriv ' + order.type + ' trade opened on ' + (order.chartTimeframe ?? timeframe) + '.')
    }} aiSetup={reviewSetup} />,

  }

  return <div className={'shafx-terminal-root min-h-[100svh] w-full min-w-0 overflow-x-hidden bg-shafx-bg text-shafx-text lg:flex lg:h-[calc(100vh-28px)] lg:flex-col lg:overflow-hidden' + (isLandscapeCompactViewport ? ' shafx-landscape-mode' : '')}>
    <TopNav symbol={selectedSymbol} price={currentPrice} pricePrecision={symbolSpec.pricePrecision} pairs={watchlist} onSelectPair={setSelectedSymbol} view={mobileTab === 'history' ? 'history' : mobileTab === 'account' || mobileTab === 'funds' ? 'account' : 'market'} />
    <main className="shafx-mobile-content flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-visible lg:flex-row lg:overflow-hidden">
      <WorkspaceRail tool={chartTool} onToolChange={setChartTool} dock={dock} onDockChange={setDock} />
      <aside className="hidden w-[230px] min-w-[210px] max-w-[250px] flex-shrink-0 border-r border-shafx-border bg-[#090D13] lg:block">
        <Watchlist pairs={watchlist} selectedPair={selectedSymbol} onSelectPair={setSelectedSymbol} />
      </aside>

      <section className={`shafx-market-section ${showMarket ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col overflow-visible lg:overflow-hidden`}>
        <div className="lg:hidden"><WorkspaceStatus provider={activeProviderName} mode="broker" symbol={selectedSymbol} price={currentPrice} precision={symbolSpec.pricePrecision} live={liveMarketActive} /></div>
        <div className="lg:hidden border-b border-shafx-border bg-shafx-surface/70 px-2 py-2 sm:px-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-shafx-border bg-shafx-bg/80 px-3 py-2"><div className="flex items-center justify-between gap-2"><span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-shafx-textMuted">Account</span><span className={accountModeTone + " font-mono text-[8px] font-bold"}>{accountModeLabel}</span></div><div className="mt-1 font-mono text-sm font-bold tabular-nums">{resolvedAccountData.currency} {resolvedAccountData.balance.toFixed(2)}</div></div>
            <div className="rounded-xl border border-shafx-border bg-shafx-bg/80 px-3 py-2"><div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-shafx-textMuted">Equity</div><div className="mt-1 font-mono text-sm font-bold tabular-nums">{resolvedAccountData.currency} {resolvedAccountData.equity.toFixed(4)}</div><div className={resolvedAccountData.floatingPL >= 0 ? 'text-[8px] text-shafx-success' : 'text-[8px] text-shafx-danger'}>{resolvedAccountData.floatingPL >= 0 ? '+' : ''}{resolvedAccountData.floatingPL.toFixed(4)} floating</div></div>
            <div className="rounded-xl border border-shafx-border bg-shafx-bg/80 px-3 py-2"><div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-shafx-textMuted">Deriv connection</div><div className="mt-1 text-xs font-semibold">{liveMarketActive ? 'Live market stream' : 'Connecting'}</div><div className="text-[8px] text-shafx-textMuted">Auto reconnect enabled</div></div>
            <div className="rounded-xl border border-shafx-border bg-shafx-bg/80 px-3 py-2"><div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-shafx-textMuted">Free margin</div><div className="mt-1 font-mono text-sm font-bold tabular-nums">{resolvedAccountData.currency} {resolvedAccountData.freeMargin.toFixed(4)}</div></div>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-visible">
          <div className="flex min-h-9 flex-shrink-0 items-center justify-between gap-2 border-b border-shafx-border bg-[#0A0E14] px-3 sm:px-4 lg:min-h-10">
            <div className="flex min-w-0 items-center gap-2"><span className="truncate text-xs font-semibold">{selectedSymbol}</span><span className="font-mono text-[10px] font-semibold tabular-nums text-shafx-textMuted">{Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice.toFixed(symbolSpec.pricePrecision) : '—'}</span><span className={'rounded-full border px-2 py-0.5 text-[8px] font-semibold ' + (liveMarketActive ? 'border-shafx-success/25 bg-shafx-success/5 text-shafx-success' : 'border-shafx-warning/25 bg-shafx-warning/5 text-shafx-warning')}>{liveMarketActive ? 'LIVE' : 'CONNECTING'}</span></div>
            <div className="flex items-center gap-1.5">{liveControl}</div>
          </div>
           <div className="flex min-h-10 flex-shrink-0 items-center gap-1 overflow-x-auto border-b border-shafx-border bg-[#0C1118] px-3 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-4">
             <span className="mr-1 hidden text-[8px] font-bold uppercase tracking-[0.16em] text-shafx-textMuted sm:inline">TIMEFRAME</span>
             {TIMEFRAMES.map((tf) => (
               <button key={tf} type="button" onClick={() => setTimeframe(tf)} aria-pressed={timeframe === tf} className={'min-h-8 flex-shrink-0 rounded-md px-2.5 text-[8px] font-bold tracking-wide transition ' + (timeframe === tf ? 'bg-shafx-accent text-white shadow-md' : 'text-shafx-textMuted hover:bg-shafx-bg hover:text-shafx-text')}>
                 {tf}
               </button>
             ))}
             <span className="ml-auto hidden rounded-lg border border-shafx-border bg-shafx-bg px-2 py-1 font-mono text-[8px] text-shafx-textMuted md:inline">{timeframe}</span>
           </div>
           <MobileChartTools tool={chartTool} onToolChange={setChartTool} candleTheme={chartSettings.candleTheme} chartMode={chartSettings.chartMode} />
           <div className="shafx-chart-stage relative min-h-0 p-1 sm:p-2 lg:flex-1">
             {liveCandles.length > 0 ? <CandlestickChart data={liveCandles} symbol={selectedSymbol} timeframe={timeframe} annotations={chartAnnotations} tradeLines={tradeLines} bidPrice={chartBidPrice} askPrice={chartAskPrice} toolMode={chartToolMode} pipSize={symbolSpec.pipSize} onToolNotice={pushToast} showGrid={chartSettings.showGrid} showPriceLabels={chartSettings.showPriceLabels} candleTheme={chartSettings.candleTheme} chartMode={chartSettings.chartMode} marketTimestamp={marketTimestamp} onTimeframeChange={setTimeframe} replayMode={false} /> : <div className="flex h-full min-h-[320px] items-center justify-center text-sm text-shafx-textMuted">Waiting for the live Deriv market stream…</div>}
           </div>
          <div className="shafx-landscape-secondary grid grid-cols-2 gap-2 border-t border-shafx-border bg-shafx-surface/55 p-2 sm:grid-cols-4">
            <button type="button" onClick={() => openMobileDock('insights')} className="rounded-xl border border-shafx-border bg-shafx-bg px-3 py-2 text-left hover:border-shafx-accent/30"><span className="text-[9px] text-shafx-textMuted">Structure</span><div className="mt-1 text-xs font-semibold">{marketAnalysis.bias} • {marketAnalysis.structure.type}</div></button>
            <button type="button" onClick={() => openMobileDock('liquidity')} className="rounded-xl border border-shafx-border bg-shafx-bg px-3 py-2 text-left hover:border-shafx-accent/30"><span className="text-[9px] text-shafx-textMuted">Liquidity</span><div className="mt-1 text-xs font-semibold">{marketAnalysis.liquidity.previousHigh?.toFixed(symbolSpec.pricePrecision) ?? '—'}</div></button>
            <button type="button" onClick={() => openMobileDock('orders')} className="rounded-xl border border-shafx-border bg-shafx-bg px-3 py-2 text-left hover:border-shafx-accent/30"><span className="text-[9px] text-shafx-textMuted">Account</span><div className="mt-1 text-xs font-semibold">{accountModeLabel}</div></button>
            <button type="button" onClick={() => { setMobileTab('account'); setMobileDockOpen(false) }} className="rounded-xl border border-shafx-border bg-shafx-bg px-3 py-2 text-left hover:border-shafx-accent/30"><span className="text-[9px] text-shafx-textMuted">Funding</span><div className="mt-1 text-xs font-semibold">Deposit • Withdraw</div></button>
          </div>
          <div className="hidden h-36 flex-shrink-0 xl:h-40 border-t border-shafx-border bg-[#090D13] p-1.5 lg:block"><TradesPanel openPositions={openPositions} pendingOrders={pendingOrders} tradeHistory={tradeHistory} currentPrice={currentPrice} selectedSymbol={selectedSymbol} onClosePosition={(id) => { void handleClosePosition(id) }} onBulkClose={handleBulkClose} currency={resolvedAccountData.currency} botPaperHistory={botPaperHistory} /></div>
          {mobileDockOpen && <div id="mobile-market-workspace" className="border-t border-shafx-border bg-shafx-surface p-3 lg:hidden">
            <div className="mb-3 flex items-center justify-between gap-3"><div><div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-shafx-textMuted">Market workspace</div><div className="text-sm font-semibold">{dock === 'insights' ? 'Structure & AI' : dock === 'liquidity' ? 'Liquidity' : 'Deriv account'}</div></div><button type="button" onClick={() => setMobileDockOpen(false)} className="min-h-10 rounded-xl border border-shafx-border px-3 text-[10px] font-semibold text-shafx-textMuted">Close</button></div>
            {dockContent[dock === 'agent' || dock === 'research' ? 'insights' : dock]}
          </div>}
        </div>
      </section>

      <aside className={showChat ? 'w-full flex-shrink-0 overflow-visible p-3 pb-4 lg:hidden' : 'hidden'}><div className="space-y-3"><AIAssistantPanel symbol={selectedSymbol} timeframe={timeframe} candles={liveCandles} setup={reviewSetup} onReviewSetup={() => handleReviewSetup(reviewSetup)} /><OrderPanel symbol={selectedSymbol} currentPrice={currentPrice} bidPrice={chartBidPrice} askPrice={chartAskPrice} accountBalance={resolvedAccountData.balance} accountCurrency={resolvedAccountData.currency} symbolSpec={symbolSpec} timeframe={timeframe} connection={derivOrderConnection} activePosition={selectedOpenPosition} onTradeClosed={(id) => { void handleClosePosition(id) }} onTradeLinesChange={setTradeLines} onTradeOpened={(order) => {
      setOpenPositions((current) => [order, ...current.filter((item) => item.id !== order.id)])
      setTradeHistory((current) => current.filter((item) => item.id !== order.id))
      setTradeLines([])
      setReviewSetup(null)
      pushToast('Deriv ' + order.type + ' trade opened on ' + (order.chartTimeframe ?? timeframe) + '.')
    }} aiSetup={reviewSetup} /></div></aside>
      <aside className={showBot ? 'w-full flex-shrink-0 overflow-visible p-3 pb-4 lg:hidden' : 'hidden'}><SignalDeskPanel symbol={selectedSymbol} timeframe={timeframe} candles={liveCandles} currentPrice={currentPrice} analysis={marketAnalysis} setup={reviewSetup} accountBalance={resolvedAccountData.balance} accountCurrency={resolvedAccountData.currency} connected={Boolean(derivOrderConnection)} onReviewSetup={handleReviewSetup} onPaperRoundClosed={handleBotPaperRoundClosed} /></aside>
      <aside className={showHistory ? 'w-full flex-shrink-0 overflow-visible p-3 pb-4 lg:hidden' : 'hidden'}><div className="h-[calc(100svh-92px)] min-h-[520px]"><TradesPanel defaultTab="history" openPositions={openPositions} pendingOrders={pendingOrders} tradeHistory={tradeHistory} currentPrice={currentPrice} selectedSymbol={selectedSymbol} onClosePosition={(id) => { void handleClosePosition(id) }} onBulkClose={handleBulkClose} currency={resolvedAccountData.currency} botPaperHistory={botPaperHistory} /></div></aside>
      <aside className={showFunds ? 'w-full flex-shrink-0 overflow-visible p-3 pb-4 lg:hidden' : 'hidden'}><div className="space-y-3"><DerivCashierLinks /></div></aside>
      <aside className={showAccount ? 'w-full flex-shrink-0 overflow-visible p-3 pb-4 lg:hidden' : 'hidden'}><div className="space-y-3"><AccountPanel account={resolvedAccountData} activeProviderSelection={activeProviderSelection} /></div></aside>

      <aside className="hidden w-[340px] min-w-[320px] max-w-[360px] flex-shrink-0 flex-col overflow-hidden border-l border-shafx-border bg-[#090D13] lg:flex xl:w-[360px]">
        <div className="flex h-10 flex-shrink-0 items-center justify-between border-b border-shafx-border px-3"><div><div className="text-[8px] font-semibold uppercase tracking-[0.16em] text-shafx-textMuted">{dock === 'orders' ? 'TRADE' : 'WORKSPACE'}</div><div className="text-xs font-semibold">{dock === 'insights' ? 'Market intelligence' : dock === 'chat' ? 'Chat & Order Ticket' : dock === 'bot' ? 'SHAFX Signal Desk' : dock === 'liquidity' ? 'Liquidity & depth' : 'Trade ticket'}</div></div></div>
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
