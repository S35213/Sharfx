import type { AgentContext, AgentDecision, AgentPermission } from './types'

const permissionText = (permission: AgentPermission): string => {
  if (permission === 'ANALYZE_ONLY') return 'The agent may analyze the market but cannot prepare or place an order.'
  if (permission === 'PREPARE_ONLY') return 'The agent may prepare a simulated trade plan but cannot place it.'
  return 'The agent may prepare a simulated trade, but explicit user approval is required before execution.'
}

export const decideAgentAction = (context: AgentContext): AgentDecision => {
  const { tradingContext, preferredSetup, hasOpenPosition, permission } = context
  const symbol = tradingContext.symbol
  const timeframe = tradingContext.timeframe
  if (hasOpenPosition) {
    return { state: 'IN_POSITION', action: 'MONITOR_POSITION', permission, symbol, timeframe, setup: preferredSetup, rationale: 'A simulated position is already open. The agent will monitor its risk and invalidation conditions instead of creating another position.', approvalRequired: false, safety: permissionText(permission) }
  }
  if (!preferredSetup || preferredSetup.status !== 'candidate') {
    return { state: 'NO_TRADE', action: 'WAIT', permission, symbol, timeframe, setup: null, rationale: 'No valid setup currently satisfies the agent rules. Waiting is the active decision.', approvalRequired: false, safety: permissionText(permission) }
  }
  if (permission === 'ANALYZE_ONLY') {
    return { state: 'OPPORTUNITY', action: 'WAIT', permission, symbol, timeframe, setup: preferredSetup, rationale: `A ${preferredSetup.direction} opportunity is visible, but the current permission only allows analysis.`, approvalRequired: false, safety: permissionText(permission) }
  }
  if (permission === 'PREPARE_ONLY') {
    return { state: 'OPPORTUNITY', action: 'PREPARE_TRADE', permission, symbol, timeframe, setup: preferredSetup, rationale: `The agent prepared a ${preferredSetup.direction} simulated trade from the current confluence. Execution remains disabled.`, approvalRequired: false, safety: permissionText(permission) }
  }
  return { state: 'AWAITING_APPROVAL', action: 'REQUEST_APPROVAL', permission, symbol, timeframe, setup: preferredSetup, rationale: `A ${preferredSetup.direction} simulated trade meets the current rules. Review the entry, stop, target and risk before approving execution.`, approvalRequired: true, safety: permissionText(permission) }
}
