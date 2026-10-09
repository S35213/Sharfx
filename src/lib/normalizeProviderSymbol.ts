/**
 * Normalize provider instrument identifiers to the app's canonical symbol form.
 * cTrader commonly returns FX pairs as compact identifiers (EURUSD), while
 * SHAFX selects them as EUR/USD. Without this normalization an open position
 * could fail to match the selected chart and the ticket would keep showing its
 * moving pre-trade SL/TP preview instead of that position's fixed protection.
 */
export const normalizeProviderSymbol = (value: string): string => {
  const original = value
  const compact = value.trim().toUpperCase().replace(/^FRX/, '').replace(/[^A-Z0-9]/g, '')
  if (/^[A-Z]{6}$/.test(compact)) {
    return compact.slice(0, 3) + '/' + compact.slice(3)
  }
  return original
}


/**
 * Compare chart and broker instruments without changing the provider's stored
 * identifier. FX/CFD brokers may suffix otherwise-identical six-letter symbols
 * (for example EURUSD.r), while the SHAFX watchlist displays EUR/USD.
 */
export const providerSymbolsMatch = (left: string, right: string): boolean => {
  if (normalizeProviderSymbol(left) === normalizeProviderSymbol(right)) return true

  const toComparableFxPair = (value: string): string => {
    const compact = value.trim().toUpperCase().replace(/^FRX/, '').replace(/[^A-Z0-9]/g, '')
    const prefix = compact.match(/^([A-Z]{6})/)
    if (!prefix) return normalizeProviderSymbol(value)
    const pair = prefix[1]
    return pair.slice(0, 3) + '/' + pair.slice(3)
  }

  return toComparableFxPair(left) === toComparableFxPair(right)
}
