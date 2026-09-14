import type { AITradingContext } from '../ai/types'
import type { MarketBias } from '../marketStructure/types'
import type { AgentLearningSummary } from './learning'
import type { AgentResearchReport } from './research'

export interface IntelligenceSnapshot {
  score: number
  confidence: number
  decision: 'BUY' | 'SELL' | 'WAIT'
  regime: 'TREND' | 'RANGE' | 'BREAKOUT' | 'UNCLEAR'
  reasons: string[]
  warnings: string[]
}

interface Input {
  context: AITradingContext
  multiTimeframe: { dominantBias: MarketBias | null; confidence: number; aligned: boolean }
  learning: AgentLearningSummary
  research: AgentResearchReport
  currentPrice: number
}

const clamp = (value: number, min = 0, max = 100): number => Math.max(min, Math.min(max, value))

export const scoreIntelligence = ({ context, multiTimeframe, learning, research }: Input): IntelligenceSnapshot => {
  const reasons: string[] = []
  const warnings: string[] = []
  let score = 50
  const structureBias = context.marketStructure.bias

  if (structureBias === 'Bullish') { score += 12; reasons.push('Bullish market structure') }
  if (structureBias === 'Bearish') { score -= 12; reasons.push('Bearish market structure') }
  if (context.marketStructure.status === 'Intact') { score += 6; reasons.push('Structure remains intact') }

  const setup = context.setup.preferredSetup
  if (setup) {
    score += setup.direction === 'BUY' ? 10 : -10
    if (setup.riskRewardRatio >= 2) { score += 8; reasons.push(`Risk/reward is ${setup.riskRewardRatio.toFixed(2)}`) }
    else warnings.push('Risk/reward is below 2:1')
    if (setup.confidence >= 75) { score += 7; reasons.push('Setup confidence is strong') }
  } else warnings.push('No structurally aligned setup')

  if (multiTimeframe.dominantBias === 'Bullish') { score += 8; reasons.push('Higher-timeframe bias supports buyers') }
  if (multiTimeframe.dominantBias === 'Bearish') { score -= 8; reasons.push('Higher-timeframe bias supports sellers') }
  if (research.agreement < 60) { score -= 8; warnings.push('Evidence agreement is weak') }
  if (learning.cautionKeys.length > 0) { score -= 8; warnings.push('Historical simulator patterns require caution') }

  const regime = structureBias === 'Bullish' || structureBias === 'Bearish'
    ? (setup ? 'TREND' : 'BREAKOUT')
    : setup ? 'RANGE' : 'UNCLEAR'
  const confidence = Math.round(clamp(50 + Math.abs(score - 50) * 0.8))
  const decision = setup && confidence >= 62 && research.agreement >= 55 ? setup.direction : 'WAIT'
  if (decision === 'WAIT') warnings.push('The intelligence gate prefers waiting instead of forcing a trade')
  return { score: Math.round(clamp(score)), confidence, decision, regime, reasons, warnings }
}
