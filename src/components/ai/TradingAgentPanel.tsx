import { useEffect, useMemo, useState } from 'react'
import { Brain, CheckCircle2, Shield, Eye, Activity, History, Search } from 'lucide-react'
import { analyzeLiquidity } from '../../engine/liquidity'
import { analyzeMarketStructure, findSwingPoints } from '../../engine/marketStructure'
import { analyzeSetup } from '../../engine/setup'
import { analyzeSupportResistance } from '../../engine/supportResistance'
import { buildTradingContext } from '../../engine/ai/context'
import { decideAgentAction, analyzeMultiTimeframeBias, monitorPosition, learnFromTrades, buildAgentResearch } from '../../engine/agent'
import { marketDataSource } from '../../data/mock/MockDataSource'
import type { AgentPermission } from '../../engine/agent'
import type { OHLCV, Timeframe, TradeOrder } from '../../types'

interface Props { symbol: string; timeframe: Timeframe; candles: OHLCV[]; currentPrice: number; activePosition: TradeOrder | null; tradeHistory: TradeOrder[]; onReviewSetup?: () => void }

export function TradingAgentPanel({ symbol, timeframe, candles, currentPrice, activePosition, tradeHistory, onReviewSetup }: Props) {
  const [permission, setPermission] = useState<AgentPermission>('USER_APPROVAL_REQUIRED')
  const [higherTimeframes, setHigherTimeframes] = useState<Partial<Record<Timeframe, OHLCV[]>>>({})
  const [contextStatus, setContextStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  useEffect(() => {
    let cancelled = false
    const loadHigherTimeframes = async (): Promise<void> => {
      try {
        const requested: Timeframe[] = ['H1', 'H4', 'D1']
        const entries = await Promise.all(requested.map(async (frame) => [frame, await marketDataSource.getCandles(symbol, frame)] as const))
        if (cancelled) return
        setHigherTimeframes(Object.fromEntries(entries)); setContextStatus('ready')
      } catch { if (!cancelled) setContextStatus('unavailable') }
    }
    void loadHigherTimeframes(); return () => { cancelled = true }
  }, [symbol])
  const tradingContext = useMemo(() => {
    const swings = findSwingPoints(candles, 2); const structure = analyzeMarketStructure(candles, 2); const tolerance = symbol.includes('JPY') ? 0.1 : 0.001
    const supportResistance = analyzeSupportResistance(candles, tolerance, swings); const liquidity = analyzeLiquidity(candles, swings, tolerance)
    const setup = analyzeSetup({ currentPrice: candles[candles.length - 1]?.close ?? Number.NaN, structure, supportResistance, liquidity })
    return buildTradingContext(symbol, timeframe, candles, structure, supportResistance, liquidity, setup)
  }, [candles, symbol, timeframe])
  const multiTimeframe = useMemo(() => analyzeMultiTimeframeBias({ ...higherTimeframes, [timeframe]: candles }), [candles, higherTimeframes, timeframe])
  const learning = useMemo(() => learnFromTrades(tradeHistory.filter((trade) => trade.status === 'closed').map((trade) => ({ symbol: trade.symbol, direction: trade.type, profit: trade.profit, riskRewardRatio: trade.riskRewardRatio }))), [tradeHistory])
  const research = useMemo(() => buildAgentResearch({ context: tradingContext, learning, multiTimeframe }), [learning, multiTimeframe, tradingContext])
  const decision = useMemo(() => decideAgentAction({ tradingContext, preferredSetup: tradingContext.setup.preferredSetup, hasOpenPosition: activePosition !== null, permission, multiTimeframe, learning, research }), [activePosition, learning, permission, research, tradingContext, multiTimeframe])
  const positionMonitor = useMemo(() => activePosition ? monitorPosition(activePosition, currentPrice, tradingContext.setup.preferredSetup) : null, [activePosition, currentPrice, tradingContext.setup.preferredSetup])
  return <div className="space-y-3 rounded-lg border border-shafx-primary/30 bg-shafx-surface p-4 text-sm">
    <div className="flex items-start justify-between gap-2"><div><h3 className="flex items-center gap-2 font-semibold"><Brain className="h-4 w-4 text-shafx-primary" /> Agent control</h3><p className="mt-1 text-[11px] text-shafx-textMuted">Simple controls on the surface; multi-timeframe analysis, research and simulator learning run underneath.</p></div><Shield className="h-4 w-4 text-shafx-primary" /></div>
    <div className="grid grid-cols-3 gap-1 rounded border border-shafx-border bg-shafx-bg p-1">{(['ANALYZE_ONLY', 'PREPARE_ONLY', 'USER_APPROVAL_REQUIRED'] as AgentPermission[]).map((item) => <button key={item} type="button" onClick={() => setPermission(item)} className={`min-h-11 rounded px-2 text-[10px] font-semibold ${permission === item ? 'bg-shafx-primary text-white' : 'text-shafx-textMuted'}`}>{item === 'ANALYZE_ONLY' ? 'Watch' : item === 'PREPARE_ONLY' ? 'Prepare' : 'Ask me'}</button>)}</div>
    <div className="rounded border border-shafx-border bg-shafx-bg p-3"><div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-shafx-textMuted"><Eye className="h-3 w-3" />State</div><div className="mt-1 text-lg font-semibold">{decision.state.replace(/_/g, ' ')}</div><p className="mt-1 text-xs text-shafx-textMuted">{decision.rationale}</p></div>
    <div className="rounded border border-shafx-border bg-shafx-bg p-3"><div className="flex items-center justify-between"><span className="text-[10px] uppercase tracking-wider text-shafx-textMuted">Research pass</span><span className="flex items-center gap-1 text-[10px] text-shafx-textMuted"><Search className="h-3 w-3" />{research.agreement.toFixed(0)}% agreement</span></div><p className="mt-1 text-xs text-shafx-textMuted">{research.conclusion}</p><div className="mt-2 text-[10px] text-shafx-textMuted">{research.evidence.length} evidence items reviewed{research.contradictions.length ? ` · ${research.contradictions.length} contradiction${research.contradictions.length === 1 ? '' : 's'}` : ''}</div></div>
    <div className="rounded border border-shafx-border bg-shafx-bg p-3"><div className="flex items-center justify-between"><span className="text-[10px] uppercase tracking-wider text-shafx-textMuted">Multi-timeframe read</span><span className="text-[10px] text-shafx-textMuted">{contextStatus === 'ready' ? `${multiTimeframe.confidence}% evidence` : contextStatus}</span></div><div className="mt-1 flex items-baseline justify-between gap-2"><span className="text-base font-semibold">{multiTimeframe.dominantBias ?? 'Neutral / mixed'}</span><span className="text-[10px] text-shafx-textMuted">{multiTimeframe.aligned ? 'Aligned' : 'Conflict / incomplete'}</span></div><p className="mt-1 text-xs text-shafx-textMuted">{multiTimeframe.summary}</p></div>
    <div className="rounded border border-shafx-border bg-shafx-bg p-3"><div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-shafx-textMuted"><History className="h-3 w-3" />Learning</div><p className="mt-1 text-xs text-shafx-textMuted">{learning.summary}</p>{learning.lessons.slice(0, 2).map((lesson) => <div key={lesson.key} className="mt-2 text-[10px] text-shafx-textMuted">{lesson.key}: {lesson.sampleSize} completed · {lesson.winRate.toFixed(0)}% wins</div>)}</div>
    {positionMonitor && <div className="rounded border border-shafx-border bg-shafx-bg p-3"><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-shafx-textMuted"><Activity className="h-3 w-3" />Position monitor</span><span className="text-[10px] font-semibold">{positionMonitor.state.replace(/_/g, ' ')}</span></div><p className="mt-1 text-xs text-shafx-textMuted">{positionMonitor.message}</p><div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-shafx-textMuted"><span>Stop distance: {positionMonitor.distanceToStop?.toPrecision(5) ?? '—'}</span><span>Target distance: {positionMonitor.distanceToTarget?.toPrecision(5) ?? '—'}</span></div></div>}
    {decision.setup && <div className="grid grid-cols-3 gap-2 text-xs"><div><span className="block text-[10px] text-shafx-textMuted">Entry</span><span className="font-mono">{decision.setup.entryPrice}</span></div><div><span className="block text-[10px] text-shafx-textMuted">Stop</span><span className="font-mono">{decision.setup.stopLoss}</span></div><div><span className="block text-[10px] text-shafx-textMuted">Target</span><span className="font-mono">{decision.setup.takeProfit}</span></div></div>}
    {decision.approvalRequired && onReviewSetup && <button type="button" onClick={onReviewSetup} className="flex min-h-11 w-full items-center justify-center gap-2 rounded bg-shafx-primary px-3 py-2 text-xs font-semibold text-white"><CheckCircle2 className="h-4 w-4" /> Review and approve in simulator</button>}
    <p className="text-[10px] text-shafx-textMuted">SIMULATED — NOT FINANCIAL ADVICE. No broker or real-money execution is available.</p>
  </div>
}
