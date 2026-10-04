import type { SymbolSpec, TradePlanDraft, TradeSide } from '../types'

export interface TradePlanInputs {
  accountBalance: number
  entryPrice: number
  slPrice: number | null
  tpPrice: number | null
  stake: number
  multiplier: number
  symbolSpec: SymbolSpec
  side: TradeSide
}

const round = (value: number, digits: number): number => Number(value.toFixed(digits))

const estimateProtectionAmount = (entryPrice: number, targetPrice: number, stake: number, multiplier: number): number => {
  const percentageMove = Math.abs(targetPrice - entryPrice) / entryPrice
  return percentageMove * multiplier * stake
}

export const calculateTradePlan = (inputs: TradePlanInputs): TradePlanDraft => {
  const {
    accountBalance,
    entryPrice,
    slPrice,
    tpPrice,
    stake,
    multiplier,
    symbolSpec,
    side,
  } = inputs

  const base: TradePlanDraft = {
    side,
    entryPrice,
    slPrice,
    tpPrice,
    stake,
    multiplier,
    slDistancePips: null,
    tpDistancePips: null,
    estimatedSlAmount: null,
    estimatedTpAmount: null,
    estimatedRiskPercent: 0,
    estimatedRewardAmount: null,
    estimatedRiskRewardRatio: null,
    estimatedMaxStakePercent: 0,
    validationError: null,
  }

  if (!Number.isFinite(accountBalance) || accountBalance <= 0) {
    return { ...base, validationError: 'Account balance is unavailable.' }
  }
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    return { ...base, validationError: 'Live market price is unavailable.' }
  }
  if (!Number.isFinite(stake) || stake < 1) {
    return { ...base, validationError: 'Stake must be at least 1.' }
  }
  if (stake > accountBalance) {
    return { ...base, validationError: 'Stake exceeds available balance.' }
  }
  if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 10000) {
    return { ...base, validationError: 'Multiplier must be between 1 and 10,000.' }
  }
  if (!Number.isFinite(symbolSpec.pipSize) || symbolSpec.pipSize <= 0) {
    return { ...base, validationError: 'Symbol pip size is unavailable.' }
  }

  const estimatedMaxStakePercent = round((stake / accountBalance) * 100, 2)
  const next = { ...base, estimatedMaxStakePercent }

  if (slPrice !== null) {
    if (!Number.isFinite(slPrice) || slPrice <= 0) {
      return { ...next, validationError: 'Stop Loss price is invalid.' }
    }
    if (side === 'BUY' && slPrice >= entryPrice) {
      return { ...next, validationError: 'For BUY, Stop Loss must be below Entry.' }
    }
    if (side === 'SELL' && slPrice <= entryPrice) {
      return { ...next, validationError: 'For SELL, Stop Loss must be above Entry.' }
    }
    const distance = Math.abs(entryPrice - slPrice)
    const amount = estimateProtectionAmount(entryPrice, slPrice, stake, multiplier)
    const slDistancePips = round(distance / symbolSpec.pipSize, 1)
    const estimatedSlAmount = round(amount, 2)
    if (estimatedSlAmount > stake + 1e-8) {
      return {
        ...next,
        slDistancePips,
        estimatedSlAmount,
        estimatedRiskPercent: round((estimatedSlAmount / accountBalance) * 100, 2),
        validationError: 'This Stop Loss would exceed the stake exposure. Reduce the price distance or increase the stake.',
      }
    }
    next.slDistancePips = slDistancePips
    next.estimatedSlAmount = estimatedSlAmount
    next.estimatedRiskPercent = round((estimatedSlAmount / accountBalance) * 100, 2)
  }

  if (tpPrice !== null) {
    if (!Number.isFinite(tpPrice) || tpPrice <= 0) {
      return { ...next, validationError: 'Take Profit price is invalid.' }
    }
    if (side === 'BUY' && tpPrice <= entryPrice) {
      return { ...next, validationError: 'For BUY, Take Profit must be above Entry.' }
    }
    if (side === 'SELL' && tpPrice >= entryPrice) {
      return { ...next, validationError: 'For SELL, Take Profit must be below Entry.' }
    }
    const distance = Math.abs(tpPrice - entryPrice)
    const amount = estimateProtectionAmount(entryPrice, tpPrice, stake, multiplier)
    next.tpDistancePips = round(distance / symbolSpec.pipSize, 1)
    next.estimatedTpAmount = round(amount, 2)
    next.estimatedRewardAmount = next.estimatedTpAmount
  }

  if (next.estimatedSlAmount !== null && next.estimatedTpAmount !== null && next.estimatedSlAmount > 0) {
    next.estimatedRiskRewardRatio = round(next.estimatedTpAmount / next.estimatedSlAmount, 2)
  }

  return next
}
