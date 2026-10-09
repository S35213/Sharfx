import type { SymbolSpec, TradeSide } from '../types'

export interface CfdRiskInput {
  accountBalance: number
  accountCurrency: string
  symbol: SymbolSpec
  side: TradeSide
  entryPrice: number
  stopLossPrice: number
  takeProfitPrice: number
  riskAmount?: number
  riskPercent?: number
  lots?: number
  /** Quote-currency value expressed in account currency. Required when quoteCurrency differs from accountCurrency. */
  quoteToAccountRate?: number
  /** Base-currency value expressed in account currency. Used for notional/margin conversion when base differs from accountCurrency. */
  baseToAccountRate?: number
  effectiveLeverage?: number
}

export interface CfdRiskPlan {
  valid: boolean
  error?: string
  warning?: string
  entryPrice: number
  stopLossPrice: number
  takeProfitPrice: number
  stopDistancePips: number
  targetDistancePips: number
  riskRewardRatio: number
  requestedRiskAmount: number
  riskPercent: number
  pipValuePerLot: number
  lotSize: number
  notionalValue: number
  estimatedLossAtStop: number
  estimatedRewardAtTarget: number
  estimatedMargin: number | null
}

const EPSILON = 1e-12

const isPositiveFinite = (value: number): boolean => Number.isFinite(value) && value > 0

export const roundToStep = (value: number, step: number, mode: 'down' | 'nearest' = 'down'): number => {
  if (!isPositiveFinite(value) || !isPositiveFinite(step)) return 0
  const units = value / step
  const rounded = mode === 'nearest' ? Math.round(units) : Math.floor(units + EPSILON)
  return Number((rounded * step).toFixed(10))
}

export const normalizeLotSize = (lots: number, symbol: SymbolSpec, mode: 'down' | 'nearest' = 'down'): number => {
  if (!isPositiveFinite(lots)) return 0
  const bounded = Math.min(symbol.maxLotSize, Math.max(symbol.minLotSize, lots))
  return roundToStep(bounded, symbol.lotStep, mode)
}

export const getPipDistance = (priceA: number, priceB: number, pipSize: number): number | null => {
  if (!isPositiveFinite(priceA) || !isPositiveFinite(priceB) || !isPositiveFinite(pipSize)) return null
  return Math.abs(priceA - priceB) / pipSize
}

/**
 * Calculates the money value of one pip for one standard lot.
 *
 * SHAFX deliberately requires an explicit quote-to-account conversion when
 * the quote currency is not the account currency. This avoids silently
 * pretending every FX pair is USD-quoted.
 */
export const calculatePipValuePerLot = (symbol: SymbolSpec, accountCurrency: string, quoteToAccountRate = 1): number | null => {
  if (!isPositiveFinite(symbol.contractSize) || !isPositiveFinite(symbol.pipSize)) return null
  if (symbol.quoteCurrency === accountCurrency) return symbol.contractSize * symbol.pipSize
  if (!isPositiveFinite(quoteToAccountRate)) return null
  return symbol.contractSize * symbol.pipSize * quoteToAccountRate
}

export const calculateNotionalValue = (
  symbol: SymbolSpec,
  entryPrice: number,
  lots: number,
  baseToAccountRate = 1,
): number | null => {
  if (!isPositiveFinite(entryPrice) || !isPositiveFinite(lots) || !isPositiveFinite(symbol.contractSize)) return null
  if (symbol.baseCurrency === '' || symbol.quoteCurrency === '') return null
  const quoteNotional = lots * symbol.contractSize * entryPrice
  if (symbol.quoteCurrency === 'USD' || symbol.quoteCurrency === '') return quoteNotional
  if (isPositiveFinite(baseToAccountRate) && symbol.baseCurrency !== 'USD') {
    return quoteNotional * baseToAccountRate
  }
  return quoteNotional
}

export const calculateLotSizeForRisk = (riskAmount: number, stopDistancePips: number, pipValuePerLot: number, symbol: SymbolSpec): number => {
  if (!isPositiveFinite(riskAmount) || !isPositiveFinite(stopDistancePips) || !isPositiveFinite(pipValuePerLot)) return 0
  return normalizeLotSize(riskAmount / (stopDistancePips * pipValuePerLot), symbol, 'down')
}

const sideValid = (side: TradeSide, entry: number, stop: number, target: number): boolean => {
  if (side === 'BUY') return stop < entry && target > entry
  return stop > entry && target < entry
}

export const calculateCfdRiskPlan = (input: CfdRiskInput): CfdRiskPlan => {
  const {
    accountBalance,
    accountCurrency,
    symbol,
    side,
    entryPrice,
    stopLossPrice,
    takeProfitPrice,
    riskAmount,
    riskPercent,
    lots,
    quoteToAccountRate = 1,
    baseToAccountRate = 1,
    effectiveLeverage,
  } = input

  const stopDistancePips = getPipDistance(entryPrice, stopLossPrice, symbol.pipSize) ?? 0
  const targetDistancePips = getPipDistance(entryPrice, takeProfitPrice, symbol.pipSize) ?? 0
  const requestedRiskAmount = riskAmount !== undefined
    ? Number(riskAmount)
    : Number.isFinite(riskPercent)
      ? accountBalance * Number(riskPercent) / 100
      : 0

  const pipValuePerLot = calculatePipValuePerLot(symbol, accountCurrency, quoteToAccountRate) ?? 0
  const calculatedLots = lots !== undefined
    ? normalizeLotSize(Number(lots), symbol, 'down')
    : calculateLotSizeForRisk(requestedRiskAmount, stopDistancePips, pipValuePerLot, symbol)
  const notionalValue = calculateNotionalValue(symbol, entryPrice, calculatedLots, baseToAccountRate) ?? 0
  const estimatedLossAtStop = calculatedLots * stopDistancePips * pipValuePerLot
  const estimatedRewardAtTarget = calculatedLots * targetDistancePips * pipValuePerLot
  const riskRewardRatio = stopDistancePips > 0 ? targetDistancePips / stopDistancePips : 0
  const riskPct = accountBalance > 0 ? (estimatedLossAtStop / accountBalance) * 100 : 0
  const leverage = Number(effectiveLeverage)
  const estimatedMargin = isPositiveFinite(leverage) && notionalValue > 0
    ? notionalValue / leverage
    : null

  if (!isPositiveFinite(accountBalance)) return { valid: false, error: 'Account balance must be greater than zero.', entryPrice, stopLossPrice, takeProfitPrice, stopDistancePips, targetDistancePips, riskRewardRatio, requestedRiskAmount, riskPercent: riskPct, pipValuePerLot, lotSize: calculatedLots, notionalValue, estimatedLossAtStop, estimatedRewardAtTarget, estimatedMargin }
  if (!isPositiveFinite(entryPrice) || !isPositiveFinite(stopLossPrice) || !isPositiveFinite(takeProfitPrice)) return { valid: false, error: 'Entry, stop loss, and take profit must all be valid prices.', entryPrice, stopLossPrice, takeProfitPrice, stopDistancePips, targetDistancePips, riskRewardRatio, requestedRiskAmount, riskPercent: riskPct, pipValuePerLot, lotSize: calculatedLots, notionalValue, estimatedLossAtStop, estimatedRewardAtTarget, estimatedMargin }
  if (!sideValid(side, entryPrice, stopLossPrice, takeProfitPrice)) return { valid: false, error: side === 'BUY' ? 'BUY requires SL below entry and TP above entry.' : 'SELL requires SL above entry and TP below entry.', entryPrice, stopLossPrice, takeProfitPrice, stopDistancePips, targetDistancePips, riskRewardRatio, requestedRiskAmount, riskPercent: riskPct, pipValuePerLot, lotSize: calculatedLots, notionalValue, estimatedLossAtStop, estimatedRewardAtTarget, estimatedMargin }
  if (!isPositiveFinite(stopDistancePips)) return { valid: false, error: 'Stop-loss distance must be greater than zero.', entryPrice, stopLossPrice, takeProfitPrice, stopDistancePips, targetDistancePips, riskRewardRatio, requestedRiskAmount, riskPercent: riskPct, pipValuePerLot, lotSize: calculatedLots, notionalValue, estimatedLossAtStop, estimatedRewardAtTarget, estimatedMargin }
  if (!isPositiveFinite(pipValuePerLot)) return { valid: false, error: 'SHAFX needs a valid pip-value conversion before sizing the position.', entryPrice, stopLossPrice, takeProfitPrice, stopDistancePips, targetDistancePips, riskRewardRatio, requestedRiskAmount, riskPercent: riskPct, pipValuePerLot, lotSize: calculatedLots, notionalValue, estimatedLossAtStop, estimatedRewardAtTarget, estimatedMargin }
  if (!isPositiveFinite(calculatedLots)) return { valid: false, error: 'The requested risk would produce a volume below the broker minimum or an invalid position size.', entryPrice, stopLossPrice, takeProfitPrice, stopDistancePips, targetDistancePips, riskRewardRatio, requestedRiskAmount, riskPercent: riskPct, pipValuePerLot, lotSize: calculatedLots, notionalValue, estimatedLossAtStop, estimatedRewardAtTarget, estimatedMargin }
  if (calculatedLots < symbol.minLotSize - EPSILON || calculatedLots > symbol.maxLotSize + EPSILON) return { valid: false, error: 'Position size is outside the broker symbol range.', entryPrice, stopLossPrice, takeProfitPrice, stopDistancePips, targetDistancePips, riskRewardRatio, requestedRiskAmount, riskPercent: riskPct, pipValuePerLot, lotSize: calculatedLots, notionalValue, estimatedLossAtStop, estimatedRewardAtTarget, estimatedMargin }
  const brokerMinimumRiskWarning = requestedRiskAmount > 0 && estimatedLossAtStop > requestedRiskAmount * 1.05 && lots === undefined
    ? 'The broker minimum lot requires more stop-loss risk than the selected risk amount. SHAFX will show the actual broker-sized risk and ask cTrader to confirm margin when you trade.'
    : undefined

  return { valid: true, ...(brokerMinimumRiskWarning ? { warning: brokerMinimumRiskWarning } : {}), entryPrice, stopLossPrice, takeProfitPrice, stopDistancePips, targetDistancePips, riskRewardRatio, requestedRiskAmount, riskPercent: riskPct, pipValuePerLot, lotSize: calculatedLots, notionalValue, estimatedLossAtStop, estimatedRewardAtTarget, estimatedMargin }
}
