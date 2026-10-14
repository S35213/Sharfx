import { useEffect, useState } from 'react'
import { TIMEFRAMES, type OHLCV, type Timeframe } from '../../types'
import { fetchCTraderHistoricalCandles } from '../../data/ctrader/CTraderLiveQuote'
import { fetchDerivMultiTimeframeCandles } from '../../data/deriv/DerivPublicMarketFeed'

export interface SignalBotMarketSource {
  providerId: string | null
  connectionId?: string | null
  accountId?: string | null
  environment?: 'demo' | 'live' | null
}

export type SignalBotMarketDataStatus = 'loading' | 'ready' | 'partial' | 'error' | 'unavailable'

export interface SignalBotMarketDataState {
  sourceKey: string
  frames: Partial<Record<Timeframe, OHLCV[]>>
  status: SignalBotMarketDataStatus
  updatedAt: number | null
  error: string | null
}

interface FetchResult {
  frames: Partial<Record<Timeframe, OHLCV[]>>
  errors: string[]
}

const REFRESH_INTERVAL_MS = 15_000
const HISTORY_COUNT = 300

export const signalBotMarketSourceKey = (symbol: string, source: SignalBotMarketSource | null): string => [
  symbol.trim().toUpperCase(),
  source?.providerId ?? 'none',
  source?.connectionId ?? 'no-connection',
  source?.accountId ?? 'no-account',
  source?.environment ?? 'no-environment',
].join('|')

export const signalBotMarketSourceError = (source: SignalBotMarketSource | null): string | null => {
  if (!source?.providerId) return 'Select a supported market-data provider before scanning.'
  if (source.providerId === 'ctrader') {
    if (!source.connectionId || !source.accountId) return 'Connect and select a cTrader account to scan its candles.'
    if (!source.environment) return 'Select the cTrader practice or live environment.'
    return null
  }
  if (source.providerId === 'deriv') return null
  return `Signal Bot market history is not connected to provider "${source.providerId}" yet. No other provider will be substituted.`
}

/** Prevent data from a previous provider, account, environment or symbol leaking into the current scan. */
export const signalBotFramesForSource = (
  framesState: Pick<SignalBotMarketDataState, 'sourceKey' | 'frames'>,
  requestedSourceKey: string,
): Partial<Record<Timeframe, OHLCV[]>> => framesState.sourceKey === requestedSourceKey ? framesState.frames : {}

const loadCTraderFrames = async (
  symbol: string,
  source: SignalBotMarketSource,
): Promise<FetchResult> => {
  if (!source.connectionId || !source.accountId || !source.environment) {
    throw new Error(signalBotMarketSourceError(source) ?? 'A complete cTrader account selection is required.')
  }

  const frames: Partial<Record<Timeframe, OHLCV[]>> = {}
  const errors: string[] = []
  const queue = [...TIMEFRAMES]
  let nextIndex = 0

  // Limit concurrency and wait for each history request before scheduling the next.
  // The scanner owns this loader; it does not depend on the trade bot's lifecycle.
  const worker = async (): Promise<void> => {
    while (true) {
      const timeframe = queue[nextIndex++]
      if (!timeframe) return
      try {
        const candles = await fetchCTraderHistoricalCandles({
          connectionId: source.connectionId,
          accountId: source.accountId,
          environment: source.environment,
          symbol,
          timeframe,
          count: HISTORY_COUNT,
        })
        if (candles.length) frames[timeframe] = candles
        if (candles.length < 8) errors.push(timeframe + ': fewer than 8 historical candles returned')
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'history request failed'
        errors.push(timeframe + ': ' + reason)
      }
    }
  }

  await Promise.all([worker(), worker()])
  return { frames, errors }
}

const loadSignalBotFrames = async (
  symbol: string,
  source: SignalBotMarketSource,
): Promise<FetchResult> => {
  const sourceError = signalBotMarketSourceError(source)
  if (sourceError) throw new Error(sourceError)

  if (source.providerId === 'ctrader') return loadCTraderFrames(symbol, source)
  if (source.providerId === 'deriv') {
    const frames = await fetchDerivMultiTimeframeCandles(symbol, TIMEFRAMES)
    const errors = TIMEFRAMES
      .filter((timeframe) => (frames[timeframe]?.length ?? 0) < 8)
      .map((timeframe) => timeframe + ': insufficient historical candles')
    return { frames, errors }
  }

  throw new Error(sourceError ?? 'Unsupported Signal Bot market-data provider.')
}

const emptyState = (sourceKey: string, status: SignalBotMarketDataStatus = 'loading', error: string | null = null): SignalBotMarketDataState => ({
  sourceKey,
  frames: {},
  status,
  updatedAt: null,
  error,
})

const readableErrors = (errors: string[]): string | null => {
  if (!errors.length) return null
  const visible = errors.slice(0, 2).join('; ')
  return errors.length > 2 ? visible + ` (+${errors.length - 2} more)` : visible
}

/**
 * Independent Signal Bot market-data loop.
 * It uses only the explicitly selected provider, refreshes at a controlled 15s cadence,
 * never falls back to another broker, and ignores late responses after source switches.
 */
export const useSignalBotMarketData = (
  symbol: string,
  source: SignalBotMarketSource | null,
): SignalBotMarketDataState => {
  const sourceKey = signalBotMarketSourceKey(symbol, source)
  const [state, setState] = useState<SignalBotMarketDataState>(() => emptyState(sourceKey))

  useEffect(() => {
    let stopped = false
    let timer: number | null = null
    let inFlight = false
    const sourceError = signalBotMarketSourceError(source)

    if (sourceError) {
      setState(emptyState(sourceKey, 'unavailable', sourceError))
      return () => { stopped = true }
    }

    const refresh = async (): Promise<void> => {
      if (stopped || inFlight) return
      inFlight = true
      setState((previous) => ({
        sourceKey,
        frames: previous.sourceKey === sourceKey ? previous.frames : {},
        status: 'loading',
        updatedAt: previous.sourceKey === sourceKey ? previous.updatedAt : null,
        error: null,
      }))

      try {
        const result = await loadSignalBotFrames(symbol, source as SignalBotMarketSource)
        if (stopped) return
        const usableTimeframes = TIMEFRAMES.filter((timeframe) => (result.frames[timeframe]?.length ?? 0) >= 8).length
        const status: SignalBotMarketDataStatus = usableTimeframes === TIMEFRAMES.length
          ? 'ready'
          : usableTimeframes > 0
            ? 'partial'
            : 'error'
        setState({
          sourceKey,
          frames: result.frames,
          status,
          updatedAt: Date.now(),
          error: readableErrors(result.errors) ?? (status === 'error' ? 'No timeframe has enough candles to scan.' : null),
        })
      } catch (error) {
        if (stopped) return
        const previousState = state
        setState((previous) => {
          const oldFrames = previous.sourceKey === sourceKey ? previous.frames : {}
          const usable = TIMEFRAMES.some((timeframe) => (oldFrames[timeframe]?.length ?? 0) >= 8)
          const message = error instanceof Error ? error.message : 'Unable to load selected-provider candles.'
          return {
            sourceKey,
            frames: oldFrames,
            status: usable ? 'partial' : 'error',
            updatedAt: previous.sourceKey === sourceKey ? previous.updatedAt : null,
            error: message,
          }
        })
        void previousState
      } finally {
        inFlight = false
        if (!stopped) timer = window.setTimeout(() => { void refresh() }, REFRESH_INTERVAL_MS)
      }
    }

    void refresh()
    return () => {
      stopped = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [sourceKey, symbol, source?.providerId, source?.connectionId, source?.accountId, source?.environment])

  const matchingFrames = signalBotFramesForSource(state, sourceKey)
  if (state.sourceKey !== sourceKey) {
    const unavailableReason = signalBotMarketSourceError(source)
    return emptyState(sourceKey, unavailableReason ? 'unavailable' : 'loading', unavailableReason)
  }
  return { ...state, frames: matchingFrames }
}
