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
  const [enabled, setEnabled] = useState(false)
  const [status, setStatus] = useState<Status>('demo')

  useEffect(() => {
    onActiveChange?.(enabled)
    const closeExistingStream = async (): Promise<void> => {
      const existing = streamRef.current
      streamRef.current = null
      if (existing) await existing.close()
    }

    if (!enabled) {
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

        const connection: ProviderConnection = providedConnection ?? {
          providerId,
          connectionId: `public-market:${providerId}`,
          environment: 'demo',
          connectedAt: new Date().toISOString(),
          state: 'connected',
        }
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

  const toggle = (): void => setEnabled((value) => !value)
  const label = status === 'live' ? 'Live' : status === 'connecting' ? 'Connecting' : status === 'error' ? 'Retry Live' : 'Demo'
  return <button type="button" onClick={toggle} aria-pressed={enabled} className="flex min-h-10 items-center gap-2 rounded-lg border border-shafx-border bg-shafx-surface px-3 text-xs font-medium text-shafx-text transition hover:border-shafx-primary"><span className={`h-2 w-2 rounded-full ${status === 'live' ? 'bg-emerald-400' : status === 'error' ? 'bg-red-400' : 'bg-shafx-textMuted'}`} />{label} Market</button>
}
