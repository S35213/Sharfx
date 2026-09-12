import type { AgentContext, AgentDecision, AgentPermission } from './types'

const permissionText = (permission: AgentPermission): string => {
  if (permission === 'ANALYZE_ONLY') return 'The agent may analyze the market but cannot prepare or place an order.'
  if (permission === 'PREPARE_ONLY') return 'The agent may prepare a simulated trade plan but cannot place it.'
  return 'The agent may prepare a simulated trade, but explicit user approval is required before execution.'
}

export const decideAgentAction = (context: AgentContext): AgentDecision => {
  const { tradingContext, preferredSetup, hasOpenPosition, permission, multiTimeframe, learning, research } = context
  const symbol = tradingContext.symbol
  const timeframe = tradingContext.timeframe
  if (hasOpenPosition) return { state: 'IN_POSITION', action: 'MONITOR_POSITION', permission, symbol, timeframe, setup: preferredSetup, rationale: 'A simulated position is already open. The agent will monitor its risk and invalidation conditions instead of creating another position.', approvalRequired: false, safety: permissionText(permission) }
  if (!preferredSetup || preferredSetup.status !== 'candidate') return { state: 'NO_TRADE', action: 'WAIT', permission, symbol, timeframe, setup: null, rationale: 'No valid setup currently satisfies the agent rules. Waiting is the active decision.', approvalRequired: false, safety: permissionText(permission) }

  const setupBias = preferredSetup.direction === 'BUY' ? 'Bullish' : 'Bearish'
  const higherTimeframeConflict = multiTimeframe?.dominantBias !== null && multiTimeframe?.dominantBias !== undefined && multiTimeframe.dominantBias !== setupBias && multiTimeframe.confidence >= 60
  if (higherTimeframeConflict) return { state: 'NO_TRADE', action: 'WAIT', permission, symbol, timeframe, setup: preferredSetup, rationale: `The local ${preferredSetup.direction} setup conflicts with the stronger higher-timeframe ${multiTimeframe.dominantBias} evidence (${multiTimeframe.confidence}%). The agent will wait rather than force an entry.`, approvalRequired: false, safety: permissionText(permission) }

  const researchConflict = research?.contradictions.length ? research.contradictions.length > 0 : false
  if (researchConflict && (research?.agreement ?? 100) < 55) return { state: 'NO_TRADE', action: 'WAIT', permission, symbol, timeframe, setup: preferredSetup, rationale: `The research pass found unresolved contradictions (${research?.contradictions.join(' ') ?? 'mixed evidence'}). The agent will wait for cleaner evidence.`, approvalRequired: false, safety: permissionText(permission) }

  const learningKey = `${symbol}:${preferredSetup.direction}`
  if (learning?.cautionKeys.includes(learningKey)) return { state: 'NO_TRADE', action: 'WAIT', permission, symbol, timeframe, setup: preferredSetup, rationale: `The setup is technically valid, but the agent has recorded repeated underperformance for ${learningKey}. It will require stronger evidence before repeating that pattern.`, approvalRequired: false, safety: permissionText(permission) }

  const learningNote = learning && learning.confidenceAdjustment !== 0 ? ` Historical simulator evidence adjusts caution by ${learning.confidenceAdjustment > 0 ? '+' : ''}${learning.confidenceAdjustment} points.` : ''
  const researchNote = research ? ` Research agreement is ${research.agreement.toFixed(0)}%.` : ''
  if (permission === 'ANALYZE_ONLY') return { state: 'OPPORTUNITY', action: 'WAIT', permission, symbol, timeframe, setup: preferredSetup, rationale: `A ${preferredSetup.direction} opportunity is visible, but the current permission only allows analysis.${learningNote}${researchNote}`, approvalRequired: false, safety: permissionText(permission) }
  if (permission === 'PREPARE_ONLY') return { state: 'OPPORTUNITY', action: 'PREPARE_TRADE', permission, symbol, timeframe, setup: preferredSetup, rationale: `The agent prepared a ${preferredSetup.direction} simulated trade from the current confluence.${learningNote}${researchNote} Execution remains disabled.`, approvalRequired: false, safety: permissionText(permission) }
  return { state: 'AWAITING_APPROVAL', action: 'REQUEST_APPROVAL', permission, symbol, timeframe, setup: preferredSetup, rationale: `A ${preferredSetup.direction} simulated trade meets the current rules. Review the entry, stop, target and risk before approving execution.${learningNote}${researchNote}`, approvalRequired: true, safety: permissionText(permission) }
}
