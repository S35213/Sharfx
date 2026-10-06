export type MultiplierDirection = 'BUY' | 'SELL'

export interface MultiplierPnlInput {
  direction: MultiplierDirection
  entryPrice: number
  currentPrice: number
  stake: number
  multiplier: number
  commission?: number
}

const isValidPositive = (value: number): boolean => Number.isFinite(value) && value > 0

const clampLoss = (value: number, stake: number): number => Math.max(-stake, value)

export const multiplierNotional = (stake: number, multiplier: number): number | null => {
  if (!isValidPositive(stake) || !isValidPositive(multiplier)) return null
  return stake * multiplier
}

/**
 * Deriv Multipliers use percentage price movement × multiplier × stake,
 * less the contract commission. Losses cannot exceed the initial stake.
 */
export const calculateMultiplierPnl = ({
  direction,
  entryPrice,
  currentPrice,
  stake,
  multiplier,
  commission = 0,
}: MultiplierPnlInput): number => {
  if (![entryPrice, currentPrice, stake, multiplier, commission].every(Number.isFinite)) return 0
  if (!isValidPositive(entryPrice) || !isValidPositive(currentPrice) || !isValidPositive(stake) || !isValidPositive(multiplier)) return 0

  const safeCommission = Math.max(0, commission)
  const move = (currentPrice - entryPrice) / entryPrice
  const signedMove = direction === 'BUY' ? move : -move
  const grossPnl = signedMove * multiplier * stake
  return clampLoss(grossPnl - safeCommission, stake)
}

export const calculateMultiplierGrossPnl = ({
  direction,
  entryPrice,
  currentPrice,
  stake,
  multiplier,
}: Omit<MultiplierPnlInput, 'commission'>): number =>
  calculateMultiplierPnl({ direction, entryPrice, currentPrice, stake, multiplier, commission: 0 })

export const calculateMultiplierPnlPerPip = (
  entryPrice: number,
  pipSize: number,
  stake: number,
  multiplier: number,
): number | null => {
  if (![entryPrice, pipSize, stake, multiplier].every(Number.isFinite)) return null
  if (!isValidPositive(entryPrice) || !isValidPositive(pipSize) || !isValidPositive(stake) || !isValidPositive(multiplier)) return null
  return (pipSize / entryPrice) * multiplier * stake
}

export const calculateMultiplierRequiredMovePercent = (
  targetPnl: number,
  stake: number,
  multiplier: number,
  commission = 0,
): number | null => {
  if (![targetPnl, stake, multiplier, commission].every(Number.isFinite)) return null
  if (!isValidPositive(stake) || !isValidPositive(multiplier)) return null
  const requiredGrossPnl = targetPnl + Math.max(0, commission)
  return (requiredGrossPnl / (stake * multiplier)) * 100
}

export const calculateMultiplierProtectionPrice = (
  entryPrice: number,
  amount: number,
  stake: number,
  multiplier: number,
  direction: MultiplierDirection,
  kind: 'sl' | 'tp',
): number | null => {
  if (![entryPrice, amount, stake, multiplier].every(Number.isFinite)) return null
  if (!isValidPositive(entryPrice) || !isValidPositive(amount) || !isValidPositive(stake) || !isValidPositive(multiplier)) return null

  const distance = (amount * entryPrice) / (multiplier * stake)
  if (!Number.isFinite(distance) || distance <= 0) return null

  if (kind === 'sl') return direction === 'BUY' ? entryPrice - distance : entryPrice + distance
  return direction === 'BUY' ? entryPrice + distance : entryPrice - distance
}

export const roundMultiplierPnl = (value: number, digits = 4): number =>
  Number(value.toFixed(digits))
