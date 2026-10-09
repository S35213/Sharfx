import type { SeriesMarker, UTCTimestamp } from 'lightweight-charts'
import type { OHLCV, Timeframe } from '../../types'

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

const candleAtTradeTime = (timestampText: string | undefined, candles: readonly OHLCV[], timeframe: Timeframe): number | null => {
  if (!timestampText || candles.length === 0) return null
  const timestampMs = Date.parse(timestampText)
  if (!Number.isFinite(timestampMs)) return null

  const timestamp = Math.floor(timestampMs / 1000)
  const bucket = candleBucket(timestamp, timeframe)
  const exact = candles.find((candle) => candle.time === bucket)
  if (exact) return exact.time

  // Only associate a trade with a candle if the timestamp lies inside that
  // candle's timeframe interval. Do not pin markers to an unrelated candle
  // when broker history genuinely has a missing bar.
  const previous = candles.find((candle, index) => {
    const next = candles[index + 1]
    return candle.time <= timestamp && (next ? timestamp < next.time : timestamp < candle.time + timeframeSeconds[timeframe])
  })
  return previous && timestamp < previous.time + timeframeSeconds[timeframe] ? previous.time : null
}

interface MarkerGroup {
  marker: SeriesMarker<UTCTimestamp>
  count: number
  firstText: string
  key: string
}

/**
 * SHAFX trade map: the opening arrow points to the candle in which an execution
 * started; a compact OUT marker points to the candle in which a closed trade
 * finished. Exact open-position entry/SL/TP prices remain separate native price
 * lines, so markers add time context without pretending to be exact price levels.
 */
export const buildTradeChartMarkers = (
  candles: readonly OHLCV[],
  trades: readonly TradeChartMarker[],
  timeframe: Timeframe,
): SeriesMarker<UTCTimestamp>[] => {
  if (candles.length === 0 || trades.length === 0) return []

  const groups = new Map<string, MarkerGroup>()
  const add = (key: string, marker: SeriesMarker<UTCTimestamp>): void => {
    const current = groups.get(key)
    if (current) {
      current.count += 1
      return
    }
    groups.set(key, { marker, count: 1, firstText: marker.text || '', key })
  }

  for (const trade of trades) {
    const entryTime = candleAtTradeTime(trade.openTime, candles, timeframe)
    if (entryTime !== null && Number.isFinite(trade.entryPrice) && trade.entryPrice > 0) {
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
    .map(({ marker, count, firstText, key }) => ({
      ...marker,
      text: count > 1 ? (key.includes(':entry:') ? firstText.split(' ')[0] + ' ×' + count : firstText + ' ×' + count) : firstText,
    }))
}
