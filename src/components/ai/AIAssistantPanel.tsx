import { AlertTriangle, Brain, Eye, Info, Shield, Target, Zap } from 'lucide-react'
import type { AITradingResponse, UserIntent } from '../../engine/ai/types'

interface Props {
  response: AITradingResponse
  onIntentChange: (intent: UserIntent) => void
}

const INTENT_BUTTONS: Array<{ value: UserIntent; label: string }> = [
  { value: 'WHAT_IS_HAPPENING', label: 'What is happening?' },
  { value: 'WHERE_LIQUIDITY', label: 'Where is liquidity?' },
  { value: 'IS_SETUP', label: 'Is there a setup?' },
  { value: 'WHAT_INVALIDATES', label: 'What invalidates?' },
  { value: 'WHAT_WATCHING', label: 'What are you watching?' },
  { value: 'WHERE_ENTER', label: 'Where would the setup enter?' },
]

export function AIAssistantPanel({ response, onIntentChange }: Props) {
  return (
    <div className="space-y-4 rounded-lg border border-shafx-border bg-shafx-surface p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold text-shafx-text"><Brain className="h-4 w-4 text-shafx-primary" /> AI Trading Assistant</h3>
        <span className="flex items-center gap-1 rounded border border-yellow-500/30 bg-yellow-500/10 px-2 py-1 text-[10px] font-semibold text-yellow-500"><Info className="h-3 w-3" /> SIMULATED DATA</span>
      </div>
      <Section icon={<Zap className="h-3 w-3" />} label="Market State" text={response.marketState} />
      <Section icon={<Eye className="h-3 w-3" />} label="Reasoning" text={response.reasoning} />
      <Section icon={<Target className="h-3 w-3" />} label="What I'm Watching" text={response.watching} />
      <Section icon={<Shield className="h-3 w-3" />} label="Invalidation" text={response.invalidation} />
      {response.setupDetails && (
        <div className="space-y-1 rounded border border-shafx-border bg-shafx-bg p-2">
          <span className="text-[10px] uppercase tracking-wider text-shafx-textMuted">Setup Candidate</span>
          <p className="font-mono text-xs text-shafx-text">{response.setupDetails}</p>
          <div className="flex justify-between text-xs text-shafx-textMuted"><span>Confluence score: {response.confidence}</span><span>R:R: {response.riskReward}</span></div>
        </div>
      )}
      {response.recentEvent && (
        <div className="flex items-start gap-2 rounded border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" /><div><span className="font-semibold text-yellow-500">Recent Event</span><p className="text-shafx-text">{response.recentEvent.description}</p></div></div>
      )}
      <div className="space-y-2 border-t border-shafx-border pt-2">
        <span className="text-[10px] uppercase tracking-wider text-shafx-textMuted">Ask the Assistant</span>
        <div className="flex flex-wrap gap-2">
          {INTENT_BUTTONS.map((intent) => <button key={intent.value} type="button" onClick={() => onIntentChange(intent.value)} className={`min-h-11 rounded border px-3 py-2 text-xs transition-colors ${response.intent === intent.value ? 'border-shafx-primary bg-shafx-primary/10 text-shafx-primary' : 'border-shafx-border bg-shafx-surfaceHover text-shafx-textMuted hover:border-shafx-primary hover:text-shafx-text'}`}>{intent.label}</button>)}
        </div>
      </div>
      <p className="text-[10px] text-shafx-textMuted">SIMULATED — NOT FINANCIAL ADVICE. No real orders or broker connection are used.</p>
    </div>
  )
}

function Section({ icon, label, text }: { icon: React.ReactNode; label: string; text: string }) {
  return <div className="space-y-1"><div className="flex items-center gap-1 text-xs uppercase tracking-wider text-shafx-textMuted">{icon}{label}</div><p className="text-shafx-text">{text}</p></div>
}
