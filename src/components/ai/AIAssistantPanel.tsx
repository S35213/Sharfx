import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Brain, Eye, Info, Shield, Target, Zap } from 'lucide-react'
import { analyzeLiquidity } from '../../engine/liquidity'
import { analyzeMarketStructure, findSwingPoints } from '../../engine/marketStructure'
import { analyzeSetup } from '../../engine/setup'
import { analyzeSupportResistance } from '../../engine/supportResistance'
import { buildTradingContext } from '../../engine/ai/context'
import { detectMarketEvents } from '../../engine/ai/events'
import { buildTradingResponse } from '../../engine/ai/response'
import type { UserIntent } from '../../engine/ai/types'
import type { OHLCV, Timeframe } from '../../types'

interface Props { symbol: string; timeframe: Timeframe; candles: OHLCV[] }

const INTENT_BUTTONS: Array<{ value: UserIntent; label: string }> = [
  { value: 'WHAT_IS_HAPPENING', label: 'What is happening?' },
  { value: 'WHERE_LIQUIDITY', label: 'Where is liquidity?' },
  { value: 'IS_SETUP', label: 'Is there a setup?' },
  { value: 'WHAT_INVALIDATES', label: 'What invalidates?' },
  { value: 'WHAT_WATCHING', label: 'What are you watching?' },
  { value: 'WHERE_ENTER', label: 'Where would the setup enter?' },
]

export function AIAssistantPanel({ symbol, timeframe, candles }: Props) {
  const [intent, setIntent] = useState<UserIntent>('WHAT_IS_HAPPENING')
  const previousContext = useRef<ReturnType<typeof buildTradingContext> | null>(null)
  const context = useMemo(() => {
    const structure = analyzeMarketStructure(candles, 2)
    const swings = findSwingPoints(candles, 2)
    const tolerance = symbol.includes('JPY') ? 0.1 : 0.001
    const supportResistance = analyzeSupportResistance(candles, tolerance, swings)
    const liquidity = analyzeLiquidity(candles, swings, tolerance)
    const setup = analyzeSetup({ currentPrice: candles[candles.length - 1]?.close ?? Number.NaN, structure, supportResistance, liquidity })
    return buildTradingContext(symbol, timeframe, candles, structure, supportResistance, liquidity, setup)
  }, [candles, symbol, timeframe])

  const previous = previousContext.current
  const events = useMemo(() => detectMarketEvents(context, previous), [context, previous])
  const response = useMemo(() => buildTradingResponse(context, events, intent), [context, events, intent])

  useEffect(() => { previousContext.current = context }, [context])

  return (
    <div className="space-y-4 rounded-lg border border-shafx-border bg-shafx-surface p-4 text-sm">
      <div className="flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 font-semibold text-shafx-text"><Brain className="h-4 w-4 text-shafx-primary" /> AI Trading Assistant</h3><span className="flex items-center gap-1 rounded border border-yellow-500/30 bg-yellow-500/10 px-2 py-1 text-[10px] font-semibold text-yellow-500"><Info className="h-3 w-3" /> SIMULATED DATA</span></div>
      <Section icon={<Zap className="h-3 w-3" />} label="Market State" text={response.marketState} />
      <Section icon={<Eye className="h-3 w-3" />} label="Reasoning" text={response.reasoning} />
      <Section icon={<Target className="h-3 w-3" />} label="What I'm Watching" text={response.watching} />
      <Section icon={<Shield className="h-3 w-3" />} label="Invalidation" text={response.invalidation} />
      {response.setupDetails && <div className="space-y-1 rounded border border-shafx-border bg-shafx-bg p-2"><span className="text-[10px] uppercase tracking-wider text-shafx-textMuted">Setup Candidate</span><p className="font-mono text-xs text-shafx-text">{response.setupDetails}</p><div className="flex justify-between text-xs text-shafx-textMuted"><span>Confluence score: {response.confidence}</span><span>R:R: {response.riskReward}</span></div></div>}
      {response.recentEvent && <div className="flex items-start gap-2 rounded border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" /><div><span className="font-semibold text-yellow-500">Recent Event</span><p className="text-shafx-text">{response.recentEvent.description}</p></div></div>}
      <div className="space-y-2 border-t border-shafx-border pt-2"><span className="text-[10px] uppercase tracking-wider text-shafx-textMuted">Ask the Assistant</span><div className="flex flex-wrap gap-2">{INTENT_BUTTONS.map((item) => <button key={item.value} type="button" onClick={() => setIntent(item.value)} className={`min-h-11 rounded border px-3 py-2 text-xs transition-colors ${response.intent === item.value ? 'border-shafx-primary bg-shafx-primary/10 text-shafx-primary' : 'border-shafx-border bg-shafx-surfaceHover text-shafx-textMuted hover:border-shafx-primary hover:text-shafx-text'}`}>{item.label}</button>)}</div></div>
      <p className="text-[10px] text-shafx-textMuted">SIMULATED — NOT FINANCIAL ADVICE. No real orders or broker connection are used.</p>
    </div>
  )
}

function Section({ icon, label, text }: { icon: ReactNode; label: string; text: string }) { return <div className="space-y-1"><div className="flex items-center gap-1 text-xs uppercase tracking-wider text-shafx-textMuted">{icon}{label}</div><p className="text-shafx-text">{text}</p></div> }
