export type QuoteTickDirection = 'up' | 'down' | 'neutral'
export type TradeButtonSide = 'BUY' | 'SELL'

export const getQuoteTickDirection = (next: number, previous: number): QuoteTickDirection => {
  if (!Number.isFinite(next) || !Number.isFinite(previous) || next === previous) return 'neutral'
  return next > previous ? 'up' : 'down'
}

/** Opposite trade sides react to the same market move with opposite tones. */
export const getTradeButtonDirection = (
  marketDirection: QuoteTickDirection,
  side: TradeButtonSide,
): QuoteTickDirection => {
  if (marketDirection === 'neutral') return 'neutral'
  if (side === 'BUY') return marketDirection
  return marketDirection === 'up' ? 'down' : 'up'
}
