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
import { AccountPanel } from './components/account/AccountPanel'
import { TradesPanel } from './components/trades/TradesPanel'
import { Toast, type ToastMessage } from './components/common/Toast'
import { CHART_SETTINGS_EVENT, readChartWorkspaceSettings, type ChartWorkspaceSettings } from './app/chartSettings'
import { SYMBOL_SPECS } from './data/mock/symbols'
import { getProviderConnections, chooseDefaultProviderSelection, subscribeToProviderSelection, type ActiveProviderSelection } from './data/provider/providerConnections'
import { ProviderAccountStreamManager, providerAccountStreamKey } from './data/provider/ProviderAccountStreamManager'
import { analyzeLiquidity } from './engine/liquidity'
import { analyzeMarketStructure, findSwingPoints } from './engine/marketStructure'
import { analyzeSupportResistance } from './engine/supportResistance'
import type { AccountData, MarketAnalysis, MarketPair, OHLCV, SymbolSpec, TradeOrder } from './types'
import { mockWatchlist } from './data/mock/watchlist'

const TerminalContent: React.FC = () => {
  const { selectedSymbol, setSelectedSymbol, timeframe, setTimeframe } = useTerminal()
  const [activeProviderSelection, setActiveProviderSelection] = useState<ActiveProviderSelection | null>(() => chooseDefaultProviderSelection([]))
  const [currentPrice, setCurrentPrice] = useState(0)
  const [marketTimestamp, setMarketTimestamp] = useState(0)
  const [liveCandles, setLiveCandles] = useState<OHLCV[]>([])
  const [accountData, setAccountData] = useState<AccountData | null>(null)
  const [watchlist, setWatchlist] = useState<MarketPair[]>(() => mockWatchlist)
  const [symbolSpec, setSymbolSpec] = useState<SymbolSpec>(() => SYMBOL_SPECS[selectedSymbol] ?? SYMBOL_SPECS['EUR/USD'])
  const [openPositions] = useState<TradeOrder[]>([])
  const [pendingOrders] = useState<TradeOrder[]>([])
  const [tradeHistory] = useState<TradeOrder[]>([])
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
    const nextSpec = SYMBOL_SPECS[selectedSymbol] ?? SYMBOL_SPECS['EUR/USD']
    setSymbolSpec(nextSpec)
    setLiveCandles([])
    setCurrentPrice(0)
    setMarketTimestamp(0)
    setLiveMarketActive(false)
  }, [selectedSymbol, timeframe])

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
    setLiveCandles(valid)
    setCurrentPrice(price)
    setMarketTimestamp(Math.floor(epoch / 1000))
    setWatchlist((prev) => prev.map((pair) =>
      pair.symbol === selectedSymbolRef.current ? { ...pair, price, change: valid.length > 1 ? price - valid[valid.length - 2].close : 0, changePercent: valid.length > 1 && valid[valid.length - 2].close !== 0 ? ((price - valid[valid.length - 2].close) / valid[valid.length - 2].close) * 100 : 0 } : pair
    ))
  }, [])

  const handleLiveActiveChange = useCallback((active: boolean): void => {
    setLiveMarketActive(active)
    if (!active) setLiveCandles([])
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
  const activeMarketConnection = useMemo(() => activeProviderSelection ? ({
    providerId: activeProviderSelection.providerId,
    connectionId: activeProviderSelection.connectionId,
    accountId: activeProviderSelection.accountId,
    environment: activeProviderSelection.environment,
    state: 'connected' as const,
    connectedAt: new Date().toISOString(),
  }) : undefined, [activeProviderSelection?.providerId, activeProviderSelection?.connectionId, activeProviderSelection?.accountId, activeProviderSelection?.environment])
  const activeProviderName = 'Deriv'
  const accountModeLabel = activeProviderSelection?.environment === 'live' ? 'REAL ACCOUNT' : 'DEMO ACCOUNT'
  const accountModeTone = activeProviderSelection?.environment === 'live' ? 'text-shafx-accent' : 'text-shafx-success'
  const chartToolMode: ChartToolMode = chartTool

  const openMobileDock = (next: WorkspaceDock): void => {
    const willOpen = dock !== next || !mobileDockOpen
    setMobileDockOpen((open) => dock === next ? !open : true)
    setDock(next)
    if (!willOpen) setMobileDockOpen(false)
  }

  const showMarket = mobileTab === 'market'
  const showAgent = mobileTab === 'agent'
  const showHistory = mobileTab === 'history'
  const showAccount = mobileTab === 'account'

  if (!accountData) {
    return <div className="flex h-full min-h-[100svh] items-center justify-center bg-shafx-bg px-5 text-center text-sm text-shafx-textMuted">Connecting to your Deriv account…</div>
  }

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
      <AIAssistantPanel symbol={selectedSymbol} timeframe={timeframe} candles={liveCandles} />
    </div>,
    liquidity: <LiquidityPanel key={selectedSymbol} symbol={selectedSymbol} price={currentPrice} precision={symbolSpec.pricePrecision} pipSize={symbolSpec.pipSize} candles={liveCandles} />,
    orders: <ProviderCapabilityPanel descriptor={{
      id: 'deriv',
      name: 'Deriv',
      kind: 'broker',
      status: 'available',
      executionMode: 'external',
      authMethods: ['oauth2'],
      description: 'Connected Deriv account',
      capabilities: {
        accountRead: true, marketData: true, historicalCandles: true, realtimeMarketData: true, realtimeAccountData: true,
        positionsRead: false, ordersRead: false, orderPlacement: false, orderCancellation: false, orderModification: false,
        orderLookupByClientOrderId: false, positionClose: false, multipleAccounts: true, demoAccounts: true, symbolMetadata: false,
        funding: { deposit: 'external', withdrawal: 'external' },
      },
    }} environment={activeProviderSelection?.environment ?? 'demo'} />,
  }

  return <div className={'shafx-terminal-root min-h-[100svh] w-full min-w-0 overflow-x-hidden bg-shafx-bg text-shafx-text lg:flex lg:h-[calc(100vh-28px)] lg:flex-col lg:overflow-hidden' + (isLandscapeCompactViewport ? ' shafx-landscape-mode' : '')}>
    <TopNav symbol={selectedSymbol} price={currentPrice} pricePrecision={symbolSpec.pricePrecision} timeframe={timeframe} onTimeframeChange={setTimeframe} pairs={watchlist} onSelectPair={setSelectedSymbol} view={mobileTab} />
    <main className="shafx-mobile-content flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-visible lg:flex-row lg:overflow-hidden">
      <WorkspaceRail tool={chartTool} onToolChange={setChartTool} dock={dock} onDockChange={setDock} />
      <aside className="hidden w-[clamp(210px,20vw,280px)] min-w-0 flex-shrink-0 flex-col gap-3 border-r border-shafx-border bg-shafx-surface/40 p-3 lg:flex lg:overflow-y-auto">
        <Watchlist pairs={watchlist} selectedPair={selectedSymbol} onSelectPair={setSelectedSymbol} />
        <AccountPanel account={accountData} activeProviderSelection={activeProviderSelection} />
      </aside>

      <section className={`shafx-market-section ${showMarket ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col overflow-visible lg:overflow-hidden`}>
        <div className="shafx-landscape-secondary"><WorkspaceStatus provider={activeProviderName} mode="broker" symbol={selectedSymbol} price={currentPrice} precision={symbolSpec.pricePrecision} live={liveMarketActive} /></div>
        <div className="shafx-landscape-secondary border-b border-shafx-border bg-shafx-surface/70 px-2 py-2 sm:px-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-shafx-border bg-shafx-bg/80 px-3 py-2"><div className="flex items-center justify-between gap-2"><span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-shafx-textMuted">Account</span><span className={accountModeTone + " font-mono text-[8px] font-bold"}>{accountModeLabel}</span></div><div className="mt-1 font-mono text-sm font-bold tabular-nums">{accountData.currency} {accountData.balance.toFixed(2)}</div></div>
            <div className="rounded-xl border border-shafx-border bg-shafx-bg/80 px-3 py-2"><div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-shafx-textMuted">Equity</div><div className="mt-1 font-mono text-sm font-bold tabular-nums">{accountData.currency} {accountData.equity.toFixed(2)}</div><div className={accountData.floatingPL >= 0 ? 'text-[8px] text-shafx-success' : 'text-[8px] text-shafx-danger'}>{accountData.floatingPL >= 0 ? '+' : ''}{accountData.floatingPL.toFixed(2)} floating</div></div>
            <div className="rounded-xl border border-shafx-border bg-shafx-bg/80 px-3 py-2"><div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-shafx-textMuted">Deriv connection</div><div className="mt-1 text-xs font-semibold">{liveMarketActive ? 'Live market stream' : 'Connecting'}</div><div className="text-[8px] text-shafx-textMuted">Auto reconnect enabled</div></div>
            <div className="rounded-xl border border-shafx-border bg-shafx-bg/80 px-3 py-2"><div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-shafx-textMuted">Free margin</div><div className="mt-1 font-mono text-sm font-bold tabular-nums">{accountData.currency} {accountData.freeMargin.toFixed(2)}</div></div>
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
          <div className="hidden h-56 flex-shrink-0 border-t border-shafx-border bg-shafx-surface/25 p-2 lg:block"><TradesPanel openPositions={openPositions} pendingOrders={pendingOrders} tradeHistory={tradeHistory} currentPrice={currentPrice} selectedSymbol={selectedSymbol} onClosePosition={() => undefined} /></div>
          {mobileDockOpen && <div id="mobile-market-workspace" className="border-t border-shafx-border bg-shafx-surface p-3 lg:hidden">
            <div className="mb-3 flex items-center justify-between gap-3"><div><div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-shafx-textMuted">Market workspace</div><div className="text-sm font-semibold">{dock === 'insights' ? 'Structure & AI' : dock === 'liquidity' ? 'Liquidity' : 'Deriv account'}</div></div><button type="button" onClick={() => setMobileDockOpen(false)} className="min-h-10 rounded-xl border border-shafx-border px-3 text-[10px] font-semibold text-shafx-textMuted">Close</button></div>
            {dockContent[dock === 'agent' || dock === 'research' ? 'insights' : dock]}
          </div>}
        </div>
      </section>

      <aside className={showAgent ? 'w-full flex-shrink-0 overflow-visible p-3 pb-4 lg:hidden' : 'hidden'}><div className="space-y-3"><AIAssistantPanel symbol={selectedSymbol} timeframe={timeframe} candles={liveCandles} /><DerivCashierLinks /></div></aside>
      <aside className={showHistory ? 'w-full flex-shrink-0 overflow-visible p-3 pb-4 lg:hidden' : 'hidden'}><div className="space-y-3"><TradesPanel positionsOnly openPositions={openPositions} pendingOrders={pendingOrders} tradeHistory={tradeHistory} currentPrice={currentPrice} selectedSymbol={selectedSymbol} onClosePosition={() => undefined} /><DerivCashierLinks /></div></aside>
      <aside className={showAccount ? 'w-full flex-shrink-0 overflow-visible p-3 pb-4 lg:hidden' : 'hidden'}><div className="space-y-3"><AccountPanel account={accountData} activeProviderSelection={activeProviderSelection} /><DerivCashierLinks /></div></aside>

      <aside className="hidden w-[clamp(300px,28vw,420px)] min-w-0 flex-shrink-0 flex-col overflow-hidden border-l border-shafx-border bg-shafx-surface/50 lg:flex">
        <div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-shafx-border px-3"><div><div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-shafx-textMuted">Workspace panel</div><div className="text-sm font-semibold">{dock === 'insights' ? 'Market intelligence' : dock === 'liquidity' ? 'Liquidity & depth' : 'Deriv account'}</div></div><PanelRight className="h-4 w-4 text-shafx-textMuted" /></div>
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
