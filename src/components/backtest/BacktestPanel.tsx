import { useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, ChevronDown, Play, RotateCcw, TrendingDown, TrendingUp } from 'lucide-react'
import { analyzeLiquidity } from '../../engine/liquidity'
import { analyzeMarketStructure, findSwingPoints } from '../../engine/marketStructure'
import { analyzeSetup } from '../../engine/setup'
import { analyzeSupportResistance } from '../../engine/supportResistance'
import { runBacktest, type BacktestResult, type BacktestTrade } from '../../engine/backtest'
import type { OHLCV, SymbolSpec } from '../../types'

interface Props {
  symbol: string
  candles: OHLCV[]
  symbolSpec: SymbolSpec
  initialBalance: number
  accountCurrency: string
  conversionRate?: number
}

const toleranceFor = (symbol: string): number => symbol.includes('JPY') ? 0.1 : 0.001

export function BacktestPanel({ symbol, candles, symbolSpec, initialBalance, accountCurrency, conversionRate }: Props) {
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [running, setRunning] = useState(false)
  const [range, setRange] = useState(120)
  const [showTrades, setShowTrades] = useState(false)
  const [runMessage, setRunMessage] = useState('Ready')
  const runTimer = useRef<number | null>(null)
  useEffect(() => () => { if (runTimer.current) window.clearTimeout(runTimer.current) }, [])

  const maxRange = Math.max(20, candles.length - 1)
  const effectiveRange = Math.min(range, maxRange)

  const signalProvider = useMemo(() => (history: OHLCV[]) => {
    if (history.length < 8) return null
    const currentPrice = history[history.length - 1]?.close
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null
    const swings = findSwingPoints(history, 2)
    const structure = analyzeMarketStructure(history, 2)
    const supportResistance = analyzeSupportResistance(history, toleranceFor(symbol), swings)
    const liquidity = analyzeLiquidity(history, swings, toleranceFor(symbol))
    const setup = analyzeSetup({ currentPrice, structure, supportResistance, liquidity }).preferredSetup
    if (!setup || setup.status !== 'candidate') return null
    const baseLot = 0.01
    const steps = Math.max(0, Math.floor((baseLot - symbolSpec.minLotSize) / symbolSpec.lotStep))
    const lotSize = Math.max(symbolSpec.minLotSize, Math.min(symbolSpec.maxLotSize, Number((symbolSpec.minLotSize + steps * symbolSpec.lotStep).toFixed(8))))
    if (!Number.isFinite(lotSize)) return null
    return { side: setup.direction, stopLoss: setup.stopLoss, takeProfit: setup.takeProfit, lotSize }
  }, [symbol, symbolSpec])

  const analytics = useMemo(() => {
    if (!result) return null
    let balance = result.initialBalance
    let peak = balance
    let maxDrawdownAmount = 0
    const curve = [balance]
    for (const trade of result.trades) {
      balance += trade.profit
      peak = Math.max(peak, balance)
      maxDrawdownAmount = Math.max(maxDrawdownAmount, peak - balance)
      curve.push(balance)
    }
    const averageTrade = result.totalTrades ? result.netProfit / result.totalTrades : 0
    const maxDrawdownPercent = peak > 0 ? (maxDrawdownAmount / peak) * 100 : 0
    return { curve, averageTrade, maxDrawdownAmount, maxDrawdownPercent }
  }, [result])

  const averageRR = useMemo(() => {
    if (!result || result.trades.length === 0) return null
    const total = result.trades.reduce((sum, trade) => {
      const risk = Math.abs(trade.entryPrice - trade.stopLoss)
      const reward = Math.abs(trade.takeProfit - trade.entryPrice)
      return sum + (risk > 0 ? reward / risk : 0)
    }, 0)
    return total / result.trades.length
  }, [result])

  const run = (): void => {
    if (candles.length < 20 || running) return
    setRunning(true)
    setResult(null)
    setShowTrades(false)
    setRunMessage('Scanning historical structure, liquidity and setups…')
    if (runTimer.current) window.clearTimeout(runTimer.current)
    runTimer.current = window.setTimeout(() => {
      try {
        const startIndex = Math.max(1, candles.length - effectiveRange)
        const backtest = runBacktest(candles, { initialBalance, accountCurrency, symbolSpec, conversionRate, startIndex, endIndex: candles.length - 1 }, signalProvider)
        setResult(backtest)
        setRunMessage(backtest.totalTrades === 0 ? 'Replay completed • no qualifying trades in this window.' : 'Replay completed • results updated.')
      } catch (error) {
        setRunMessage(error instanceof Error ? 'Replay failed • ' + error.message : 'Replay failed.')
      } finally {
        setRunning(false)
        runTimer.current = null
      }
    }, 320)
  }

  return (
    <section className="rounded-lg border border-shafx-border bg-shafx-surface p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-shafx-text"><BarChart3 className="h-4 w-4 text-shafx-primary" /> Strategy replay</h3>
          <p className="mt-1 text-[11px] text-shafx-textMuted">Replay the agent's rules on simulated historical candles. No live orders are created.</p>
        </div>
        <span className="rounded border border-shafx-border px-2 py-1 text-[10px] text-shafx-textMuted">DEMO</span>
      </div>

      <div className="mt-3 rounded border border-shafx-border bg-shafx-bg p-3">
        <div className="flex items-center justify-between text-xs">
          <label htmlFor="backtest-range" className="text-shafx-textMuted">Replay window</label>
          <span className="font-mono text-shafx-text">{effectiveRange} candles</span>
        </div>
        <input id="backtest-range" type="range" min="20" max={maxRange} value={effectiveRange} onChange={(event) => setRange(Number(event.target.value))} className="mt-3 w-full" aria-label="Replay window in candles" />
        <button type="button" onClick={run} disabled={running || candles.length < 20} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-shafx-primary px-3 py-2 text-xs font-semibold text-white transition-transform active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-50">
          <Play className={running ? 'h-3.5 w-3.5 animate-pulse' : 'h-3.5 w-3.5'} />{running ? 'Running replay…' : 'Run strategy replay'}
        </button>
        <p className="mt-2 text-[9px] text-shafx-textMuted">{runMessage}</p>
      </div>

      {result && analytics ? <div className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Net profit" value={`${result.netProfit >= 0 ? '+' : ''}${result.netProfit.toFixed(2)}`} />
          <Metric label="Return" value={`${result.returnPercent.toFixed(2)}%`} />
          <Metric label="Win rate" value={`${result.winRate.toFixed(1)}%`} />
          <Metric label="Drawdown" value={`${result.maxDrawdown.toFixed(2)} (${analytics.maxDrawdownPercent.toFixed(1)}%)`} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Final balance" value={result.finalBalance.toFixed(2)} />
          <Metric label="Avg R:R" value={averageRR === null ? '—' : `${averageRR.toFixed(2)}:1`} />
          <Metric label="Avg trade" value={`${analytics.averageTrade >= 0 ? '+' : ''}${analytics.averageTrade.toFixed(2)}`} />
          <Metric label="Profit factor" value={result.profitFactor === null ? '—' : result.profitFactor.toFixed(2)} />
        </div>

        <div className="rounded border border-shafx-border bg-shafx-bg p-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-semibold text-shafx-text">Equity curve</h4>
              <p className="mt-1 text-[10px] text-shafx-textMuted">Balance progression across completed simulated trades.</p>
            </div>
            <span className="font-mono text-[10px] text-shafx-textMuted">{result.finalBalance.toFixed(2)} {accountCurrency}</span>
          </div>
          <EquityCurve values={analytics.curve} />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-shafx-textMuted">
            <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" />Start {result.initialBalance.toFixed(2)}</span>
            <span className="flex items-center gap-1"><TrendingDown className="h-3 w-3" />Max drawdown {analytics.maxDrawdownAmount.toFixed(2)}</span>
            <span>{result.trades.length} closed trades</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-shafx-textMuted">
          <span>Trades <strong className="text-shafx-text">{result.totalTrades}</strong></span>
          <span>Profit factor <strong className="text-shafx-text">{result.profitFactor === null ? '—' : result.profitFactor.toFixed(2)}</strong></span>
          <span>Wins <strong className="text-shafx-text">{result.winningTrades}</strong></span>
          <span>Losses <strong className="text-shafx-text">{result.losingTrades}</strong></span>
        </div>
        <button type="button" onClick={() => setShowTrades((visible) => !visible)} className="flex min-h-10 w-full items-center justify-between rounded border border-shafx-border bg-shafx-bg px-3 text-xs text-shafx-text hover:bg-shafx-surface" aria-expanded={showTrades}>
          <span>Trade log ({result.trades.length})</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${showTrades ? 'rotate-180' : ''}`} />
        </button>
        {showTrades && <TradeLog trades={result.trades} precision={symbolSpec.pricePrecision} currency={accountCurrency} />}
        <div className="flex items-center justify-between border-t border-shafx-border pt-2 text-[10px] text-shafx-textMuted">
          <span>{symbol} • {result.trades.length} simulated trades</span>
          <button type="button" onClick={() => { setResult(null); setShowTrades(false) }} className="inline-flex min-h-9 items-center gap-1 rounded px-2 text-shafx-text hover:bg-shafx-bg" aria-label="Clear replay results"><RotateCcw className="h-3 w-3" />Clear</button>
        </div>
      </div> : <p className="mt-3 text-[11px] text-shafx-textMuted">Run a replay to see how the current rule set behaved on the selected simulated candles.</p>}
      <p className="mt-3 text-[10px] text-shafx-textMuted">SIMULATED — NOT FINANCIAL ADVICE. Past replay results do not predict future performance.</p>
    </section>
  )
}

function EquityCurve({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="mt-3 h-20 rounded border border-dashed border-shafx-border" aria-label="Equity curve unavailable" />
  const width = 320
  const height = 88
  const min = Math.min(...values)
  const max = Math.max(...values)
  const spread = max - min || 1
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width
    const y = height - ((value - min) / spread) * (height - 8) - 4
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return <svg className="mt-3 h-20 w-full overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Simulated equity curve">
    <line x1="0" y1={height - 4} x2={width} y2={height - 4} stroke="currentColor" strokeOpacity="0.15" />
    <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" className="text-shafx-primary" />
  </svg>
}

function TradeLog({ trades, precision, currency }: { trades: BacktestTrade[]; precision: number; currency: string }) {
  if (trades.length === 0) return <p className="rounded border border-shafx-border bg-shafx-bg p-3 text-[11px] text-shafx-textMuted">No qualifying trades were produced in this replay window.</p>
  return <div className="overflow-x-auto rounded border border-shafx-border bg-shafx-bg"><table className="w-full min-w-[560px] text-left text-[10px]"><thead className="border-b border-shafx-border text-shafx-textMuted"><tr><th className="px-2 py-2 font-medium">Trade</th><th className="px-2 py-2 font-medium">Side</th><th className="px-2 py-2 font-medium">Entry</th><th className="px-2 py-2 font-medium">Exit</th><th className="px-2 py-2 font-medium">Result</th><th className="px-2 py-2 font-medium">Reason</th></tr></thead><tbody>{trades.map((trade) => <TradeRow key={trade.id} trade={trade} precision={precision} currency={currency} />)}</tbody></table></div>
}

function TradeRow({ trade, precision, currency }: { trade: BacktestTrade; precision: number; currency: string }) {
  const profit = trade.profit >= 0 ? `+${trade.profit.toFixed(2)}` : trade.profit.toFixed(2)
  return <tr className="border-b border-shafx-border last:border-0"><td className="px-2 py-2 font-mono text-shafx-text">{trade.id}</td><td className="px-2 py-2 text-shafx-text">{trade.side}</td><td className="px-2 py-2 font-mono text-shafx-text">{trade.entryPrice.toFixed(precision)}</td><td className="px-2 py-2 font-mono text-shafx-text">{trade.exitPrice.toFixed(precision)}</td><td className="px-2 py-2 font-mono text-shafx-text">{profit} {currency}</td><td className="px-2 py-2 text-shafx-textMuted">{trade.exitReason}</td></tr>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded border border-shafx-border bg-shafx-bg p-2"><span className="block text-[10px] text-shafx-textMuted">{label}</span><strong className="mt-1 block font-mono text-xs text-shafx-text">{value}</strong></div>
}
