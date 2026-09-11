import type { RiskCalculationInputs, RiskCalculationResult } from '../../types'

const fail = (msg: string): RiskCalculationResult => ({ isValid: false, errorMessage: msg, riskAmount: 0, stopDistancePips: 0, rewardDistancePips: 0, riskRewardRatio: 0, suggestedLotSize: 0, pipValuePerLot: 0, estimatedLossAtStop: 0 })

const finitePositive = (value: number): boolean => Number.isFinite(value) && value > 0

export const calculateRisk = (inputs: RiskCalculationInputs): RiskCalculationResult => {
  const { accountBalance, accountCurrency, riskPercent, side, entryPrice, stopLoss, takeProfit, symbolSpec, conversionRate } = inputs
  if (!finitePositive(accountBalance)) return fail('Account balance must be a positive finite number.')
  if (!Number.isFinite(riskPercent) || riskPercent <= 0 || riskPercent > 100) return fail('Risk % must be greater than 0 and at most 100.')
  if (!finitePositive(entryPrice)) return fail('Entry price must be a positive finite number.')
  if (!finitePositive(stopLoss)) return fail('Stop loss must be a positive finite number.')
  if (!finitePositive(takeProfit)) return fail('Take profit must be a positive finite number.')
  if (side === 'BUY') {
    if (stopLoss >= entryPrice) return fail('For BUY orders, Stop Loss must be below Entry Price.')
    if (takeProfit <= entryPrice) return fail('For BUY orders, Take Profit must be above Entry Price.')
  } else {
    if (stopLoss <= entryPrice) return fail('For SELL orders, Stop Loss must be above Entry Price.')
    if (takeProfit >= entryPrice) return fail('For SELL orders, Take Profit must be below Entry Price.')
  }
  if (!finitePositive(symbolSpec.pipSize) || !finitePositive(symbolSpec.contractSize)) return fail('Symbol specification is invalid.')
  if (!finitePositive(symbolSpec.minLotSize) || !finitePositive(symbolSpec.maxLotSize) || !finitePositive(symbolSpec.lotStep)) return fail('Symbol lot configuration is invalid.')
  if (symbolSpec.minLotSize > symbolSpec.maxLotSize) return fail('Symbol min lot exceeds max lot.')

  const stopDistancePips = Math.abs(entryPrice - stopLoss) / symbolSpec.pipSize
  const rewardDistancePips = Math.abs(takeProfit - entryPrice) / symbolSpec.pipSize
  if (!finitePositive(stopDistancePips)) return fail('Stop distance must be greater than zero.')
  if (!finitePositive(rewardDistancePips)) return fail('Reward distance must be greater than zero.')

  let rate: number
  if (symbolSpec.quoteCurrency === accountCurrency) {
    rate = 1
  } else {
    if (!finitePositive(conversionRate)) return fail(`Missing or invalid conversion rate for ${symbolSpec.quoteCurrency}/${accountCurrency}.`)
    rate = conversionRate
  }

  const pipValuePerLot = symbolSpec.pipSize * symbolSpec.contractSize * rate
  const riskAmount = accountBalance * (riskPercent / 100)
  if (!finitePositive(pipValuePerLot)) return fail('Computed pip value per lot is invalid.')
  if (!finitePositive(riskAmount)) return fail('Computed risk amount is invalid.')

  const rawLots = riskAmount / (stopDistancePips * pipValuePerLot)
  if (!finitePositive(rawLots)) return fail('Computed position size is invalid.')

  const steps = Math.floor(rawLots / symbolSpec.lotStep + 1e-9)
  const floored = Number((steps * symbolSpec.lotStep).toFixed(8))
  if (floored < symbolSpec.minLotSize) {
    const minLotLoss = symbolSpec.minLotSize * stopDistancePips * pipValuePerLot
    return fail(`Position size (${floored.toFixed(2)} lots) is below the minimum (${symbolSpec.minLotSize.toFixed(2)}). Minimum lot would risk ${minLotLoss.toFixed(2)} ${accountCurrency}, exceeding your ${riskAmount.toFixed(2)} ${accountCurrency} budget. Reduce stop distance or increase account balance.`)
  }

  const lots = Math.min(floored, symbolSpec.maxLotSize)
  const roundedLots = Number(lots.toFixed(8))
  const estimatedLossAtStop = roundedLots * stopDistancePips * pipValuePerLot
  if (!finitePositive(estimatedLossAtStop) || estimatedLossAtStop > riskAmount + 1e-6) return fail('Computed position exceeds the risk budget after lot rounding.')

  const riskRewardRatio = rewardDistancePips / stopDistancePips
  if (!finitePositive(riskRewardRatio)) return fail('Computed risk/reward ratio is invalid.')
  return { isValid: true, riskAmount: Number(riskAmount.toFixed(2)), stopDistancePips: Number(stopDistancePips.toFixed(1)), rewardDistancePips: Number(rewardDistancePips.toFixed(1)), riskRewardRatio: Number(riskRewardRatio.toFixed(2)), suggestedLotSize: roundedLots, pipValuePerLot: Number(pipValuePerLot.toFixed(4)), estimatedLossAtStop: Number(estimatedLossAtStop.toFixed(2)) }
}
