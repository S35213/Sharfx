import type { OHLCV, Timeframe } from '../../types'
import { normalizeMarketCandles } from '../../lib/marketCandles'

export interface CTraderLiveQuote {
  symbol: string
  bid?: number
  ask?: number
  last?: number
  timestamp: string
}

export interface CTraderLiveInstrument {
  symbol: string
  providerSymbol: string
  contractSize?: number
  pipSize?: number
  quantityMin?: number
  quantityMax?: number
  quantityStep?: number
  priceIncrement?: number
  tradable: boolean
  metadata?: Record<string, unknown>
}

export interface CTraderQuoteUpdateMeta {
  pricesChanged: boolean
  quoteClockAdvanced: boolean
  /** True on the first fresh broker quote after a hidden/backgrounded tab resumes. */
  resumed?: boolean
}

interface SubscribeArgs {
  connectionId: string
  accountId: string
  environment: 'demo' | 'live'
  symbol: string
}

interface StreamState {
  listeners: Set<(quote: CTraderLiveQuote, instrument: CTraderLiveInstrument, update: CTraderQuoteUpdateMeta) => void>
  timer: ReturnType<typeof setInterval> | null
  inFlight: Promise<void> | null
  stopped: boolean
  instrument: CTraderLiveInstrument | null
  lastBid: number | null
  lastAsk: number | null
  lastMinuteBucket: number | null
  lastNotifiedAt: number
  resumeRefreshPending: boolean
  resumeListener: (() => void) | null
}

const streams = new Map<string, StreamState>()
// Check the persistent server-side cTrader spot stream frequently so the chart
// reflects broker ticks promptly. In-flight requests are still deduplicated.
const POLL_INTERVAL_MS = 150

const streamKey = ({ connectionId, accountId, environment, symbol }: SubscribeArgs): string =>
  [connectionId, accountId, environment, symbol.toUpperCase()].join(':')

const requestQuote = async (args: SubscribeArgs): Promise<{ quote: CTraderLiveQuote; instrument: CTraderLiveInstrument }> => {
  const response = await fetch('/api/providers/ctrader', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      providerId: 'ctrader',
      connectionId: args.connectionId,
      accountId: args.accountId,
      environment: args.environment,
      action: 'quote',
      symbol: args.symbol,
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload?.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'SHAFX cTrader live quote request failed.')
  const quote = payload.quote as CTraderLiveQuote
  const instrument = payload.instrument as CTraderLiveInstrument
  if (!instrument?.providerSymbol || !Number.isFinite(Number(quote?.bid)) || !Number.isFinite(Number(quote?.ask))) {
    throw new Error('cTrader returned an incomplete live price.')
  }
  return { quote, instrument }
}
/**
 * cTrader trendbars are delivered by the server in epoch milliseconds, while
 * Lightweight Charts and the rest of SHAFX use Unix seconds. Normalize this
 * once at the provider boundary before candles enter any chart/cache/analysis.
 * The magnitude check also accepts already-normalized seconds.
 */
export const normalizeCTraderHistoricalCandles = (candles: readonly OHLCV[]): OHLCV[] =>
  normalizeMarketCandles(candles.map((candle) => {
    const timestamp = Number(candle.time)
    return {
      ...candle,
      time: Number.isFinite(timestamp)
        ? Math.trunc(timestamp > 100_000_000_000 ? timestamp / 1000 : timestamp)
        : Number.NaN,
    }
  }))

export const fetchCTraderHistoricalCandles = async (args: SubscribeArgs & { timeframe: Timeframe; count?: number }): Promise<OHLCV[]> => {
  const response = await fetch('/api/providers/ctrader', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      providerId: 'ctrader',
      connectionId: args.connectionId,
      accountId: args.accountId,
      environment: args.environment,
      action: 'candles',
      symbol: args.symbol,
      timeframe: args.timeframe,
      count: args.count ?? 300,
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload?.ok || !Array.isArray(payload.candles)) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : 'SHAFX cTrader historical candles request failed.')
  }
  return normalizeCTraderHistoricalCandles(payload.candles as OHLCV[])
}



export const shouldNotifyCTraderQuoteListener = (
  update: CTraderQuoteUpdateMeta,
  lastPublishedAt: number,
  now: number,
  heartbeatIntervalMs = 1000,
): boolean =>
  update.resumed === true ||
  update.pricesChanged ||
  update.quoteClockAdvanced ||
  lastPublishedAt <= 0 ||
  now - lastPublishedAt >= heartbeatIntervalMs

const poll = async (key: string, args: SubscribeArgs, state: StreamState): Promise<void> => {
  if (state.stopped || state.inFlight) return
  state.inFlight = (async () => {
    try {
      const result = await requestQuote(args)
      if (state.stopped) return
      const bid = Number(result.quote.bid)
      const ask = Number(result.quote.ask)
      const quoteTimestampMs = Date.parse(result.quote.timestamp)
      const quoteMinuteBucket = Number.isFinite(quoteTimestampMs) ? Math.floor(quoteTimestampMs / 60_000) : null
      const pricesChanged = state.lastBid !== bid || state.lastAsk !== ask
      const quoteClockAdvanced = quoteMinuteBucket !== null &&
        state.lastMinuteBucket !== null &&
        quoteMinuteBucket > state.lastMinuteBucket

      if (quoteMinuteBucket !== null && (state.lastMinuteBucket === null || quoteMinuteBucket > state.lastMinuteBucket)) {
        state.lastMinuteBucket = quoteMinuteBucket
      }
      state.lastBid = bid
      state.lastAsk = ask
      state.instrument = result.instrument

      // A tab returning from the background must republish even a flat quote,
      // so consumers can refresh broker history and catch up missed candles.
      // Consumers use this metadata to avoid repainting OHLC on ordinary heartbeats.
      const resumed = state.resumeRefreshPending
      state.resumeRefreshPending = false
      const update: CTraderQuoteUpdateMeta = { pricesChanged, quoteClockAdvanced, resumed }
      const notifiedAt = Date.now()
      if (!shouldNotifyCTraderQuoteListener(update, state.lastNotifiedAt, notifiedAt)) return
      state.lastNotifiedAt = notifiedAt
      for (const listener of state.listeners) listener(result.quote, result.instrument, update)
    } catch {
      // Keep the stream alive. The next 150ms poll retries without spamming UI errors.
    } finally {
      state.inFlight = null
      if (streams.get(key) !== state) streams.delete(key)
    }
  })()
  await state.inFlight
}

export const subscribeCTraderLiveQuote = (args: SubscribeArgs, listener: (quote: CTraderLiveQuote, instrument: CTraderLiveInstrument, update: CTraderQuoteUpdateMeta) => void): (() => void) => {
  const key = streamKey(args)
  let state = streams.get(key)
  if (!state) {
    state = {
      listeners: new Set(),
      timer: null,
      inFlight: null,
      stopped: false,
      instrument: null,
      lastBid: null,
      lastAsk: null,
      lastMinuteBucket: null,
      lastNotifiedAt: 0,
      resumeRefreshPending: false,
      resumeListener: null,
    }
    streams.set(key, state)
    const liveState = state
    const refreshWhenVisible = (): void => {
      if (document.visibilityState === 'hidden' || liveState.stopped || streams.get(key) !== liveState) return
      liveState.resumeRefreshPending = true
      // Do not wait for a throttled background interval to wake up.
      void poll(key, args, liveState)
    }
    liveState.resumeListener = refreshWhenVisible
    document.addEventListener('visibilitychange', refreshWhenVisible)
    window.addEventListener('focus', refreshWhenVisible)
    window.addEventListener('pageshow', refreshWhenVisible)
    void poll(key, args, liveState)
    state.timer = window.setInterval(() => { void poll(key, args, liveState) }, POLL_INTERVAL_MS)
  }
  state.listeners.add(listener)

  return () => {
    const current = streams.get(key)
    if (!current) return
    current.listeners.delete(listener)
    if (current.listeners.size > 0) return
    current.stopped = true
    if (current.timer !== null) window.clearInterval(current.timer)
    current.timer = null
    if (current.resumeListener) {
      document.removeEventListener('visibilitychange', current.resumeListener)
      window.removeEventListener('focus', current.resumeListener)
      window.removeEventListener('pageshow', current.resumeListener)
      current.resumeListener = null
    }
    streams.delete(key)
  }
}

/**
 * Return the candle-open time in Unix seconds to match cTrader history after
 * normalizeCTraderHistoricalCandles and Lightweight Charts' UTCTimestamp.
 */
/**
 * Reject a quote if its candle bucket is older than the latest candle already on
 * the chart. Call this before publishing the quote to BUY/SELL markers; otherwise
 * markers can move while the candle update is discarded.
 */
export const isCTraderQuoteBucketCurrent = (
  quoteBucket: number,
  latestCandleTime: number | null | undefined,
): boolean => {
  if (!Number.isFinite(quoteBucket) || quoteBucket <= 0) return false
  if (latestCandleTime == null || !Number.isFinite(latestCandleTime)) return true
  return quoteBucket >= latestCandleTime
}

const CTRADER_TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  M30: 1800,
  H1: 3600,
  H4: 14400,
  D1: 86400,
  W1: 604800,
}

/**
 * Detect a skipped bar bucket without fabricating OHLC data. If the next real
 * provider quote is more than one timeframe after the last plotted bar, refresh
 * broker history and merge its actual candles back into the live series.
 */
export const shouldRepairCTraderHistoryForGap = (
  previousCandleTime: number | null | undefined,
  nextQuoteBucket: number,
  timeframe: Timeframe,
): boolean => {
  if (previousCandleTime == null || !Number.isFinite(previousCandleTime)) return false
  if (!Number.isFinite(nextQuoteBucket) || nextQuoteBucket <= previousCandleTime) return false
  return nextQuoteBucket - previousCandleTime > CTRADER_TIMEFRAME_SECONDS[timeframe]
}

/**
 * Apply one accepted broker bid tick to the forming candle.
 *
 * Bid is the OHLC candle source, like an OTC FX chart in MT5. Ask remains a
 * separate live quote/line, so the spread is visible without falsifying the
 * candle's historical high/low. Keeping the open stable lets the candle body
 * switch bullish/bearish naturally whenever the live close crosses that open.
 */
export const applyCTraderQuoteToCandles = (
  candles: readonly OHLCV[],
  quoteBucket: number,
  bidPrice: number,
): OHLCV[] => {
  const current = normalizeMarketCandles(candles)
  if (!Number.isFinite(quoteBucket) || quoteBucket <= 0 || !Number.isFinite(bidPrice) || bidPrice <= 0) {
    return current
  }

  const last = current[current.length - 1]
  if (last && quoteBucket < last.time) return current

  if (last && quoteBucket === last.time) {
    return [
      ...current.slice(0, -1),
      {
        ...last,
        high: Math.max(last.high, bidPrice),
        low: Math.min(last.low, bidPrice),
        close: bidPrice,
      },
    ]
  }

  return normalizeMarketCandles([
    ...current,
    { time: quoteBucket, open: bidPrice, high: bidPrice, low: bidPrice, close: bidPrice },
  ]).slice(-1000)
}


/**
 * Merge broker history with any quote-updated candles received while the history
 * request was in flight. Historical open prices remain authoritative; live ticks
 * can extend the current candle's range and own its latest close. Newer live
 * buckets are kept instead of being overwritten by an older history response.
 */
export const mergeCTraderHistoricalAndLiveCandles = (
  historical: readonly OHLCV[],
  live: readonly OHLCV[],
): OHLCV[] => {
  const base = normalizeCTraderHistoricalCandles(historical)
  const current = normalizeCTraderHistoricalCandles(live)
  const merged = new Map<number, OHLCV>(base.map((candle) => [candle.time, candle]))
  const latestHistoricalTime = base[base.length - 1]?.time ?? Number.NEGATIVE_INFINITY

  for (const liveCandle of current) {
    const historicalCandle = merged.get(liveCandle.time)
    if (historicalCandle) {
      merged.set(liveCandle.time, {
        ...historicalCandle,
        high: Math.max(historicalCandle.high, liveCandle.high, liveCandle.close),
        low: Math.min(historicalCandle.low, liveCandle.low, liveCandle.close),
        close: liveCandle.close,
      })
      continue
    }

    // Do not resurrect old, missing cache bars over the broker's refreshed
    // history. Only preserve quote-created candles that are newer than it.
    if (liveCandle.time > latestHistoricalTime) merged.set(liveCandle.time, liveCandle)
  }

  return [...merged.values()].sort((a, b) => a.time - b.time).slice(-1000)
}

export const cTraderQuoteBucket = (epochMs: number, timeframe: Timeframe): number => {
  const seconds: Record<Timeframe, number> = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D1: 86400, W1: 604800 }
  const epochSeconds = Math.floor(epochMs / 1000)
  if (timeframe === 'W1') {
    const date = new Date(epochSeconds * 1000)
    const dayOffset = (date.getUTCDay() + 6) % 7
    date.setUTCDate(date.getUTCDate() - dayOffset)
    date.setUTCHours(0, 0, 0, 0)
    return Math.floor(date.getTime() / 1000)
  }
  return Math.floor(epochSeconds / seconds[timeframe]) * seconds[timeframe]
}
