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
