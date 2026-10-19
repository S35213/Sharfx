const FX_CURRENCY_CODES = new Set([
  'AUD', 'CAD', 'CHF', 'CNH', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD',
  'HUF', 'JPY', 'MXN', 'NOK', 'NZD', 'PLN', 'SEK', 'SGD', 'TRY',
  'USD', 'ZAR',
])

/** True for conventional fiat/fiat symbols, excluding crypto and commodities. */
export const isStandardForexPair = (symbol: string): boolean => {
  const match = String(symbol ?? '').trim().toUpperCase().match(/^([A-Z]{3})\/([A-Z]{3})$/)
  return Boolean(match && FX_CURRENCY_CODES.has(match[1]) && FX_CURRENCY_CODES.has(match[2]))
}

/**
 * Standard OTC FX market weekly closure, using New York market time to follow
 * the broker's usual Sunday 5 p.m. ET reopening / Friday 5 p.m. ET close.
 *
 * A five-minute Sunday grace period leaves time for broker feeds to reconnect.
 * This describes the normal FX session only; it is not a per-symbol broker
 * holiday calendar, and must not be applied to crypto or commodity symbols.
 */
export const isForexMarketWeekendClosed = (
  symbol: string,
  nowMs = Date.now(),
): boolean => {
  if (!isStandardForexPair(symbol) || !Number.isFinite(nowMs) || nowMs <= 0) return false

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(nowMs))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const weekday = values.weekday
  const hour = Number(values.hour)
  const minute = Number(values.minute)

  if (weekday === 'Sat') return true
  if (weekday === 'Sun') return hour < 17 || (hour === 17 && minute < 5)
  if (weekday === 'Fri') return hour > 16 || (hour === 16 && minute >= 59)
  return false
}
