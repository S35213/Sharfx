import type { AITradingContext } from '../ai/types'
import type { SetupCandidate } from '../setup/types'
import type { MarketBias } from '../marketStructure/types'
import type { AgentLearningSummary } from './learning'
import type { AgentResearchReport } from './research'

export type AgentState = 'MONITORING' | 'OPPORTUNITY' | 'AWAITING_APPROVAL' | 'EXECUTING_TRADE' | 'IN_POSITION' | 'NO_TRADE'
export type AgentAction = 'WAIT' | 'PREPARE_TRADE' | 'REQUEST_APPROVAL' | 'EXECUTE_TRADE' | 'MONITOR_POSITION'
export type AgentPermission = 'ANALYZE_ONLY' | 'PREPARE_ONLY' | 'USER_APPROVAL_REQUIRED' | 'AUTONOMOUS_TRADING'

export interface AgentDecision {
  state: AgentState
  action: AgentAction
  permission: AgentPermission
  symbol: string
  timeframe: string
  setup: SetupCandidate | null
  rationale: string
  approvalRequired: boolean
  safety: string
}

export interface AgentContext {
  tradingContext: AITradingContext
  preferredSetup: SetupCandidate | null
  hasOpenPosition: boolean
  permission: AgentPermission
  multiTimeframe?: {
    dominantBias: MarketBias | null
    confidence: number
    aligned: boolean
  }
  learning?: AgentLearningSummary
  research?: AgentResearchReport
}
