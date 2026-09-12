import type { AITradingContext } from '../ai/types'
import type { AgentLearningSummary } from './learning'

export interface ResearchEvidence {
  source: 'MARKET_STRUCTURE' | 'SUPPORT_RESISTANCE' | 'LIQUIDITY' | 'SETUP' | 'MULTI_TIMEFRAME' | 'SIMULATOR_HISTORY'
  finding: string
  weight: number
}

export interface AgentResearchReport {
  evidence: ResearchEvidence[]
  agreement: number
  contradictions: string[]
  conclusion: string
}

export interface ResearchInput {
  context: AITradingContext
  learning?: AgentLearningSummary
  multiTimeframe?: { dominantBias: 'Bullish' | 'Bearish' | null; confidence: number; aligned: boolean }
}

export const buildAgentResearch = (input: ResearchInput): AgentResearchReport => {
  const { context, learning, multiTimeframe } = input
  const evidence: ResearchEvidence[] = []
  const contradictions: string[] = []
  const structureBias = context.marketStructure.bias
  if (structureBias !== 'Unclear') evidence.push({ source: 'MARKET_STRUCTURE', finding: `${structureBias} structure is currently detected.`, weight: 3 })
  if (context.supportResistance.nearestSupport !== null) evidence.push({ source: 'SUPPORT_RESISTANCE', finding: `Nearest support is ${context.supportResistance.nearestSupport}.`, weight: 2 })
  if (context.supportResistance.nearestResistance !== null) evidence.push({ source: 'SUPPORT_RESISTANCE', finding: `Nearest resistance is ${context.supportResistance.nearestResistance}.`, weight: 2 })
  if (context.liquidity.nearestBuySide !== null) evidence.push({ source: 'LIQUIDITY', finding: `Buy-side liquidity is mapped near ${context.liquidity.nearestBuySide}.`, weight: 2 })
  if (context.liquidity.nearestSellSide !== null) evidence.push({ source: 'LIQUIDITY', finding: `Sell-side liquidity is mapped near ${context.liquidity.nearestSellSide}.`, weight: 2 })
  if (context.setup.preferredSetup) evidence.push({ source: 'SETUP', finding: `${context.setup.preferredSetup.direction} setup with ${context.setup.preferredSetup.quality} quality and ${context.setup.preferredSetup.confidence} confluence.`, weight: 4 })
  if (multiTimeframe?.dominantBias) {
    evidence.push({ source: 'MULTI_TIMEFRAME', finding: `Higher-timeframe evidence is ${multiTimeframe.dominantBias} at ${multiTimeframe.confidence}% confidence.`, weight: 4 })
    if (structureBias !== 'Unclear' && structureBias !== multiTimeframe.dominantBias && multiTimeframe.confidence >= 60) contradictions.push(`Local ${structureBias} structure conflicts with stronger ${multiTimeframe.dominantBias} higher-timeframe evidence.`)
  }
  if (learning && learning.lessons.length > 0) evidence.push({ source: 'SIMULATOR_HISTORY', finding: learning.summary, weight: 2 })
  const totalWeight = evidence.reduce((sum, item) => sum + item.weight, 0)
  const directional = evidence.filter((item) => /Bullish|BUY/.test(item.finding)).reduce((sum, item) => sum + item.weight, 0) - evidence.filter((item) => /Bearish|SELL/.test(item.finding)).reduce((sum, item) => sum + item.weight, 0)
  const agreement = totalWeight === 0 ? 0 : Math.max(0, Math.min(100, 50 + (Math.abs(directional) / totalWeight) * 50 - contradictions.length * 10))
  const conclusion = contradictions.length > 0 ? 'Evidence is mixed; the agent should prefer waiting until the conflict resolves.' : evidence.length === 0 ? 'There is not enough validated evidence to form a research conclusion.' : `The research pass combined ${evidence.length} evidence items; agreement is ${agreement.toFixed(0)}%.`
  return { evidence, agreement, contradictions, conclusion }
}
