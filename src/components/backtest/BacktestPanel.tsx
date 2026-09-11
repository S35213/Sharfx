import { useMemo, useState } from 'react'
import { BarChart3, Play, RotateCcw } from 'lucide-react'
import { analyzeLiquidity } from '../../engine/liquidity'
import { analyzeMarketStructure, findSwingPoints } from '../../engine/marketStructure'
import { analyzeSetup } from '../../engine/setup'
import { analyzeSupportResistance } from '../../engine/supportResistance'
import { runBacktest, type BacktestResult } from '../../engine/backtest'
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

  const maxRange = Math.max(20, candles.length - 1)
  const effectiveRange = Math.min(range, maxRange)

  const signalProvider = useMemo(() => (history: OHLCV[], index: number) => {
    if (history.length < 8) return null
    const currentPrice = history[history.length - 1]?.close
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null
    const swings = findSwingPoints(history, 2)
    const structure = analyzeMarketStructure(history, 2)
    const supportResistance = analyzeSupportResistance(history, toleranceFor(symbol), swings)
    const liquidity = analyzeLiquidity(history, swings, toleranceFor(symbol))
    const setup = analyzeSetup({ currentPrice, structure, supportResistance, liquidity }).preferredSetup
    if (!setup || setup.status !== 'candidate') return null
    const lotSize = Math.max(symbolSpec.minLotSize, Math.min(symbolSpec.maxLotSize, Number((Math.floor((0.01 - symbolSpec.minLotSize) / symbolSpec.lotStep) * symbolSpec.lotStep + symbolSpec.minLotSize).toFixed(8))))
    if (!Number.isFinite(lotSize) || lotSize < symbolSpec.minLotSize) return null
    return { side: setup.direction, stopLoss: setup.stopLoss, takeProfit: setup.takeProfit, lotSize }
  }, [symbol, symbolSpec])

  const run = (): void => {
    if (candles.length < 20 || running) return
    setRunning(true)
    try {
      const startIndex = Math.max(1, candles.length - effectiveRange)
      const backtest = runBacktest(candles, { initialBalance, accountCurrency, symbolSpec, conversionRate, startIndex, endIndex: candles.length - 1 }, signalProvider)
      setResult(backtest)
    } finally {
      setRunning(false)
    }
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
        <button type="button" onClick={run} disabled={running || candles.length < 20} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded bg-shafx-primary px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          <Play className="h-3.5 w-3.5" />{running ? 'Running replay…' : 'Run strategy replay'}
        </button>
      </div>

      {result ? <div className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Net profit" value={`${result.netProfit >= 0 ? '+' : ''}${result.netProfit.toFixed(2)}`} />
          <Metric label="Return" value={`${result.returnPercent.toFixed(2)}%`} />
          <Metric label="Win rate" value={`${result.winRate.toFixed(1)}%`} />
          <Metric label="Drawdown" value={result.maxDrawdown.toFixed(2)} />
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-shafx-textMuted">
          <span>Trades <strong className="text-shafx-text">{result.totalTrades}</strong></span>
          <span>Profit factor <strong className="text-shafx-text">{result.profitFactor === null ? '—' : result.profitFactor.toFixed(2)}</strong></span>
          <span>Wins <strong className="text-shafx-text">{result.winningTrades}</strong></span>
          <span>Losses <strong className="text-shafx-text">{result.losingTrades}</strong></span>
        </div>
        <div className="flex items-center justify-between border-t border-shafx-border pt-2 text-[10px] text-shafx-textMuted">
          <span>{symbol} • {result.trades.length} simulated trades</span>
          <button type="button" onClick={() => setResult(null)} className="inline-flex min-h-9 items-center gap-1 rounded px-2 text-shafx-text hover:bg-shafx-bg" aria-label="Clear replay results"><RotateCcw className="h-3 w-3" />Clear</button>
        </div>
      </div> : <p className="mt-3 text-[11px] text-shafx-textMuted">Run a replay to see how the current rule set behaved on the selected simulated candles.</p>}
      <p className="mt-3 text-[10px] text-shafx-textMuted">SIMULATED — NOT FINANCIAL ADVICE. Past replay results do not predict future performance.</p>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded border border-shafx-border bg-shafx-bg p-2"><span className="block text-[10px] text-shafx-textMuted">{label}</span><strong className="mt-1 block font-mono text-xs text-shafx-text">{value}</strong></div>
}
