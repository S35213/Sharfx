import { describe, expect, it } from 'vitest'
import { decideAgentAction } from './decideAgentAction'
import type { AgentContext } from './types'
import type { AITradingContext } from '../ai/types'

const setup = { direction: 'BUY' as const, status: 'candidate' as const, quality: 'strong' as const, entryPrice: 1.1, stopLoss: 1.09, takeProfit: 1.12, riskRewardRatio: 2, riskDistance: 0.01, rewardDistance: 0.02, confidence: 80, rationale: ['test'], invalidation: 'test', liquidityTarget: null }
const context = { symbol: 'EURUSD', timeframe: 'H1', currentPrice: 1.1, marketStructure: { bias: 'Bullish', status: 'Bullish HH/HL', swingHighs: [], swingLows: [], recentHigh: 1.1, recentLow: 1.09 }, supportResistance: { supports: [], resistances: [], nearestSupport: 1.09, nearestResistance: 1.12 }, liquidity: { pools: [], nearestBuySide: null, nearestSellSide: null }, setup: { candidates: [setup], preferredSetup: setup, currentPrice: 1.1 }, recentCandles: [], higherTimeframeBias: null, externalEvents: [], timestamp: 1, dataStatus: 'simulated' } as AITradingContext
const makeContext = (permission: AgentContext['permission'], hasOpenPosition = false): AgentContext => ({ tradingContext: context, preferredSetup: setup, hasOpenPosition, permission })

describe('decideAgentAction', () => {
  it('waits when no setup exists', () => expect(decideAgentAction({ ...makeContext('USER_APPROVAL_REQUIRED'), preferredSetup: null }).action).toBe('WAIT'))
  it('requires approval for executable permission', () => {
    const result = decideAgentAction(makeContext('USER_APPROVAL_REQUIRED'))
    expect(result.state).toBe('AWAITING_APPROVAL')
    expect(result.approvalRequired).toBe(true)
    expect(result.action).toBe('REQUEST_APPROVAL')
  })
  it('never executes from the decision engine', () => expect(decideAgentAction(makeContext('PREPARE_ONLY')).action).toBe('PREPARE_TRADE'))
  it('monitors an existing position', () => expect(decideAgentAction(makeContext('USER_APPROVAL_REQUIRED', true)).action).toBe('MONITOR_POSITION'))
  it('blocks a local buy when strong higher-timeframe evidence is bearish', () => {
    const result = decideAgentAction({ ...makeContext('USER_APPROVAL_REQUIRED'), multiTimeframe: { dominantBias: 'Bearish', confidence: 75, aligned: false } })
    expect(result.state).toBe('NO_TRADE')
    expect(result.action).toBe('WAIT')
    expect(result.approvalRequired).toBe(false)
  })
  it('does not block when higher-timeframe evidence is weak', () => {
    const result = decideAgentAction({ ...makeContext('USER_APPROVAL_REQUIRED'), multiTimeframe: { dominantBias: 'Bearish', confidence: 50, aligned: false } })
    expect(result.action).toBe('REQUEST_APPROVAL')
  })
})
