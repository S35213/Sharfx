export type WeekendMarketKind = 'fx' | 'metal' | 'other'

export interface WeekendMarketStatus {
  kind: WeekendMarketKind
  isClosed: boolean
  reason: string | null
  /** The broker's exact session schedule may differ; this is a standard-market guard. */
  scheduleNote: string
}

const CURRENCY_CODES = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'NZD', 'CAD',
  'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'TRY', 'MXN',
  'ZAR', 'SGD', 'HKD', 'CNH', 'CNY', 'THB', 'ILS',
])

const normaliseLetters = (symbol: string): string => String(symbol ?? '').toUpperCase().replace(/[^A-Z]/g, '')

const isCurrencyPair = (symbol: string): boolean => {
  const compact = normaliseLetters(symbol)
  for (let index = 0; index <= compact.length - 6; index += 1) {
    const base = compact.slice(index, index + 3)
    const quote = compact.slice(index + 3, index + 6)
    if (base !== quote && CURRENCY_CODES.has(base) && CURRENCY_CODES.has(quote)) return true
  }
  return false
}

const newYorkClock = (timestampMs: number): { weekday: number; hour: number; minute: number } | null => {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) return null
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(timestampMs))
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    const weekday = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[values.weekday]
    const hour = Number(values.hour)
    const minute = Number(values.minute)
    if (weekday === undefined || !Number.isInteger(hour) || !Number.isInteger(minute)) return null
    return { weekday, hour, minute }
  } catch {
    return null
  }
}

/**
 * Conservative weekend-only schedule for the chart and Trade Bot.
 * Forex commonly trades 17:00 New York Sunday through 17:00 Friday; metals
 * generally reopen later Sunday. cTrader broker hours/holidays can differ, so
 * this helper never claims to know weekday holiday calendars or a broker's
 * exact instrument schedule.
 */
export const getWeekendMarketStatus = (symbol: string, timestampMs = Date.now()): WeekendMarketStatus => {
  const compact = normaliseLetters(symbol)
  const metal = /XAU(?:USD|EUR|GBP|JPY|CHF|AUD|CAD|NZD)|XAG(?:USD|EUR|GBP|JPY|CHF|AUD|CAD|NZD)|(?:USD|EUR|GBP|JPY|CHF|AUD|CAD|NZD)XAU|(?:USD|EUR|GBP|JPY|CHF|AUD|CAD|NZD)XAG/.test(compact)
  const fx = !metal && isCurrencyPair(symbol)
  const kind: WeekendMarketKind = metal ? 'metal' : fx ? 'fx' : 'other'
  const scheduleNote = kind === 'metal'
    ? 'Standard spot metals hours are approximately Sunday 18:00 to Friday 17:00 New York time; your broker may vary.'
    : 'Standard FX hours are approximately Sunday 17:00 to Friday 17:00 New York time; your broker may vary.'

  if (kind === 'other') {
    return {
      kind,
      isClosed: false,
      reason: null,
      scheduleNote: 'No generic weekend schedule is applied to this instrument; use the broker’s own market status.',
    }
  }

  const clock = newYorkClock(timestampMs)
  if (!clock) {
    return {
      kind,
      isClosed: false,
      reason: null,
      scheduleNote,
    }
  }

  const sundayOpenHour = metal ? 18 : 17
  const beforeSundayOpen = clock.weekday === 0 &&
    (clock.hour < sundayOpenHour || (clock.hour === sundayOpenHour && clock.minute < 5))
  const afterFridayClose = clock.weekday === 5 &&
    (clock.hour > 16 || (clock.hour === 16 && clock.minute >= 59))
  const isClosed = clock.weekday === 6 || beforeSundayOpen || afterFridayClose

  return {
    kind,
    isClosed,
    reason: isClosed
      ? (metal ? 'Spot metals market is closed for the weekend.' : 'FX market is closed for the weekend.')
      : null,
    scheduleNote,
  }
}
