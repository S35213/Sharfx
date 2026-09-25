import React, { useEffect, useRef, useState } from 'react'
import type { OHLCV, Timeframe } from '../../types'
import '../../integrations/catalog'
import { providerRegistry } from '../../integrations/core/providerRegistry'
import { assessProviderReadiness } from '../../integrations/core/providerReadiness'
import { validateProviderConnection } from '../../integrations/core/providerConnectionGuard'
import type { ProviderConnection, ProviderStreamHandle } from '../../integrations/core/types'

interface ProviderLiveControlProps {
  providerId: string
  connection?: ProviderConnection
  symbol: string
  timeframe: Timeframe
  onUpdate: (candles: OHLCV[], price: number, epoch: number) => void
  onActiveChange?: (active: boolean) => void
}

type Status = 'demo' | 'connecting' | 'live' | 'error'

const toOHLCV = (time: string, open: number, high: number, low: number, close: number): OHLCV | null => {
  const timestamp = Date.parse(time)
  if (![timestamp, open, high, low, close].every(Number.isFinite)) return null
  if (high < Math.max(open, close) || low > Math.min(open, close) || low > high) return null
  return { time: timestamp, open, high, low, close }
}

export const ProviderLiveControl: React.FC<ProviderLiveControlProps> = ({ providerId, connection: providedConnection, symbol, timeframe, onUpdate, onActiveChange }) => {
  const streamRef = useRef<ProviderStreamHandle | null>(null)
  const [enabled, setEnabled] = useState(Boolean(providedConnection))
  const [status, setStatus] = useState<Status>('demo')
  const [detailsOpen, setDetailsOpen] = useState(false)

  useEffect(() => {
    setEnabled(Boolean(providedConnection))
    onActiveChange?.(Boolean(providedConnection))
    const closeExistingStream = async (): Promise<void> => {
      const existing = streamRef.current
      streamRef.current = null
      if (existing) await existing.close()
    }

    if (!providedConnection || !enabled) {
      void closeExistingStream()
      setStatus('demo')
      return
    }

    let disposed = false
    const start = async (): Promise<void> => {
      try {
        setStatus('connecting')
        const adapter = providerRegistry.get(providerId)
        const readiness = assessProviderReadiness(adapter)
        if (!readiness.ready) throw new Error(`Provider ${adapter.descriptor.name} is not ready: ${readiness.missingMethods.join(', ') || readiness.issues.join(', ')}`)

        const connection: ProviderConnection = providedConnection
        const connectionCheck = validateProviderConnection(adapter, connection)
        if (!connectionCheck.allowed) throw new Error(connectionCheck.reason || 'Provider connection is not usable.')
        if (typeof adapter.subscribe !== 'function') throw new Error(`${adapter.descriptor.name} does not support streaming market data.`)

        const stream = await adapter.subscribe(connection, undefined, [symbol], (event) => {
          if (disposed) return
          if (event.type === 'error') {
            setStatus('error')
            return
          }
          if (event.type !== 'market_snapshot') return
          const candles = event.snapshot.candles.flatMap((candle) => {
            const item = toOHLCV(candle.openTime, candle.open, candle.high, candle.low, candle.close)
            return item ? [item] : []
          })
          const price = event.snapshot.quote.last ?? event.snapshot.quote.ask ?? event.snapshot.quote.bid
          const epoch = Date.parse(event.snapshot.quote.timestamp)
          if (candles.length === 0 || price === undefined || !Number.isFinite(price) || !Number.isFinite(epoch)) return
          onUpdate(candles, price, epoch)
          setStatus('live')
        }, timeframe)

        if (disposed) {
          await stream.close()
          return
        }
        streamRef.current = stream
        setStatus('live')
      } catch (error) {
        if (!disposed) setStatus('error')
        if (streamRef.current) {
          await streamRef.current.close().catch(() => undefined)
          streamRef.current = null
        }
        void error
      }
    }

    void start()
    return () => {
      disposed = true
      void closeExistingStream()
    }
  }, [enabled, onActiveChange, onUpdate, providedConnection, providerId, symbol, timeframe])

  const providerConnected = Boolean(providedConnection)
  const toggle = (): void => {
    if (providerConnected) { setDetailsOpen(true); return }
    setEnabled((value) => !value)
    setDetailsOpen(true)
  }
  const label = status === 'live' ? 'Live' : status === 'connecting' ? 'Connecting' : status === 'error' ? 'Retry Live' : 'Demo'
  return <div className="relative">
    <button type="button" onClick={toggle aria-pressed={enabled} className="flex min-h-10 items-center gap-2 rounded-lg border border-shafx-border bg-shafx-surface px-3 text-xs font-medium text-shafx-text transition hover:border-shafx-primary">
      <span className={`h-2 w-2 rounded-full ${status === 'live' ? 'bg-emerald-400' : status === 'error' ? 'bg-red-400' : 'bg-shafx-textMuted'}`} />
      {label} Market
    </button>
    {detailsOpen && <div className="absolute right-0 top-[calc(100%+8px)] z-[120] w-72 rounded-2xl border border-shafx-border bg-shafx-surface p-3 shadow-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold">{providerConnected ? 'Live provider market' : enabled ? 'Provider market stream' : 'SHAFX Demo Market'}</div>
          <p className="mt-1 text-[9px] leading-4 text-shafx-textMuted">
            {providerConnected
              ? status === 'live' ? `Live Deriv market stream active for ${symbol}.` : status === 'connecting' ? 'Connecting to the selected Deriv market…' : status === 'error' ? 'The Deriv market stream is disconnected. SHAFX will retry instead of switching back to simulation.' : 'Provider market stream is off.'
              : enabled ? status === 'live' ? `Live quote stream requested for ${symbol}.` : status === 'connecting' ? 'Connecting to the selected provider…' : status === 'error' ? 'The provider stream could not be started.' : 'Provider stream is off.'
              : 'Simulated market data is active. No broker connection is required.'}
          </p>
        </div>
        <button type="button" onClick={() => setDetailsOpen(false)} className="min-h-8 rounded-lg border border-shafx-border px-2 text-[9px] text-shafx-textMuted">Close</button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[9px]">
        <div className="rounded-xl border border-shafx-border bg-shafx-bg p-2"><span className="text-shafx-textMuted">Mode</span><strong className="mt-1 block">{providerConnected ? 'LIVE PROVIDER' : enabled ? 'PROVIDER' : 'SIMULATOR'}</strong></div>
        <div className="rounded-xl border border-shafx-border bg-shafx-bg p-2"><span className="text-shafx-textMuted">Timeframe</span><strong className="mt-1 block">{timeframe}</strong></div>
      </div>
    </div>}
  </div>
}
