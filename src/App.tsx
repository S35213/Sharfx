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
  const positionRefreshInFlight = useRef(false)
  const currentPriceForPositionsRef = useRef(currentPrice)
  const selectedSymbolForPositionsRef = useRef(selectedSymbol)
  const symbolSpecForPositionsRef = useRef<SymbolSpec | null>(symbolSpec)
  const watchlistForPositionsRef = useRef<MarketPair[]>([])
  const accountCurrencyForPositionsRef = useRef('USD')
  const accountReadyForPositionsRef = useRef(false)

  useEffect(() => {
    openPositionsRef.current = openPositions
    currentPriceForPositionsRef.current = displayPrice
    selectedSymbolForPositionsRef.current = selectedSymbol
    symbolSpecForPositionsRef.current = symbolSpec
    watchlistForPositionsRef.current = watchlist
    accountCurrencyForPositionsRef.current = accountData?.currency ?? 'USD'
    accountReadyForPositionsRef.current = Boolean(accountData)
  }, [accountData?.currency, displayPrice, openPositions, selectedSymbol, symbolSpec, watchlist])

  useEffect(() => {
    if (openPositions.length === 0 || positionRefreshInFlight.current) return
    const timer = window.setTimeout(async () => {
      if (positionRefreshInFlight.current || !accountReadyForPositionsRef.current) return
      const positions = openPositionsRef.current
      if (positions.length === 0) return

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
      }
    }, 250)
    return () => window.clearTimeout(timer)
  }, [accountData?.currency, displayPrice, openPositions.length, pushToast, selectedSymbol, symbolSpec, watchlist])


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
