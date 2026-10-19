export interface ResolveTradeBotLotSizeInput {
  requestedLots: number
  riskAllowedLots: number
  minimumLots: number
  maximumLots: number
  lotStep: number
}

export interface ResolveTradeBotLotSizeResult {
  requestedLots: number
  lotSize: number | null
  adjusted: boolean
  adjustmentReason: string | null
  error: string | null
}

const EPSILON = 1e-8

const isPositiveFinite = (value: number): boolean => Number.isFinite(value) && value > 0

/**
 * Treat the user's lot entry as a requested maximum. It can be rounded down to
 * the broker's step or reduced to the risk-allowed volume, but is never rounded
 * up beyond what the user entered. Returns an error if even the broker minimum
 * breaches the risk limit.
 */
export const resolveTradeBotLotSize = (
  input: ResolveTradeBotLotSizeInput,
): ResolveTradeBotLotSizeResult => {
  const { requestedLots, riskAllowedLots, minimumLots, maximumLots, lotStep } = input
  const invalid = !isPositiveFinite(requestedLots) ||
    !isPositiveFinite(riskAllowedLots) ||
    !isPositiveFinite(minimumLots) ||
    !isPositiveFinite(maximumLots) ||
    !isPositiveFinite(lotStep) ||
    maximumLots < minimumLots

  if (invalid) {
    return {
      requestedLots,
      lotSize: null,
      adjusted: false,
      adjustmentReason: null,
      error: 'Enter a valid lot size and wait for matching broker lot rules.',
    }
  }
  if (requestedLots < minimumLots - EPSILON) {
    return {
      requestedLots,
      lotSize: null,
      adjusted: false,
      adjustmentReason: null,
      error: 'The requested lot is below the broker minimum of ' + minimumLots + ' lots.',
    }
  }
  if (riskAllowedLots < minimumLots - EPSILON) {
    return {
      requestedLots,
      lotSize: null,
      adjusted: false,
      adjustmentReason: null,
      error: 'The broker minimum of ' + minimumLots + ' lots exceeds the account stop-risk limit. No entry is safe for this setup.',
    }
  }

  const brokerBoundedRequest = Math.min(requestedLots, maximumLots)
  const requestedStepCount = Math.floor((brokerBoundedRequest - minimumLots + EPSILON) / lotStep)
  const steppedRequest = Number((minimumLots + requestedStepCount * lotStep).toFixed(10))
  const riskBounded = Math.min(steppedRequest, riskAllowedLots, maximumLots)
  const riskStepCount = Math.floor((riskBounded - minimumLots + EPSILON) / lotStep)
  const lotSize = Number((minimumLots + riskStepCount * lotStep).toFixed(10))

  if (!isPositiveFinite(lotSize) || lotSize < minimumLots - EPSILON) {
    return {
      requestedLots,
      lotSize: null,
      adjusted: false,
      adjustmentReason: null,
      error: 'No broker-valid lot size fits the account risk limit. No order was sent.',
    }
  }

  const reasons: string[] = []
  if (requestedLots > maximumLots + EPSILON) reasons.push('broker maximum')
  if (Math.abs(steppedRequest - requestedLots) > EPSILON && requestedLots <= maximumLots + EPSILON) {
    reasons.push('broker lot step')
  }
  if (lotSize < steppedRequest - EPSILON) reasons.push('account stop-risk limit')

  return {
    requestedLots,
    lotSize,
    adjusted: lotSize < requestedLots - EPSILON,
    adjustmentReason: reasons.length
      ? 'Lot size adjusted to ' + lotSize + ' lots to fit the ' + reasons.join(' and ') + '.'
      : null,
    error: null,
  }
}
