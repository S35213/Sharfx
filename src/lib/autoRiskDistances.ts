/**
 * Scale AUTO stop/target distances with the account-currency risk amount.
 *
 * The ticket uses 10 account-currency units as its reference:
 * $2 -> 20% of the base distance, $4 -> 40%, and $10 -> 100%.
 * Stops/targets loaded from a selected setup keep their relative ratio.
 */
export const scaleAutoRiskDistance = (
  basePips: number,
  riskAmount: number,
  baselineRiskAmount = 10,
): number => {
  if (!Number.isFinite(basePips) || basePips <= 0) return 0
  const hasRiskAmount = Number.isFinite(riskAmount) && riskAmount > 0
  const scale = hasRiskAmount && Number.isFinite(baselineRiskAmount) && baselineRiskAmount > 0
    ? Math.min(10, Math.max(0.1, riskAmount / baselineRiskAmount))
    : 1
  // A one-pip floor avoids setting an almost-zero protection price after
  // symbol price-precision rounding on smaller CFD contracts.
  return Math.max(1, Number((basePips * scale).toFixed(1)))
}
