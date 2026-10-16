import type { Timeframe } from '../../types'

const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  M30: 1800,
  H1: 3600,
  H4: 14400,
  D1: 86400,
  W1: 604800,
}

const utcWeekStart = (timestamp: number): number => {
  const date = new Date(timestamp * 1000)
  const day = date.getUTCDay()
  const daysSinceMonday = day === 0 ? 6 : day - 1
  date.setUTCDate(date.getUTCDate() - daysSinceMonday)
  date.setUTCHours(0, 0, 0, 0)
  return Math.floor(date.getTime() / 1000)
}

/** Seconds remaining until the next UTC candle boundary for the selected timeframe. */
export const getCandleCloseCountdown = (timestamp: number, timeframe: Timeframe): number | null => {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null
  const now = Math.floor(timestamp)
  const duration = TIMEFRAME_SECONDS[timeframe]
  if (!duration) return null
  if (timeframe === 'W1') return Math.max(0, utcWeekStart(now) + duration - now)
  const elapsed = now % duration
  return elapsed === 0 ? duration : duration - elapsed
}
