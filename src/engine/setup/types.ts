import type { TradeSide } from '../../types'
import type { MarketStructureResult } from '../marketStructure/types'
import type { LiquidityPool, LiquidityResult } from '../liquidity/types'
import type { SupportResistanceResult } from '../supportResistance/types'

export type SetupDirection = TradeSide
export type SetupQuality = 'weak' | 'moderate' | 'strong'
export type SetupStatus = 'candidate' | 'invalid'

export interface SetupCandidate {
  direction: SetupDirection
  status: SetupStatus
  quality: SetupQuality
  entryPrice: number
  stopLoss: number
  takeProfit: number
  riskRewardRatio: number
  riskDistance: number
  rewardDistance: number
  confidence: number
  rationale: string[]
  invalidation: string
  liquidityTarget: LiquidityPool | null
}

export interface SetupResult {
  candidates: SetupCandidate[]
  preferredSetup: SetupCandidate | null
  currentPrice: number
}

export interface SetupEngineInput {
  currentPrice: number
  structure: MarketStructureResult
  supportResistance: SupportResistanceResult
  liquidity: LiquidityResult
}
