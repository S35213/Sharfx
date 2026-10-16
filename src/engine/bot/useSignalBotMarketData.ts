import { useEffect, useRef, useState } from 'react'
import { TIMEFRAMES, type OHLCV, type Timeframe } from '../../types'
import { fetchCTraderHistoricalCandles } from '../../data/ctrader/CTraderLiveQuote'
import { fetchDerivMultiTimeframeCandles } from '../../data/deriv/DerivPublicMarketFeed'

export interface SignalBotMarketSource {
  providerId: string | null
  connectionId?: string | null
  accountId?: string | null
  environment?: 'demo' | 'live' | null
}

export type SignalBotMarketDataStatus = 'idle' | 'loading' | 'ready' | 'partial' | 'error' | 'unavailable'

export interface SignalBotMarketDataState {
  sourceKey: string
  frames: Partial<Record<Timeframe, OHLCV[]>>
  status: SignalBotMarketDataStatus
  updatedAt: number | null
  error: string | null
}

export type SignalBotTimeframeProgressStatus = 'waiting' | 'loading' | 'ready' | 'failed'
export type SignalBotTimeframeProgress = Record<Timeframe, SignalBotTimeframeProgressStatus>

export interface SignalBotMarketDataHookState extends SignalBotMarketDataState {
  /** Immediately starts a fresh scan cycle, bypassing the shared Deriv history cache. */
  refreshNow: () => void
  timeframeProgress: SignalBotTimeframeProgress
  scanNumber: number
  lastScanDataChanged: boolean | null
}

interface FetchResult {
  frames: Partial<Record<Timeframe, OHLCV[]>>
  errors: string[]
}

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

type ReportTimeframeProgress = (timeframe: Timeframe, status: SignalBotTimeframeProgressStatus) => void

const createInitialTimeframeProgress = (): SignalBotTimeframeProgress =>
  Object.fromEntries(TIMEFRAMES.map((timeframe) => [timeframe, 'waiting'])) as SignalBotTimeframeProgress

export const signalBotFramesSignature = (frames: Partial<Record<Timeframe, readonly OHLCV[]>>): string =>
  TIMEFRAMES.map((timeframe) => {
    const candles = frames[timeframe] ?? []
    const last = candles[candles.length - 1]
    return [
      timeframe,
      candles.length,
      last?.time ?? '',
      last?.open ?? '',
      last?.high ?? '',
      last?.low ?? '',
      last?.close ?? '',
    ].join(':')
  }).join('|')

const loadCTraderFrames = async (
  symbol: string,
  source: SignalBotMarketSource,
  reportProgress: ReportTimeframeProgress,
): Promise<FetchResult> => {
  if (!source.connectionId || !source.accountId || !source.environment) {
    throw new Error(signalBotMarketSourceError(source) ?? 'A complete cTrader account selection is required.')
  }
  // Snapshot narrowed values before they are captured by asynchronous workers.
  const connectionId = source.connectionId
  const accountId = source.accountId
  const environment = source.environment

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
      reportProgress(timeframe, 'loading')
      try {
        const candles = await fetchCTraderHistoricalCandles({
          connectionId,
          accountId,
          environment,
          symbol,
          timeframe,
          count: HISTORY_COUNT,
        })
        if (candles.length) frames[timeframe] = candles
        reportProgress(timeframe, candles.length >= 8 ? 'ready' : 'failed')
        if (candles.length < 8) errors.push(timeframe + ': fewer than 8 historical candles returned')
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'history request failed'
        reportProgress(timeframe, 'failed')
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
  forceFresh: boolean,
  reportProgress: ReportTimeframeProgress,
): Promise<FetchResult> => {
  const sourceError = signalBotMarketSourceError(source)
  if (sourceError) throw new Error(sourceError)

  if (source.providerId === 'ctrader') return loadCTraderFrames(symbol, source, reportProgress)
  if (source.providerId === 'deriv') {
    const sourceGroups: Record<'M1' | 'H1' | 'D1', Timeframe[]> = {
      M1: ['M1', 'M5', 'M15', 'M30'],
      H1: ['H1', 'H4'],
      D1: ['D1', 'W1'],
    }
    const frames = await fetchDerivMultiTimeframeCandles(symbol, TIMEFRAMES, {
      forceRefresh: forceFresh,
      onSourceProgress: (sourceTimeframe, status) => {
        const group = sourceGroups[sourceTimeframe]
        for (const timeframe of group) {
          const isAnchor = timeframe === sourceTimeframe
          reportProgress(
            timeframe,
            status === 'loading' || (!isAnchor && status === 'ready')
              ? 'loading'
              : status === 'ready'
                ? 'ready'
                : 'failed',
          )
        }
      },
    })
    const errors = TIMEFRAMES
      .filter((timeframe) => (frames[timeframe]?.length ?? 0) < 8)
      .map((timeframe) => timeframe + ': insufficient historical candles')
    for (const timeframe of TIMEFRAMES) {
      reportProgress(timeframe, (frames[timeframe]?.length ?? 0) >= 8 ? 'ready' : 'failed')
    }
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
 * Manual-only Signal Bot market data.
 * Nothing is fetched on mount or in the background; each user click starts exactly one scan.
 * It uses only the explicitly selected provider and ignores late responses after source switches.
 */
export const useSignalBotMarketData = (
  symbol: string,
  source: SignalBotMarketSource | null,
): SignalBotMarketDataHookState => {
  const sourceKey = signalBotMarketSourceKey(symbol, source)
  const [state, setState] = useState<SignalBotMarketDataState>(() => emptyState(sourceKey, 'idle'))
  const stateRef = useRef(state)
  stateRef.current = state
  const [scanRequest, setScanRequest] = useState<{ token: number; sourceKey: string } | null>(null)
  const [timeframeProgress, setTimeframeProgress] = useState<SignalBotTimeframeProgress>(createInitialTimeframeProgress)
  const [scanNumber, setScanNumber] = useState(0)
  const [lastScanDataChanged, setLastScanDataChanged] = useState<boolean | null>(null)
  const refreshNow = (): void => setScanRequest((current) => ({ token: (current?.token ?? 0) + 1, sourceKey }))

  useEffect(() => {
    let stopped = false
    let inFlight = false
    const sourceError = signalBotMarketSourceError(source)

    if (sourceError) {
      setState(emptyState(sourceKey, 'unavailable', sourceError))
      setTimeframeProgress(createInitialTimeframeProgress())
      setScanNumber(0)
      setLastScanDataChanged(null)
      return () => { stopped = true }
    }

    // Mounting, switching markets, or switching accounts must never trigger a
    // scan. A request is honoured only for the exact source key captured by
    // the user's click; old requests cannot silently scan a newly selected market.
    if (!scanRequest || scanRequest.sourceKey !== sourceKey) {
      if (stateRef.current.sourceKey !== sourceKey) {
        setState(emptyState(sourceKey, 'idle'))
        setTimeframeProgress(createInitialTimeframeProgress())
        setScanNumber(0)
        setLastScanDataChanged(null)
      }
      return () => { stopped = true }
    }

    const refresh = async (): Promise<void> => {
      if (stopped || inFlight) return
      inFlight = true
      setTimeframeProgress(createInitialTimeframeProgress())
      const previousFrames = stateRef.current.sourceKey === sourceKey ? stateRef.current.frames : {}
      setState((previous) => ({
        sourceKey,
        frames: previous.sourceKey === sourceKey ? previous.frames : {},
        status: 'loading',
        updatedAt: previous.sourceKey === sourceKey ? previous.updatedAt : null,
        error: null,
      }))
      const reportProgress: ReportTimeframeProgress = (timeframe, status) => {
        if (stopped) return
        setTimeframeProgress((current) => ({ ...current, [timeframe]: status }))
      }

      try {
        // Every explicit click requests fresh Deriv history instead of waiting
        // for the shared market cache or a background timer.
        const result = await loadSignalBotFrames(symbol, source as SignalBotMarketSource, true, reportProgress)
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
        const hadPreviousFrames = TIMEFRAMES.some((timeframe) => (previousFrames[timeframe]?.length ?? 0) > 0)
        setLastScanDataChanged(hadPreviousFrames ? signalBotFramesSignature(previousFrames) !== signalBotFramesSignature(result.frames) : null)
        setScanNumber((current) => current + 1)
      } catch (error) {
        if (stopped) return
        setTimeframeProgress(Object.fromEntries(TIMEFRAMES.map((timeframe) => [timeframe, 'failed'])) as SignalBotTimeframeProgress)
        setLastScanDataChanged(null)
        setScanNumber((current) => current + 1)
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
      } finally {
        inFlight = false
      }
    }

    void refresh()
    return () => { stopped = true }
  }, [
    sourceKey,
    symbol,
    source?.providerId,
    source?.connectionId,
    source?.accountId,
    source?.environment,
    scanRequest?.token,
    scanRequest?.sourceKey,
  ])

  const matchingFrames = signalBotFramesForSource(state, sourceKey)
  if (state.sourceKey !== sourceKey) {
    const unavailableReason = signalBotMarketSourceError(source)
    return {
      ...emptyState(sourceKey, unavailableReason ? 'unavailable' : 'idle', unavailableReason),
      refreshNow,
      timeframeProgress,
      scanNumber,
      lastScanDataChanged,
    }
  }
  return { ...state, frames: matchingFrames, refreshNow, timeframeProgress, scanNumber, lastScanDataChanged }
}
