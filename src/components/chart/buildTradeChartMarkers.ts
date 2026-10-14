import type { SeriesMarker, UTCTimestamp } from 'lightweight-charts'
import type { Timeframe } from '../../types'

export interface TradeChartMarker {
  id: string
  side: 'BUY' | 'SELL'
  openTime: string
  closeTime?: string
  entryPrice: number
  exitPrice?: number
  volume: number
  status: 'open' | 'pending' | 'closed'
  profit?: number
}

const timeframeSeconds: Record<Timeframe, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  M30: 1800,
  H1: 3600,
  H4: 14400,
  D1: 86400,
  W1: 604800,
}

const candleBucket = (timestampSeconds: number, timeframe: Timeframe): number => {
  if (timeframe !== 'W1') {
    const duration = timeframeSeconds[timeframe]
    return Math.floor(timestampSeconds / duration) * duration
  }

  const date = new Date(timestampSeconds * 1000)
  const offsetFromMonday = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - offsetFromMonday)
  date.setUTCHours(0, 0, 0, 0)
  return Math.floor(date.getTime() / 1000)
}

interface CandleTimeLike { time: unknown }

const candleAtTradeTime = (timestampText: string | undefined, candles: readonly CandleTimeLike[], timeframe: Timeframe): number | null => {
  if (!timestampText || candles.length === 0) return null
  const timestampMs = Date.parse(timestampText)
  if (!Number.isFinite(timestampMs)) return null

  const timestamp = Math.floor(timestampMs / 1000)
  const bucket = candleBucket(timestamp, timeframe)
  const candleTimes = candles.map((candle) => Number(candle.time)).filter(Number.isFinite)
  const exact = candleTimes.find((candleTime) => candleTime === bucket)
  if (exact !== undefined) return exact

  // Only associate a trade with a candle if the timestamp lies inside that
  // candle's timeframe interval. Do not pin markers to an unrelated candle
  // when broker history genuinely has a missing bar.
  for (let index = 0; index < candleTimes.length; index += 1) {
    const candleTime = candleTimes[index]
    const nextTime = candleTimes[index + 1]
    const isInsideCandle = candleTime <= timestamp &&
      (nextTime !== undefined ? timestamp < nextTime : timestamp < candleTime + timeframeSeconds[timeframe])
    if (isInsideCandle) {
      return timestamp < candleTime + timeframeSeconds[timeframe] ? candleTime : null
    }
  }
  return null
}

interface MarkerGroup {
  marker: SeriesMarker<UTCTimestamp>
  count: number
  firstText: string
  texts: string[]
  key: string
}

/**
 * Keep an entry arrow on the original candle for both open and completed trades.
 * This provides stable time context alongside the exact entry/SL/TP price lines.
 * Closed trades also get a compact OUT marker at their exit candle.
 */
export const buildTradeChartMarkers = (
  candles: readonly CandleTimeLike[],
  trades: readonly TradeChartMarker[],
  timeframe: Timeframe,
): SeriesMarker<UTCTimestamp>[] => {
  if (candles.length === 0 || trades.length === 0) return []

  const groups = new Map<string, MarkerGroup>()
  const add = (key: string, marker: SeriesMarker<UTCTimestamp>): void => {
    const current = groups.get(key)
    if (current) {
      current.count += 1
      current.texts.push(marker.text || '')
      return
    }
    groups.set(key, { marker, count: 1, firstText: marker.text || '', texts: [marker.text || ''], key })
  }

  for (const trade of trades) {
    const entryTime = candleAtTradeTime(trade.openTime, candles, timeframe)
    if ((trade.status === 'open' || trade.status === 'closed') && entryTime !== null && Number.isFinite(trade.entryPrice) && trade.entryPrice > 0) {
      const isBuy = trade.side === 'BUY'
      const lots = Number.isFinite(trade.volume) && trade.volume > 0 ? trade.volume.toFixed(2) : ''
      const text = [trade.side, lots].filter(Boolean).join(' ')
      const key = String(entryTime) + ':entry:' + trade.side
      add(key, {
        time: entryTime as UTCTimestamp,
        position: isBuy ? 'belowBar' : 'aboveBar',
        color: isBuy ? '#22D3A5' : '#FF5C75',
        shape: isBuy ? 'arrowUp' : 'arrowDown',
        text,
        size: 1,
      })
    }

    if (trade.status === 'closed' && trade.closeTime && Number.isFinite(trade.exitPrice) && Number(trade.exitPrice) > 0) {
      const exitTime = candleAtTradeTime(trade.closeTime, candles, timeframe)
      if (exitTime === null) continue
      const positive = Number(trade.profit ?? 0) >= 0
      const key = String(exitTime) + ':exit:' + (positive ? 'win' : 'loss')
      add(key, {
        time: exitTime as UTCTimestamp,
        position: trade.side === 'BUY' ? 'aboveBar' : 'belowBar',
        color: positive ? '#77D6A5' : '#F5B84B',
        shape: 'circle',
        text: positive ? 'OUT +' : 'OUT −',
        size: 1,
      })
    }
  }

  return [...groups.values()]
    .sort((a, b) => Number(a.marker.time) - Number(b.marker.time) || a.key.localeCompare(b.key))
    .map(({ marker, count, firstText, texts, key }) => {
      if (count <= 1) return { ...marker, text: firstText }
      if (!key.includes(':entry:')) return { ...marker, text: firstText + ' ×' + count }

      const side = firstText.split(' ')[0]
      const lots = texts.map((text) => text.split(' ').slice(1).join(' ')).filter(Boolean)
      const uniqueLots = [...new Set(lots)]
      const text = uniqueLots.length === 1
        ? [side, uniqueLots[0], '×' + count].filter(Boolean).join(' ')
        : [side, lots.join(' + ')].filter(Boolean).join(' ')
      return { ...marker, text }
    })
}
