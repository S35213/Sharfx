import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TerminalProvider, useTerminal } from './app/TerminalContext'
import { ErrorBoundary } from './app/ErrorBoundary'
import { TopNav } from './components/layout/TopNav'
import { MobileNav, type MobileNavTab } from './components/layout/MobileNav'
import { DerivLiveControl } from './components/market/DerivLiveControl'
import { CandlestickChart } from './components/chart/CandlestickChart'
import { analyzeCurrentSetup, buildAIChartAnnotations } from './components/chart/buildAIChartAnnotations'
import { Watchlist } from './components/watchlist/Watchlist'
import { MarketAnalysisPanel } from './components/analysis/MarketAnalysis'
import { AIAssistantPanel } from './components/ai/AIAssistantPanel'
import { TradingAgentPanel } from './components/ai/TradingAgentPanel'
import { BacktestPanel } from './components/backtest/BacktestPanel'
import { ReplayPanel } from './components/backtest/ReplayPanel'
import { PerformancePanel } from './components/performance/PerformancePanel'
import { TradingJournalPanel } from './components/performance/TradingJournalPanel'
import { OrderPanel } from './components/order/OrderPanel'
import { AccountPanel } from './components/account/AccountPanel'
import { TradesPanel } from './components/trades/TradesPanel'
import { Toast, type ToastMessage } from './components/common/Toast'
import { marketDataSource } from './data/createMarketDataSource'
import { getConversionRate } from './data/mock/symbols'
import { submitSimulatedOrder } from './engine/simulator/submitSimulatedOrder'
import { closeSimulatedPosition, markSimulatedPosition } from './engine/simulator/positionManager'
import type { AccountData, AIAnalysis, MarketAnalysis, MarketPair, OHLCV, SimulatedOrderDraft, SymbolSpec, Timeframe, TradeOrder } from './types'

const TerminalContent: React.FC = () => {
  const { selectedSymbol, setSelectedSymbol, timeframe, setTimeframe } = useTerminal()
  const [currentPrice, setCurrentPrice] = useState(1.08542)
  const [candles, setCandles] = useState<OHLCV[]>([])
  const [liveCandles, setLiveCandles] = useState<OHLCV[]>([])
  const [liveMarketActive, setLiveMarketActive] = useState(false)
  const [replayCount, setReplayCount] = useState(0)
  const [mobileTab, setMobileTab] = useState<MobileNavTab>('market')
  const [accountData, setAccountData] = useState<AccountData | null>(null)
  const [symbolSpec, setSymbolSpec] = useState<SymbolSpec | null>(null)
  const [watchlist, setWatchlist] = useState<MarketPair[]>([])
  const [marketAnalysis, setMarketAnalysis] = useState<MarketAnalysis | null>(null)
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null)
  const [openPositions, setOpenPositions] = useState<TradeOrder[]>([])
  const [pendingOrders, setPendingOrders] = useState<TradeOrder[]>([])
  const [tradeHistory, setTradeHistory] = useState<TradeOrder[]>([])
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const accountInitialized = useRef(false)
  const simulatorInitialized = useRef(false)
  const toastId = useRef(0)
  const pushToast = useCallback((text: string) => { toastId.current += 1; setToast({ id: toastId.current, text }) }, [])

  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      try {
        const [wl, acc, spec, cands, ma, ai, positions, pending, history] = await Promise.all([marketDataSource.getWatchlist(), marketDataSource.getAccountData(), marketDataSource.getSymbolSpec(selectedSymbol), marketDataSource.getCandles(selectedSymbol, timeframe), marketDataSource.getMarketAnalysis(selectedSymbol), marketDataSource.getAIAnalysis(selectedSymbol), marketDataSource.getOpenPositions(), marketDataSource.getPendingOrders(), marketDataSource.getTradeHistory()])
        if (cancelled) return
        setWatchlist(wl); setSymbolSpec(spec); setCandles(cands); setLiveCandles([]); setReplayCount(cands.length); setMarketAnalysis(ma); setAiAnalysis(ai)
        if (!accountInitialized.current) { accountInitialized.current = true; setAccountData(acc) }
        if (!simulatorInitialized.current) { simulatorInitialized.current = true; setOpenPositions(positions); setPendingOrders(pending); setTradeHistory(history) }
        const pair = wl.find((p) => p.symbol === selectedSymbol)
        if (pair) setCurrentPrice(pair.price)
      } catch (err) { if (!cancelled) pushToast(err instanceof Error ? err.message : 'Unable to load market data.') }
    }
    void load()
    return () => { cancelled = true }
  }, [pushToast, selectedSymbol, timeframe])

  const visibleCandles = useMemo(() => replayCount > 0 && replayCount < candles.length ? candles.slice(0, replayCount) : candles, [candles, replayCount])
  const chartCandles = liveMarketActive && liveCandles.length > 0 ? liveCandles : visibleCandles
  const replayActive = !liveMarketActive && visibleCandles.length > 0 && visibleCandles.length < candles.length
  const displayPrice = liveMarketActive && liveCandles.length > 0 ? (liveCandles[liveCandles.length - 1]?.close ?? currentPrice) : replayActive ? (visibleCandles[visibleCandles.length - 1]?.close ?? currentPrice) : currentPrice
  const conversionRate = symbolSpec ? getConversionRate(symbolSpec.quoteCurrency, accountData?.currency ?? 'USD') : undefined
  const chartAnnotations = useMemo(() => buildAIChartAnnotations(selectedSymbol, chartCandles), [selectedSymbol, chartCandles])
  const aiSetup = useMemo(() => analyzeCurrentSetup(selectedSymbol, chartCandles)?.preferredSetup ?? null, [selectedSymbol, chartCandles])
  const reviewAISetup = useCallback((): void => { document.getElementById('order-ticket')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [])
  const handleLiveUpdate = useCallback((nextCandles: OHLCV[], price: number): void => { setLiveCandles(nextCandles); setCurrentPrice(price) }, [])
  const handleLiveActiveChange = useCallback((active: boolean): void => { setLiveMarketActive(active); if (!active) setLiveCandles([]) }, [])

  const handleOrderSubmit = useCallback((draft: SimulatedOrderDraft): void => {
    try { const order = submitSimulatedOrder(draft); setOpenPositions((prev) => [...prev, order]); pushToast(`Simulated ${order.type} ${order.lotSize.toFixed(2)} lots ${order.symbol} placed (${order.id}).`) }
    catch (err) { pushToast(err instanceof Error ? err.message : 'Unable to place simulated order.') }
  }, [pushToast])

  const handleClosePosition = useCallback(async (id: string): Promise<void> => {
    const order = openPositions.find((item) => item.id === id)
    if (!order || !accountData) return
    try {
      const [spec, wl] = await Promise.all([marketDataSource.getSymbolSpec(order.symbol), marketDataSource.getWatchlist()])
      const pair = wl.find((item) => item.symbol === order.symbol)
      const exitPrice = order.symbol === selectedSymbol ? displayPrice : pair?.price
      if (!exitPrice) throw new Error('No simulated market price is available for this position.')
      const rate = getConversionRate(spec.quoteCurrency, accountData.currency)
      const closed = closeSimulatedPosition(order, { exitPrice, conversionRate: rate }, spec)
      setOpenPositions((prev) => prev.filter((item) => item.id !== id)); setTradeHistory((prev) => [closed, ...prev])
      setAccountData((prev) => prev ? { ...prev, balance: Number((prev.balance + (closed.profit ?? 0)).toFixed(2)), equity: Number((prev.balance + (closed.profit ?? 0)).toFixed(2)), floatingPL: 0, freeMargin: Number((prev.freeMargin + (closed.profit ?? 0)).toFixed(2)) } : prev)
      pushToast(`Simulated ${closed.type} ${closed.symbol} closed at ${exitPrice.toFixed(spec.pricePrecision)} (${closed.profit !== undefined && closed.profit >= 0 ? '+' : ''}${closed.profit?.toFixed(2)} ${accountData.currency}).`)
    } catch (err) { pushToast(err instanceof Error ? err.message : 'Unable to close simulated position.') }
  }, [accountData, displayPrice, openPositions, pushToast, selectedSymbol])

  useEffect(() => {
    if (!symbolSpec || !accountData || openPositions.length === 0) return
    const conversion = getConversionRate(symbolSpec.quoteCurrency, accountData.currency)
    const updated = openPositions.map((position) => position.symbol === selectedSymbol ? markSimulatedPosition(position, { currentPrice, symbolSpec, conversionRate: conversion }) : position)
    const newlyClosed = updated.filter((position, index) => openPositions[index].status === 'open' && position.status === 'closed')
    if (newlyClosed.length > 0) {
      setOpenPositions(updated.filter((position) => position.status === 'open')); setTradeHistory((prev) => [...newlyClosed, ...prev])
      const realized = newlyClosed.reduce((sum, position) => sum + (position.profit ?? 0), 0)
      setAccountData((prev) => prev ? { ...prev, balance: Number((prev.balance + realized).toFixed(2)), equity: Number((prev.balance + realized).toFixed(2)), floatingPL: 0, freeMargin: Number((prev.freeMargin + realized).toFixed(2)) } : prev)
      newlyClosed.forEach((position) => pushToast(`Simulated ${position.type} ${position.symbol} closed automatically at its ${position.profit !== undefined && position.profit >= 0 ? 'target' : 'stop'}.`))
    } else if (updated.some((position, index) => position.profit !== openPositions[index].profit)) setOpenPositions(updated)
  }, [accountData, currentPrice, openPositions, pushToast, selectedSymbol, symbolSpec])

  if (!accountData || !symbolSpec || !marketAnalysis || !aiAnalysis) return <div className="flex h-full items-center justify-center bg-shafx-bg text-shafx-text">Loading SHAFX Terminal...</div>
  const activePosition = openPositions.find((position) => position.symbol === selectedSymbol && position.status === 'open') ?? null
  const showMarket = mobileTab === 'market'
  const showAgent = mobileTab === 'agent'
  const showHistory = mobileTab === 'history'
  const showAccount = mobileTab === 'account'
  const liveControl = <DerivLiveControl symbol={selectedSymbol} timeframe={timeframe as Timeframe} onUpdate={handleLiveUpdate} onActiveChange={handleLiveActiveChange} />
  return <div className="flex h-full flex-col overflow-hidden bg-shafx-bg text-shafx-text"><TopNav symbol={selectedSymbol} price={displayPrice} pricePrecision={symbolSpec.pricePrecision} timeframe={timeframe} onTimeframeChange={setTimeframe} /><main className="flex flex-1 flex-col overflow-y-auto pb-16 lg:flex-row lg:overflow-hidden lg:pb-0"><aside className={`${showMarket || showAccount ? '' : 'hidden'} flex w-full flex-shrink-0 flex-col gap-4 border-b border-shafx-border p-3 lg:flex lg:w-56 lg:border-b-0 lg:border-r lg:overflow-y-auto`}><div className="h-64 flex-shrink-0 lg:h-72"><Watchlist pairs={watchlist} selectedPair={selectedSymbol} onSelectPair={setSelectedSymbol} /></div><AccountPanel account={accountData} /></aside><section className={`${showMarket ? '' : 'hidden'} flex min-w-0 flex-1 flex-col lg:flex`}><div className="flex h-11 flex-shrink-0 items-center justify-between gap-3 border-b border-shafx-border px-4"><span className="text-xs text-shafx-textMuted">{liveMarketActive ? 'Deriv public market data' : 'SHAFX demo market data'}</span>{liveControl}</div><div className="min-h-[360px] flex-1 p-2 sm:p-3 lg:min-h-0"><CandlestickChart data={chartCandles} annotations={chartAnnotations} height="100%" /></div><div className="h-48 flex-shrink-0 border-t border-shafx-border p-3 lg:h-52"><TradesPanel openPositions={openPositions} pendingOrders={pendingOrders} tradeHistory={tradeHistory} currentPrice={displayPrice} selectedSymbol={selectedSymbol} onClosePosition={handleClosePosition} /></div></section><aside className={`${showAgent ? '' : 'hidden'} flex w-full flex-shrink-0 flex-col gap-4 p-4 lg:flex lg:w-72 lg:overflow-y-auto`}><TradingAgentPanel symbol={selectedSymbol} timeframe={timeframe} candles={chartCandles} currentPrice={displayPrice} activePosition={activePosition} tradeHistory={tradeHistory} onReviewSetup={reviewAISetup} /><AIAssistantPanel symbol={selectedSymbol} timeframe={timeframe} candles={chartCandles} setup={aiSetup} onReviewSetup={reviewAISetup} /><OrderPanel symbol={selectedSymbol} currentPrice={displayPrice} accountBalance={accountData.balance} accountCurrency={accountData.currency} symbolSpec={symbolSpec} conversionRate={conversionRate} onSubmitOrder={handleOrderSubmit} aiSetup={aiSetup} /></aside><aside className={`${showHistory ? '' : 'hidden'} flex w-full flex-shrink-0 flex-col gap-4 p-4 lg:hidden`}><TradesPanel openPositions={openPositions} pendingOrders={pendingOrders} tradeHistory={tradeHistory} currentPrice={displayPrice} selectedSymbol={selectedSymbol} onClosePosition={handleClosePosition} /><PerformancePanel tradeHistory={tradeHistory} currency={accountData.currency} /><TradingJournalPanel tradeHistory={tradeHistory} currency={accountData.currency} /></aside><aside className={`${showAccount ? '' : 'hidden'} flex w-full flex-shrink-0 flex-col gap-4 p-4 lg:hidden`}><AccountPanel account={accountData} /><BacktestPanel symbol={selectedSymbol} candles={candles} symbolSpec={symbolSpec} initialBalance={accountData.balance} accountCurrency={accountData.currency} conversionRate={conversionRate} /><ReplayPanel candles={candles} replayCount={replayCount || candles.length} onReplayCountChange={setReplayCount} /><MarketAnalysisPanel analysis={marketAnalysis} pricePrecision={symbolSpec.pricePrecision} /></aside><aside className="hidden w-full flex-shrink-0 flex-col gap-4 border-l border-shafx-border p-3 lg:flex lg:w-72 lg:overflow-y-auto"><MarketAnalysisPanel analysis={marketAnalysis} pricePrecision={symbolSpec.pricePrecision} /><TradingAgentPanel symbol={selectedSymbol} timeframe={timeframe} candles={chartCandles} currentPrice={displayPrice} activePosition={activePosition} tradeHistory={tradeHistory} onReviewSetup={reviewAISetup} /><AIAssistantPanel symbol={selectedSymbol} timeframe={timeframe} candles={chartCandles} setup={aiSetup} onReviewSetup={reviewAISetup} /><ReplayPanel candles={candles} replayCount={replayCount || candles.length} onReplayCountChange={setReplayCount} /><BacktestPanel symbol={selectedSymbol} candles={candles} symbolSpec={symbolSpec} initialBalance={accountData.balance} accountCurrency={accountData.currency} conversionRate={conversionRate} /><PerformancePanel tradeHistory={tradeHistory} currency={accountData.currency} /><TradingJournalPanel tradeHistory={tradeHistory} currency={accountData.currency} /><div id="order-ticket"><OrderPanel symbol={selectedSymbol} currentPrice={displayPrice} accountBalance={accountData.balance} accountCurrency={accountData.currency} symbolSpec={symbolSpec} conversionRate={conversionRate} onSubmitOrder={handleOrderSubmit} aiSetup={aiSetup} /></div></aside></main><MobileNav activeTab={mobileTab} onChange={setMobileTab} /><footer className="hidden items-center justify-between border-t border-shafx-border bg-shafx-surface px-4 py-1.5 text-[10px] text-shafx-textMuted lg:flex"><span>SHAFX Terminal v0.1.0 • Simulator Mode • No real money trading</span><span className="hidden sm:inline">{replayActive ? 'Visual replay — simulated candles only' : 'Demo data only — not financial advice'}</span></footer><Toast toast={toast} onDismiss={() => setToast(null)} /></div>
}

const App: React.FC = () => <ErrorBoundary><TerminalProvider><TerminalContent /></TerminalProvider></ErrorBoundary>
export default App