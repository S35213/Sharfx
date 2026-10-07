import type { Timeframe } from '../../types'

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

interface SubscribeArgs {
  connectionId: string
  accountId: string
  environment: 'demo' | 'live'
  symbol: string
}

interface StreamState {
  listeners: Set<(quote: CTraderLiveQuote, instrument: CTraderLiveInstrument) => void>
  timer: ReturnType<typeof setInterval> | null
  inFlight: Promise<void> | null
  stopped: boolean
  instrument: CTraderLiveInstrument | null
}

const streams = new Map<string, StreamState>()
const POLL_INTERVAL_MS = 250

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

const poll = async (key: string, args: SubscribeArgs, state: StreamState): Promise<void> => {
  if (state.stopped || state.inFlight) return
  state.inFlight = (async () => {
    try {
      const result = await requestQuote(args)
      if (state.stopped) return
      state.instrument = result.instrument
      for (const listener of state.listeners) listener(result.quote, result.instrument)
    } catch {
      // Keep the stream alive. The next 250ms poll retries without spamming UI errors.
    } finally {
      state.inFlight = null
      if (streams.get(key) !== state) streams.delete(key)
    }
  })()
  await state.inFlight
}

export const subscribeCTraderLiveQuote = (args: SubscribeArgs, listener: (quote: CTraderLiveQuote, instrument: CTraderLiveInstrument) => void): (() => void) => {
  const key = streamKey(args)
  let state = streams.get(key)
  if (!state) {
    state = {
      listeners: new Set(),
      timer: null,
      inFlight: null,
      stopped: false,
      instrument: null,
    }
    streams.set(key, state)
    void poll(key, args, state)
    state.timer = window.setInterval(() => { void poll(key, args, state!) }, POLL_INTERVAL_MS)
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
    streams.delete(key)
  }
}

export const cTraderQuoteBucket = (epochMs: number, timeframe: Timeframe): number => {
  const seconds: Record<Timeframe, number> = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D1: 86400, W1: 604800 }
  const epochSeconds = Math.floor(epochMs / 1000)
  if (timeframe === 'W1') {
    const date = new Date(epochSeconds * 1000)
    const dayOffset = (date.getUTCDay() + 6) % 7
    date.setUTCDate(date.getUTCDate() - dayOffset)
    date.setUTCHours(0, 0, 0, 0)
    return Math.floor(date.getTime() / 1000) * 1000
  }
  return Math.floor(epochSeconds / seconds[timeframe]) * seconds[timeframe] * 1000
}
