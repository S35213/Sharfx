export type BotPlan = 'FREE' | 'REGULAR' | 'PRO'

export interface BotPlanConfig {
  label: string
  maxDailyCycleUnits: number | null
  maxOpenPositions: number
  maxCycleSeconds: 3 | 5 | 10
  features: string[]
}

export const BOT_PLANS: Record<BotPlan, BotPlanConfig> = {
  FREE: {
    label: 'Free Bot',
    maxDailyCycleUnits: 5,
    maxOpenPositions: 1,
    maxCycleSeconds: 3,
    features: ['All-timeframe opportunity scan', 'Liquidity and setup analysis', '5 daily units × 5 trade rounds per unit'],
  },
  REGULAR: {
    label: 'Regular Bot',
    maxDailyCycleUnits: 15,
    maxOpenPositions: 3,
    maxCycleSeconds: 3,
    features: ['All-timeframe opportunity scan', 'Advanced trade management', 'Extended simulator research', '15 daily units × 5 trade rounds per unit'],
  },
  PRO: {
    label: 'Pro Bot',
    maxDailyCycleUnits: null,
    maxOpenPositions: 10,
    maxCycleSeconds: 3,
    features: ['All-timeframe opportunity scan', 'Advanced learning and backtesting', 'Highest simulator limits', 'Unlimited bot units while active'],
  },
}

export const BOT_CYCLES_PER_UNIT = 5 as const
export const cycleUnitsForSeconds = (seconds: 3 | 5 | 10): number => seconds === 10 ? 2 : 1
export const canConsumeCycleUnits = (plan: BotPlan, usedUnits: number, seconds: 3 | 5 | 10): boolean => {
  if (seconds > BOT_PLANS[plan].maxCycleSeconds) return false
  const max = BOT_PLANS[plan].maxDailyCycleUnits
  return max === null || usedUnits + cycleUnitsForSeconds(seconds) <= max
}
export const remainingDailyCycleUnits = (plan: BotPlan, usedUnits: number): number | null => {
  const max = BOT_PLANS[plan].maxDailyCycleUnits
  return max === null ? null : Math.max(0, max - usedUnits)
}
