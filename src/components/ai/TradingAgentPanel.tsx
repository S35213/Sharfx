import { useEffect, useMemo, useState } from 'react'
import { Brain, CheckCircle2, Shield, Eye } from 'lucide-react'
import { analyzeLiquidity } from '../../engine/liquidity'
import { analyzeMarketStructure, findSwingPoints } from '../../engine/marketStructure'
import { analyzeSetup } from '../../engine/setup'
import { analyzeSupportResistance } from '../../engine/supportResistance'
import { buildTradingContext } from '../../engine/ai/context'
import { decideAgentAction, analyzeMultiTimeframeBias } from '../../engine/agent'
import { marketDataSource } from '../../data/mock/MockDataSource'
import type { AgentPermission } from '../../engine/agent'
import type { OHLCV, Timeframe } from '../../types'

interface Props { symbol: string; timeframe: Timeframe; candles: OHLCV[]; hasOpenPosition: boolean; onReviewSetup?: () => void }

export function TradingAgentPanel({ symbol, timeframe, candles, hasOpenPosition, onReviewSetup }: Props) {
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
        setHigherTimeframes(Object.fromEntries(entries))
        setContextStatus('ready')
      } catch {
        if (!cancelled) setContextStatus('unavailable')
      }
    }
    void loadHigherTimeframes()
    return () => { cancelled = true }
  }, [symbol])

  const tradingContext = useMemo(() => {
    const swings = findSwingPoints(candles, 2)
    const structure = analyzeMarketStructure(candles, 2)
    const tolerance = symbol.includes('JPY') ? 0.1 : 0.001
    const supportResistance = analyzeSupportResistance(candles, tolerance, swings)
    const liquidity = analyzeLiquidity(candles, swings, tolerance)
    const setup = analyzeSetup({ currentPrice: candles[candles.length - 1]?.close ?? Number.NaN, structure, supportResistance, liquidity })
    return buildTradingContext(symbol, timeframe, candles, structure, supportResistance, liquidity, setup)
  }, [candles, symbol, timeframe])

  const multiTimeframe = useMemo(() => analyzeMultiTimeframeBias({ ...higherTimeframes, [timeframe]: candles }), [candles, higherTimeframes, timeframe])
  const decision = useMemo(() => decideAgentAction({ tradingContext, preferredSetup: tradingContext.setup.preferredSetup, hasOpenPosition, permission, multiTimeframe }), [hasOpenPosition, permission, tradingContext, multiTimeframe])

  return <div className="space-y-3 rounded-lg border border-shafx-primary/30 bg-shafx-surface p-4 text-sm">
    <div className="flex items-start justify-between gap-2"><div><h3 className="flex items-center gap-2 font-semibold"><Brain className="h-4 w-4 text-shafx-primary" /> Agent control</h3><p className="mt-1 text-[11px] text-shafx-textMuted">The agent reasons across the selected chart and higher timeframes while keeping execution behind your approval.</p></div><Shield className="h-4 w-4 text-shafx-primary" /></div>
    <div className="grid grid-cols-3 gap-1 rounded border border-shafx-border bg-shafx-bg p-1">
      {(['ANALYZE_ONLY', 'PREPARE_ONLY', 'USER_APPROVAL_REQUIRED'] as AgentPermission[]).map((item) => <button key={item} type="button" onClick={() => setPermission(item)} className={`min-h-11 rounded px-2 text-[10px] font-semibold ${permission === item ? 'bg-shafx-primary text-white' : 'text-shafx-textMuted'}`}>{item === 'ANALYZE_ONLY' ? 'Watch' : item === 'PREPARE_ONLY' ? 'Prepare' : 'Ask me'}</button>)}
    </div>
    <div className="rounded border border-shafx-border bg-shafx-bg p-3"><div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-shafx-textMuted"><Eye className="h-3 w-3" />State</div><div className="mt-1 text-lg font-semibold">{decision.state.replace(/_/g, ' ')}</div><p className="mt-1 text-xs text-shafx-textMuted">{decision.rationale}</p></div>
    <div className="rounded border border-shafx-border bg-shafx-bg p-3"><div className="flex items-center justify-between"><span className="text-[10px] uppercase tracking-wider text-shafx-textMuted">Multi-timeframe read</span><span className="text-[10px] text-shafx-textMuted">{contextStatus === 'ready' ? `${multiTimeframe.confidence}% evidence` : contextStatus}</span></div><div className="mt-1 flex items-baseline justify-between gap-2"><span className="text-base font-semibold">{multiTimeframe.dominantBias ?? 'Neutral / mixed'}</span><span className="text-[10px] text-shafx-textMuted">{multiTimeframe.aligned ? 'Aligned' : 'Conflict / incomplete'}</span></div><p className="mt-1 text-xs text-shafx-textMuted">{multiTimeframe.summary}</p></div>
    {decision.setup && <div className="grid grid-cols-3 gap-2 text-xs"><div><span className="block text-[10px] text-shafx-textMuted">Entry</span><span className="font-mono">{decision.setup.entryPrice}</span></div><div><span className="block text-[10px] text-shafx-textMuted">Stop</span><span className="font-mono">{decision.setup.stopLoss}</span></div><div><span className="block text-[10px] text-shafx-textMuted">Target</span><span className="font-mono">{decision.setup.takeProfit}</span></div></div>}
    {decision.approvalRequired && onReviewSetup && <button type="button" onClick={onReviewSetup} className="flex min-h-11 w-full items-center justify-center gap-2 rounded bg-shafx-primary px-3 py-2 text-xs font-semibold text-white"><CheckCircle2 className="h-4 w-4" /> Review and approve in simulator</button>}
    <p className="text-[10px] text-shafx-textMuted">SIMULATED — NOT FINANCIAL ADVICE. No broker or real-money execution is available.</p>
  </div>
}
