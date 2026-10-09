export type QuoteTickDirection = 'up' | 'down' | 'neutral'

export const getQuoteTickDirection = (next: number, previous: number): QuoteTickDirection => {
  if (!Number.isFinite(next) || !Number.isFinite(previous) || next === previous) return 'neutral'
  return next > previous ? 'up' : 'down'
}
