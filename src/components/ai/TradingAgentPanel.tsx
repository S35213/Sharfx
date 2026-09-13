import { useEffect, useMemo, useState } from 'react'
import { Activity, Brain, CheckCircle2, ChevronDown, Eye, Shield, Sparkles } from 'lucide-react'
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
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [higherTimeframes, setHigherTimeframes] = useState<Partial<Record<Timeframe, OHLCV[]>>>({})
  const [contextStatus, setContextStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')

  useEffect(() => { let cancelled = false; const load = async (): Promise<void> => { try { const requested: Timeframe[] = ['H1', 'H4', 'D1']; const entries = await Promise.all(requested.map(async (frame) => [frame, await marketDataSource.getCandles(symbol, frame)] as const)); if (cancelled) return; setHigherTimeframes(Object.fromEntries(entries)); setContextStatus('ready') } catch { if (!cancelled) setContextStatus('unavailable') } }; void load(); return () => { cancelled = true } }, [symbol])
  const tradingContext = useMemo(() => { const swings = findSwingPoints(candles, 2); const structure = analyzeMarketStructure(candles, 2); const tolerance = symbol.includes('JPY') ? 0.1 : 0.001; const supportResistance = analyzeSupportResistance(candles, tolerance, swings); const liquidity = analyzeLiquidity(candles, swings, tolerance); const setup = analyzeSetup({ currentPrice: candles[candles.length - 1]?.close ?? Number.NaN, structure, supportResistance, liquidity }); return buildTradingContext(symbol, timeframe, candles, structure, supportResistance, liquidity, setup) }, [candles, symbol, timeframe])
  const multiTimeframe = useMemo(() => analyzeMultiTimeframeBias({ ...higherTimeframes, [timeframe]: candles }), [candles, higherTimeframes, timeframe])
  const learning = useMemo(() => learnFromTrades(tradeHistory.filter((trade) => trade.status === 'closed').map((trade) => ({ symbol: trade.symbol, direction: trade.type, profit: trade.profit, riskRewardRatio: trade.riskRewardRatio }))), [tradeHistory])
  const research = useMemo(() => buildAgentResearch({ context: tradingContext, learning, multiTimeframe }), [learning, multiTimeframe, tradingContext])
  const decision = useMemo(() => decideAgentAction({ tradingContext, preferredSetup: tradingContext.setup.preferredSetup, hasOpenPosition: activePosition !== null, permission, multiTimeframe, learning, research }), [activePosition, learning, permission, research, tradingContext, multiTimeframe])
  const positionMonitor = useMemo(() => activePosition ? monitorPosition(activePosition, currentPrice, tradingContext.setup.preferredSetup) : null, [activePosition, currentPrice, tradingContext.setup.preferredSetup])
  const setup = decision.setup
  const stateLabel = decision.state.replace(/_/g, ' ')
  const permissionLabel = permission === 'ANALYZE_ONLY' ? 'Observe only' : permission === 'PREPARE_ONLY' ? 'Prepare setup' : 'Ask before action'

  return <div className="space-y-3 rounded-lg border border-shafx-border bg-shafx-surface p-3 text-sm shadow-sm">
    <div className="flex items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 font-semibold"><Brain className="h-4 w-4 text-shafx-primary" />Trading assistant</h3><p className="mt-1 text-[11px] leading-relaxed text-shafx-textMuted">I watch the chart, explain what I see, and prepare a simulated setup. You stay in control.</p></div><span className="flex items-center gap-1 rounded border border-shafx-success/20 bg-shafx-success/10 px-2 py-1 text-[10px] text-shafx-success"><Activity className="h-3 w-3" />{contextStatus === 'ready' ? 'Ready' : 'Loading'}</span></div>

    <div className="rounded-md border border-shafx-border bg-shafx-bg p-3"><div className="flex items-center justify-between"><div><div className="text-[10px] uppercase tracking-wider text-shafx-textMuted">Bot mode</div><div className="mt-1 font-semibold">{permissionLabel}</div></div><Shield className="h-4 w-4 text-shafx-primary" /></div><div className="mt-2 grid grid-cols-3 gap-1">{(['ANALYZE_ONLY', 'PREPARE_ONLY', 'USER_APPROVAL_REQUIRED'] as AgentPermission[]).map((item) => <button key={item} type="button" onClick={() => setPermission(item)} className={`min-h-10 rounded px-1 text-[10px] font-semibold ${permission === item ? 'bg-shafx-primary text-white' : 'border border-shafx-border text-shafx-textMuted'}`}>{item === 'ANALYZE_ONLY' ? 'Observe' : item === 'PREPARE_ONLY' ? 'Prepare' : 'Ask first'}</button>)}</div></div>

    <div className="rounded-md border border-shafx-border bg-shafx-bg p-3"><div className="flex items-center justify-between"><div><div className="text-[10px] uppercase tracking-wider text-shafx-textMuted">Current read</div><div className="mt-1 text-base font-semibold capitalize">{stateLabel.toLowerCase()}</div></div><span className="rounded border border-shafx-primary/20 px-2 py-1 text-[10px] text-shafx-primary">{multiTimeframe.dominantBias ?? 'Neutral'}</span></div><p className="mt-2 text-xs leading-relaxed text-shafx-textMuted">{decision.rationale}</p></div>

    {setup ? <div className="rounded-md border border-shafx-primary/30 bg-shafx-primary/5 p-3"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-shafx-primary" /><div><div className="text-[10px] uppercase tracking-wider text-shafx-textMuted">Suggested simulated setup</div><div className="font-semibold">{setup.direction} {symbol}</div></div></div><div className="mt-3 grid grid-cols-3 gap-2"><div className="rounded border border-shafx-border bg-shafx-bg p-2"><span className="block text-[9px] text-shafx-textMuted">Entry</span><span className="font-mono text-xs">{setup.entryPrice}</span></div><div className="rounded border border-shafx-border bg-shafx-bg p-2"><span className="block text-[9px] text-shafx-textMuted">Stop</span><span className="font-mono text-xs text-shafx-danger">{setup.stopLoss}</span></div><div className="rounded border border-shafx-border bg-shafx-bg p-2"><span className="block text-[9px] text-shafx-textMuted">Target</span><span className="font-mono text-xs text-shafx-success">{setup.takeProfit}</span></div></div>{decision.approvalRequired && onReviewSetup && <button type="button" onClick={onReviewSetup} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded bg-shafx-primary px-3 py-2 text-xs font-semibold text-white"><CheckCircle2 className="h-4 w-4" />Review setup in simulator</button>}</div> : <div className="rounded-md border border-shafx-border bg-shafx-bg p-3 text-xs text-shafx-textMuted">No high-confidence setup right now. The assistant will keep watching instead of forcing a trade.</div>}

    {positionMonitor && <div className="rounded-md border border-shafx-border bg-shafx-bg p-3"><div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-shafx-textMuted"><Eye className="h-3 w-3" />Open position monitor</div><p className="mt-1 text-xs text-shafx-textMuted">{positionMonitor.message}</p></div>}

    <button type="button" onClick={() => setDetailsOpen((open) => !open)} className="flex min-h-10 w-full items-center justify-between rounded border border-shafx-border px-3 text-xs text-shafx-textMuted"><span>Analysis details</span><ChevronDown className={`h-4 w-4 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} /></button>
    {detailsOpen && <div className="space-y-2 rounded-md border border-shafx-border bg-shafx-bg p-3 text-[10px] text-shafx-textMuted"><div>Multi-timeframe: {contextStatus === 'ready' ? `${multiTimeframe.confidence}% evidence` : contextStatus} • {multiTimeframe.aligned ? 'aligned' : 'mixed'}</div><div>Research: {research.agreement.toFixed(0)}% agreement across {research.evidence.length} evidence items.</div><div>Learning: {learning.summary}</div></div>}

    <p className="text-[10px] leading-relaxed text-shafx-textMuted">SIMULATED — NOT FINANCIAL ADVICE. No broker or real-money execution is available.</p>
  </div>
}
