export type QuoteTickDirection = 'up' | 'down' | 'neutral'
export type TradeButtonSide = 'BUY' | 'SELL'

export const getQuoteTickDirection = (next: number, previous: number): QuoteTickDirection => {
  if (!Number.isFinite(next) || !Number.isFinite(previous) || next === previous) return 'neutral'
  return next > previous ? 'up' : 'down'
}

/** Apply each tile's own live quote direction. BUY uses Ask; SELL uses Bid. */
export const getTradeButtonDirection = (
  marketDirection: QuoteTickDirection,
  side: TradeButtonSide,
): QuoteTickDirection => {
  if (side !== 'BUY' && side !== 'SELL') return 'neutral'
  return marketDirection
}
