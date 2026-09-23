import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Bot, Play, Square } from 'lucide-react'
import { analyzeLiquidity } from '../../engine/liquidity'
import { calculatePositionProfit } from '../../engine/simulator/positionManager'
import { analyzeMarketStructure, findSwingPoints } from '../../engine/marketStructure'
import { analyzeSetup } from '../../engine/setup'
import { analyzeSupportResistance } from '../../engine/supportResistance'
import { buildTradingContext } from '../../engine/ai/context'
import { analyzeMultiTimeframeBias, buildAgentResearch, executeSimulationTrade, learnFromTrades, useMultiTimeframeCandles } from '../../engine/agent'
import { BOT_CYCLES_PER_UNIT, BOT_PLANS, type BotPlan } from '../../engine/agent/botPlans'
import type { OHLCV, SymbolSpec, Timeframe, TradeOrder } from '../../types'

interface Props {
  symbol: string
  timeframe: Timeframe
  candles: OHLCV[]
  currentPrice: number
  activePosition: TradeOrder | null
  tradeHistory: TradeOrder[]
  accountBalance?: number
  accountCurrency?: string
  symbolSpec?: SymbolSpec | null
  conversionRate?: number
  botPlan?: BotPlan
  botOrderIds?: string[]
  onBotOrder?: (order: TradeOrder) => void
  onBotClose?: (id: string, exitPrice?: number) => void | Promise<TradeOrder | null>
  onBotRunningChange?: (running: boolean) => void
  onReviewSetup?: (setup?: import('../../engine/setup/types').SetupCandidate | null) => void
  scanM1Candles?: OHLCV[]
  botAutostartKey?: string
}

type RiskMode = 'SAFE' | 'NORMAL' | 'RISK'
const riskModes: Record<RiskMode, { label: string; percent: number; description: string }> = {
  SAFE: { label: 'Safe', percent: 0.25, description: 'Smallest simulated risk' },
  NORMAL: { label: 'Normal', percent: 0.5, description: 'Balanced simulated risk' },
  RISK: { label: 'Risk', percent: 1, description: 'Higher simulated risk' },
}
type Phase = 'READY' | 'ANALYZING' | 'RUNNING'
const SCAN_TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1']
const TIMEFRAME_SCAN_BONUS: Record<Timeframe, number> = { M1: 18, M5: 14, M15: 10, M30: 5, H1: 2, H4: 0, D1: -1, W1: -2 }
const BOT_CYCLE_SECONDS = 10 as const
const BOT_RESULT_DELAY_MS = BOT_CYCLE_SECONDS * 1000
const BOT_START_DELAY_MS = 1000 as const
const BOT_RESULT_DISPLAY_MS = 1000 as const

const buildScanCandidates = (
  frames: Partial<Record<Timeframe, OHLCV[]>>,
  symbol: string,
  currentPrice: number,
) => {
  const qualityWeight: Record<'weak' | 'moderate' | 'strong', number> = { weak: 1, moderate: 2, strong: 3 }
  return SCAN_TIMEFRAMES.flatMap((scanTimeframe) => {
    const frameCandles = frames[scanTimeframe] ?? []
    if (frameCandles.length < 5) return []
    const swings = findSwingPoints(frameCandles, 2)
    const structure = analyzeMarketStructure(frameCandles, 2)
    const tolerance = symbol.includes('JPY') ? 0.1 : 0.001
    const supportResistance = analyzeSupportResistance(frameCandles, tolerance, swings)
    const liquidity = analyzeLiquidity(frameCandles, swings, tolerance)
    const framePrice = frameCandles[frameCandles.length - 1]?.close ?? currentPrice
    const setupResult = analyzeSetup({ currentPrice: framePrice, structure, supportResistance, liquidity })
    const preferredSetup = setupResult.preferredSetup
    if (!preferredSetup || preferredSetup.status !== 'candidate') return []
    const context = buildTradingContext(symbol, scanTimeframe, frameCandles, structure, supportResistance, liquidity, setupResult)
    return [{
      timeframe: scanTimeframe,
      setup: preferredSetup,
      context,
      score: preferredSetup.confidence + qualityWeight[preferredSetup.quality] * 5 + TIMEFRAME_SCAN_BONUS[scanTimeframe],
    }]
  }).sort((a, b) => b.score - a.score)
}
const BOT_RISK_MODE: RiskMode = 'SAFE'
const buildFastBotCandidate = (
  frames: Partial<Record<Timeframe, OHLCV[]>>,
  symbol: string,
  currentPrice: number,
) => {
  const all = buildScanCandidates(frames, symbol, currentPrice)
  const fast = all.filter((candidate) => candidate.timeframe === 'M1' || candidate.timeframe === 'M5' || candidate.timeframe === 'M15')
  if (fast.length === 0) return all[0] ?? null
  const m1 = frames.M1 ?? []
  const latest = m1[m1.length - 1]?.close
  const previous = m1[m1.length - 2]?.close
  const microDirection = typeof latest === 'number' && typeof previous === 'number' ? Math.sign(latest - previous) : 0
  return [...fast]
    .map((candidate) => ({
      candidate,
      score: candidate.score + (
        microDirection > 0 && candidate.setup.direction === 'BUY'
          ? 28
          : microDirection < 0 && candidate.setup.direction === 'SELL'
            ? 28
            : microDirection === 0
              ? 0
              : -18
      ),
    }))
    .sort((a, b) => b.score - a.score)[0]?.candidate ?? fast[0]
}

interface CircularProgressProps {
  progress: number
  label: string
  value: string
}

function CircularProgress({ progress, label, value }: CircularProgressProps) {
  const bounded = Math.max(0, Math.min(100, progress))
  const radius = 27
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - bounded / 100)

  return (
    <section className="rounded-2xl border border-shafx-border bg-shafx-surface p-3.5 text-sm shadow-[0_14px_36px_rgba(0,0,0,.18)] sm:p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-shafx-accent/10 text-shafx-accent"><Bot className="h-5 w-5" /></div>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">SHAFX Bot</h2>
            <p className="mt-0.5 text-[10px] text-shafx-textMuted">Automated trading using the simulated market.</p>
          </div>
        </div>
        <span className={phase === 'RUNNING' ? 'flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-shafx-success/20 bg-shafx-success/5 px-2.5 text-[9px] font-semibold text-shafx-success' : phase === 'ANALYZING' ? 'flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-shafx-accent/20 bg-shafx-accent/5 px-2.5 text-[9px] font-semibold text-shafx-accent' : 'flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-shafx-border bg-shafx-bg px-2.5 text-[9px] font-semibold text-shafx-textMuted'}><Activity className="h-3 w-3" />{phase === 'ANALYZING' ? 'Checking' : phase === 'RUNNING' ? 'Running' : 'Ready'}</span>
      </header>

      <div className="mt-3 rounded-xl border border-shafx-border bg-shafx-bg p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-shafx-textMuted">Trade size</div>
            <div className="mt-1 text-sm font-semibold">Lot size</div>
          </div>
          <span className="text-[9px] text-shafx-textMuted">5 trades = 1 unit</span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={() => { const next = Math.max(symbolSpec?.minLotSize ?? 0.01, Number((parsedLotSize - (symbolSpec?.lotStep ?? 0.01)).toFixed(4))); setLotSize(String(next)) }} className="min-h-11 min-w-11 rounded-xl border border-shafx-border bg-shafx-surface text-base font-semibold">−</button>
          <label className="flex-1">
            <span className="sr-only">Bot lot size</span>
            <input type="number" inputMode="decimal" step={symbolSpec?.lotStep ?? 0.01} min={symbolSpec?.minLotSize ?? 0.01} max={symbolSpec?.maxLotSize ?? 100} value={lotSize} onChange={(event) => setLotSize(event.target.value)} className="min-h-11 w-full rounded-xl border border-shafx-border bg-shafx-surface px-3 text-center font-mono text-sm focus:border-shafx-accent focus:outline-none" aria-label="Bot lot size" />
          </label>
          <button type="button" onClick={() => { const next = Math.min(symbolSpec?.maxLotSize ?? 100, Number((parsedLotSize + (symbolSpec?.lotStep ?? 0.01)).toFixed(4))); setLotSize(String(next)) }} className="min-h-11 min-w-11 rounded-xl border border-shafx-border bg-shafx-surface text-base font-semibold">+</button>
        </div>
      </div>

      {botDisplayedOrder && (
        <div className="mt-3 rounded-xl border border-shafx-success/25 bg-shafx-success/[0.035] p-3.5">
          <div className="flex items-center gap-3">
            <CircularProgress progress={Math.max(0, Math.min(100, ((BOT_RESULT_DELAY_MS - tradeSecondsLeft * 1000) / BOT_RESULT_DELAY_MS) * 100))} label="trade" value={Math.max(0, tradeSecondsLeft).toFixed(1) + 's'} />
            <div className="min-w-0 flex-1">
              <div className={botDisplayedOrder.type === 'BUY' ? 'text-lg font-bold text-shafx-success' : 'text-lg font-bold text-shafx-danger'}>{botDisplayedOrder.type} {botDisplayedOrder.lotSize.toFixed(2)} LOT</div>
              <div className="mt-1 text-[10px] text-shafx-textMuted">{botDisplayedOrder.symbol} • simulated trade</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-[9px]">
            <div className="rounded-lg border border-shafx-border bg-shafx-bg p-2"><span className="block text-shafx-textMuted">Entry</span><b className="font-mono">{botDisplayedOrder.entryPrice.toFixed(symbolSpec?.pricePrecision ?? 5)}</b></div>
            <div className="rounded-lg border border-shafx-danger/20 bg-shafx-danger/[0.04] p-2"><span className="block text-shafx-textMuted">Stop</span><b className="font-mono text-shafx-danger">{botDisplayedOrder.stopLoss?.toFixed(symbolSpec?.pricePrecision ?? 5) ?? '—'}</b></div>
            <div className="rounded-lg border border-shafx-success/20 bg-shafx-success/[0.04] p-2"><span className="block text-shafx-textMuted">Target</span><b className="font-mono text-shafx-success">{botDisplayedOrder.takeProfit?.toFixed(symbolSpec?.pricePrecision ?? 5) ?? '—'}</b></div>
          </div>
          <div className="mt-3 text-[9px] text-shafx-textMuted">The bot will settle this simulated trade automatically.</div>
        </div>
      )}

      {!botDisplayedOrder && autoTradingEnabled && (
        <div className="mt-3 rounded-xl border border-shafx-accent/20 bg-shafx-accent/[0.035] p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-shafx-text">{phase === 'ANALYZING' ? 'Checking the market…' : 'Watching for the next trade…'}</span>
            <span className="font-mono text-[9px] text-shafx-accent">{symbol}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-shafx-border"><div className="h-full rounded-full bg-shafx-accent transition-[width] duration-300" style={{ width: phase === 'ANALYZING' ? '42%' : '100%' }} /></div>
          <p className="mt-2 text-[9px] text-shafx-textMuted">The bot checks multiple timeframes automatically before opening a simulated trade.</p>
        </div>
      )}

      {lastResult && !botDisplayedOrder && (
        <div className={lastResult === 'WIN' ? 'mt-3 rounded-xl border border-shafx-success/25 bg-shafx-success/[0.055] px-3 py-2.5' : 'mt-3 rounded-xl border border-shafx-danger/25 bg-shafx-danger/[0.055] px-3 py-2.5'}>
          <div className="flex items-center justify-between gap-2">
            <span className={lastResult === 'WIN' ? 'font-semibold text-shafx-success' : 'font-semibold text-shafx-danger'}>{lastResult === 'WIN' ? 'Trade won' : 'Trade lost'}</span>
            <span className={lastResult === 'WIN' ? 'font-mono text-sm font-bold text-shafx-success' : 'font-mono text-sm font-bold text-shafx-danger'}>{(lastProfit ?? 0) >= 0 ? '+' : ''}{(lastProfit ?? 0).toFixed(2)} {accountCurrency}</span>
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2 text-[9px]">
        <div className="rounded-xl border border-shafx-border bg-shafx-bg px-2.5 py-2.5"><span className="block text-shafx-textMuted">Won</span><strong className="mt-0.5 block font-mono text-shafx-success">{wins}</strong></div>
        <div className="rounded-xl border border-shafx-border bg-shafx-bg px-2.5 py-2.5"><span className="block text-shafx-textMuted">Lost</span><strong className="mt-0.5 block font-mono text-shafx-danger">{losses}</strong></div>
        <div className="rounded-xl border border-shafx-border bg-shafx-bg px-2.5 py-2.5"><span className="block text-shafx-textMuted">Units</span><strong className="mt-0.5 block font-mono text-shafx-text">{cycleUnits}/{plan.maxDailyCycleUnits === null ? '∞' : plan.maxDailyCycleUnits}</strong></div>
      </div>

      <button type="button" disabled={!symbolSpec || phase === 'ANALYZING' || (!autoTradingEnabled && dailyLimitReached)} onClick={autoTradingEnabled ? stopAutomaticTrading : pendingUnitCompletion && !dailyLimitReached ? continueNextUnit : startAutomaticTrading} className={autoTradingEnabled ? 'mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-shafx-danger/30 bg-shafx-danger/10 px-3 text-[10px] font-semibold text-shafx-danger' : 'mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-shafx-accent to-shafx-primaryHover px-3 text-[10px] font-semibold text-white shadow-[0_8px_28px_rgba(124,92,252,.20)]'}>{autoTradingEnabled ? <Square className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />} {autoTradingEnabled ? 'Stop bot' : dailyLimitReached ? 'Daily limit reached' : pendingUnitCompletion ? 'Run next unit' : 'Start bot'}</button>

      <div className="mt-2 flex items-center justify-between text-[9px] text-shafx-textMuted">
        <span>{status}</span>
        <span className="font-mono">{symbol}</span>
      </div>
      <p className="mt-3 text-[9px] text-shafx-textMuted">Simulation only. The bot does not send broker orders.</p>
    </section>
  )
}
