export type MarketHealthStatus = 'HEALTHY' | 'STALE' | 'INVALID'

export interface MarketHealthInput {
  latestCandleTime: number
  now: number
  maxAgeMs: number
}

export interface MarketHealthResult {
  status: MarketHealthStatus
  ageMs: number
  reason: string
}

export const assessMarketHealth = (input: MarketHealthInput): MarketHealthResult => {
  if (![input.latestCandleTime, input.now, input.maxAgeMs].every(Number.isFinite) || input.maxAgeMs <= 0) {
    return { status: 'INVALID', ageMs: Number.NaN, reason: 'Market clock or freshness threshold is invalid.' }
  }
  const ageMs = input.now - input.latestCandleTime
  if (ageMs < 0) return { status: 'INVALID', ageMs, reason: 'Latest market timestamp is in the future.' }
  if (ageMs > input.maxAgeMs) return { status: 'STALE', ageMs, reason: 'Latest market data is older than the permitted freshness window.' }
  return { status: 'HEALTHY', ageMs, reason: 'Market data is within the permitted freshness window.' }
}
