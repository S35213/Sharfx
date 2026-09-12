import type { TradeOrder } from '../../types'
import type { SetupCandidate } from '../setup/types'

export type PositionMonitorState = 'HEALTHY' | 'APPROACHING_STOP' | 'APPROACHING_TARGET' | 'INVALIDATED' | 'CLOSED'

export interface PositionMonitorResult {
  state: PositionMonitorState
  distanceToStop: number | null
  distanceToTarget: number | null
  currentProfit: number | null
  message: string
  shouldAlert: boolean
}

const finite = (value: number | undefined): value is number => typeof value === 'number' && Number.isFinite(value)

export const monitorPosition = (order: TradeOrder, currentPrice: number, setup?: SetupCandidate | null): PositionMonitorResult => {
  if (!finite(currentPrice) || currentPrice <= 0) throw new Error('Current price must be a positive finite number.')

  if (order.status === 'closed') {
    return { state: 'CLOSED', distanceToStop: null, distanceToTarget: null, currentProfit: order.profit ?? null, message: 'Position is closed. No further monitoring action is required.', shouldAlert: false }
  }

  const distanceToStop = order.stopLoss === null ? null : Math.abs(currentPrice - order.stopLoss)
  const distanceToTarget = order.takeProfit === null ? null : Math.abs(currentPrice - order.takeProfit)
  const entryDistance = Math.max(Math.abs(currentPrice - order.entryPrice), Number.EPSILON)
  const stopDistance = distanceToStop ?? Number.POSITIVE_INFINITY
  const targetDistance = distanceToTarget ?? Number.POSITIVE_INFINITY
  const nearStop = Number.isFinite(stopDistance) && stopDistance <= entryDistance * 0.35
  const nearTarget = Number.isFinite(targetDistance) && targetDistance <= entryDistance * 0.35
  const setupInvalidated = setup?.status === 'invalid'

  if (setupInvalidated) {
    return { state: 'INVALIDATED', distanceToStop, distanceToTarget, currentProfit: order.profit ?? null, message: 'The original setup is marked invalid. Review the position rather than assuming the thesis still holds.', shouldAlert: true }
  }

  if (nearStop) {
    return { state: 'APPROACHING_STOP', distanceToStop, distanceToTarget, currentProfit: order.profit ?? null, message: 'Price is approaching the protective stop. The agent is monitoring risk closely.', shouldAlert: true }
  }

  if (nearTarget) {
    return { state: 'APPROACHING_TARGET', distanceToStop, distanceToTarget, currentProfit: order.profit ?? null, message: 'Price is approaching the planned target. The agent is monitoring the trade for the defined exit.', shouldAlert: true }
  }

  return { state: 'HEALTHY', distanceToStop, distanceToTarget, currentProfit: order.profit ?? null, message: 'Position remains inside its planned boundaries. No new agent action is required.', shouldAlert: false }
}
