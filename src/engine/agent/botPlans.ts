export type BotPlan = 'FREE' | 'REGULAR' | 'PRO'

export interface BotPlanConfig {
  label: string
  maxCycleUnitsPerRun: number
  maxOpenPositions: number
  maxCycleSeconds: 5 | 10
  features: string[]
}

export const BOT_PLANS: Record<BotPlan, BotPlanConfig> = {
  FREE: { label: 'Free Bot', maxCycleUnitsPerRun: 5, maxOpenPositions: 1, maxCycleSeconds: 10, features: ['Core market structure', 'Liquidity and setup analysis', 'Basic simulator risk gate'] },
  REGULAR: { label: 'Regular Bot', maxCycleUnitsPerRun: 100, maxOpenPositions: 3, maxCycleSeconds: 10, features: ['Deeper multi-timeframe analysis', 'Advanced trade management', 'Extended simulator research'] },
  PRO: { label: 'Pro Bot', maxCycleUnitsPerRun: 500, maxOpenPositions: 10, maxCycleSeconds: 5, features: ['Full intelligence scoring', 'Advanced learning and backtesting', 'Highest simulator limits'] },
}

export const cycleUnitsForSeconds = (seconds: 5 | 10): number => seconds === 10 ? 2 : 1
export const canConsumeCycleUnits = (plan: BotPlan, usedUnits: number, seconds: 5 | 10): boolean => seconds <= BOT_PLANS[plan].maxCycleSeconds && usedUnits + cycleUnitsForSeconds(seconds) <= BOT_PLANS[plan].maxCycleUnitsPerRun
export const remainingCycleUnits = (plan: BotPlan, usedUnits: number): number => Math.max(0, BOT_PLANS[plan].maxCycleUnitsPerRun - usedUnits)
