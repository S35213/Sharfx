import { useEffect, useState } from 'react'
import { TIMEFRAMES, type OHLCV, type Timeframe } from '../../types'
import { fetchCTraderHistoricalCandles } from '../../data/ctrader/CTraderLiveQuote'

export interface TradeBotMarketSource {
  providerId: string | null
  connectionId?: string | null
  accountId?: string | null
  environment?: 'demo' | 'live' | null
}

export type TradeBotMarketStatus = 'stopped' | 'loading' | 'ready' | 'partial' | 'error' | 'unavailable'

export interface TradeBotMarketState {
  sourceKey: string
  frames: Partial<Record<Timeframe, OHLCV[]>>
  status: TradeBotMarketStatus
  updatedAt: number | null
  error: string | null
  /** Number of completed market-history checks in the current Start/Stop session. */
  cycleNumber: number
  /** Whether the latest cycle's returned candle snapshot differed from the previous one. */
  lastDataChanged: boolean | null
}

interface FetchResult {
  frames: Partial<Record<Timeframe, OHLCV[]>>
  errors: string[]
}

const REFRESH_MS = 15_000
const HISTORY_COUNT = 300

export const tradeBotFramesSignature = (frames: Partial<Record<Timeframe, readonly OHLCV[]>>): string =>
  TIMEFRAMES.map((timeframe) => {
    const candles = frames[timeframe] ?? []
    const last = candles[candles.length - 1]
    return [timeframe, candles.length, last?.time ?? '', last?.open ?? '', last?.high ?? '', last?.low ?? '', last?.close ?? ''].join(':')
  }).join('|')

export const tradeBotMarketSourceKey = (symbol: string, source: TradeBotMarketSource | null): string => [
  symbol.trim().toUpperCase(),
  source?.providerId ?? 'none',
  source?.connectionId ?? 'no-connection',
  source?.accountId ?? 'no-account',
  source?.environment ?? 'no-environment',
].join('|')

export const tradeBotMarketSourceError = (source: TradeBotMarketSource | null): string | null => {
  if (!source?.providerId) return 'Select a market-data provider before starting the Trade Bot.'
  if (source.providerId === 'ctrader') {
    if (!source.connectionId || !source.accountId) return 'Connect and select a cTrader account before starting the Trade Bot.'
    if (!source.environment) return 'Select the cTrader practice or live environment.'
    if (source.environment !== 'demo') return 'Trade Bot execution is disabled for live cTrader accounts. Select a practice account.'
    return null
  }
  if (source.providerId === 'deriv') return 'The independent Trade Bot currently supports cTrader practice accounts only. Deriv data is not used as a fallback.'
  return `Trade Bot is not connected to provider "${source.providerId}". No other provider will be substituted.`
}

export const tradeBotFramesForSource = (
  state: Pick<TradeBotMarketState, 'sourceKey' | 'frames'>,
  requestedSourceKey: string,
): Partial<Record<Timeframe, OHLCV[]>> => state.sourceKey === requestedSourceKey ? state.frames : {}

const loadCTraderFrames = async (symbol: string, source: TradeBotMarketSource): Promise<FetchResult> => {
  if (!source.connectionId || !source.accountId || source.environment !== 'demo') {
    throw new Error(tradeBotMarketSourceError(source) ?? 'A selected cTrader practice account is required.')
  }
  const connectionId = source.connectionId
  const accountId = source.accountId
  const environment = source.environment
  const frames: Partial<Record<Timeframe, OHLCV[]>> = {}
  const errors: string[] = []
  const queue = [...TIMEFRAMES]
  let nextIndex = 0

  const worker = async (): Promise<void> => {
    while (true) {
      const timeframe = queue[nextIndex++]
      if (!timeframe) return
      try {
        const candles = await fetchCTraderHistoricalCandles({
          connectionId, accountId, environment, symbol, timeframe, count: HISTORY_COUNT,
        })
        if (candles.length) frames[timeframe] = candles
        if (candles.length < 8) errors.push(timeframe + ': fewer than 8 historical candles returned')
      } catch (error) {
        errors.push(timeframe + ': ' + (error instanceof Error ? error.message : 'history request failed'))
      }
    }
  }
  await Promise.all([worker(), worker()])
  return { frames, errors }
}

const loadTradeBotFrames = async (symbol: string, source: TradeBotMarketSource): Promise<FetchResult> => {
  const sourceError = tradeBotMarketSourceError(source)
  if (sourceError) throw new Error(sourceError)
  if (source.providerId === 'ctrader') return loadCTraderFrames(symbol, source)
  throw new Error(sourceError ?? 'Trade Bot has no loader for the selected provider.')
}

const emptyState = (
  sourceKey: string,
  status: TradeBotMarketStatus,
  error: string | null = null,
): TradeBotMarketState => ({ sourceKey, frames: {}, status, updatedAt: null, error, cycleNumber: 0, lastDataChanged: null })

const shortError = (errors: string[]): string | null => {
  if (!errors.length) return null
  const shown = errors.slice(0, 2).join('; ')
  return errors.length > 2 ? shown + ` (+${errors.length - 2} more)` : shown
}

/**
 * Trade Bot's explicitly started monitoring loop. Each cycle requests fresh
 * cTrader practice history, publishes a visible cycle number/data-change result,
 * and stops on Stop or when the selected account/market changes.
 */
export const useTradeBotMarketData = (
  symbol: string,
  source: TradeBotMarketSource | null,
  enabled: boolean,
): TradeBotMarketState => {
  const providerId = source?.providerId ?? null
  const connectionId = source?.connectionId ?? null
  const accountId = source?.accountId ?? null
  const environment = source?.environment ?? null
  const selectedSource: TradeBotMarketSource | null = providerId
    ? { providerId, connectionId, accountId, environment }
    : null
  const sourceKey = tradeBotMarketSourceKey(symbol, selectedSource)
  const [state, setState] = useState<TradeBotMarketState>(() => emptyState(sourceKey, 'stopped'))

  useEffect(() => {
    let stopped = false
    let timer: number | null = null
    let inFlight = false
    let cycleNumber = 0
    let previousSignature: string | null = null
    if (!enabled) return () => { stopped = true }

    const effectSource: TradeBotMarketSource | null = providerId
      ? { providerId, connectionId, accountId, environment }
      : null
    const sourceError = tradeBotMarketSourceError(effectSource)
    if (sourceError) return () => { stopped = true }

    const refresh = async (): Promise<void> => {
      if (stopped || inFlight) return
      inFlight = true
      setState((previous) => ({
        sourceKey,
        frames: previous.sourceKey === sourceKey ? previous.frames : {},
        status: 'loading',
        updatedAt: previous.sourceKey === sourceKey ? previous.updatedAt : null,
        error: null,
        cycleNumber: previous.sourceKey === sourceKey ? previous.cycleNumber : 0,
        lastDataChanged: previous.sourceKey === sourceKey ? previous.lastDataChanged : null,
      }))
      try {
        const result = await loadTradeBotFrames(symbol, effectSource as TradeBotMarketSource)
        if (stopped) return
        const usable = TIMEFRAMES.filter((timeframe) => (result.frames[timeframe]?.length ?? 0) >= 8).length
        const status: TradeBotMarketStatus = usable === TIMEFRAMES.length ? 'ready' : usable > 0 ? 'partial' : 'error'
        const nextSignature = tradeBotFramesSignature(result.frames)
        const lastDataChanged = previousSignature === null ? null : previousSignature !== nextSignature
        previousSignature = nextSignature
        cycleNumber += 1
        setState({
          sourceKey,
          frames: result.frames,
          status,
          updatedAt: Date.now(),
          error: shortError(result.errors) ?? (status === 'error' ? 'No timeframe has enough candles to evaluate a trade plan.' : null),
          cycleNumber,
          lastDataChanged,
        })
      } catch (error) {
        if (stopped) return
        cycleNumber += 1
        setState({ ...emptyState(sourceKey, 'error', error instanceof Error ? error.message : 'Unable to load cTrader practice candles.'), cycleNumber, lastDataChanged: null })
      } finally {
        inFlight = false
        if (!stopped) timer = window.setTimeout(() => { void refresh() }, REFRESH_MS)
      }
    }

    void refresh()
    return () => {
      stopped = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [enabled, sourceKey, symbol, providerId, connectionId, accountId, environment])

  if (!enabled) return emptyState(sourceKey, 'stopped')
  const sourceError = tradeBotMarketSourceError(selectedSource)
  if (sourceError) return emptyState(sourceKey, 'unavailable', sourceError)
  if (state.sourceKey !== sourceKey) return emptyState(sourceKey, 'loading')
  return { ...state, frames: tradeBotFramesForSource(state, sourceKey) }
}
