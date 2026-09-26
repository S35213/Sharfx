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

type Status = 'waiting' | 'connecting' | 'live' | 'error'

const toOHLCV = (time: string, open: number, high: number, low: number, close: number): OHLCV | null => {
  const timestamp = Date.parse(time)
  if (![timestamp, open, high, low, close].every(Number.isFinite)) return null
  if (high < Math.max(open, close) || low > Math.min(open, close) || low > high) return null
  return { time: timestamp, open, high, low, close }
}

export const ProviderLiveControl: React.FC<ProviderLiveControlProps> = ({ providerId, connection, symbol, timeframe, onUpdate, onActiveChange }) => {
  const streamRef = useRef<ProviderStreamHandle | null>(null)
  const [status, setStatus] = useState<Status>('waiting')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  useEffect(() => {
    let disposed = false
    const closeExisting = async () => {
      const existing = streamRef.current
      streamRef.current = null
      if (existing) await existing.close()
    }
    setStatus('waiting')
    setErrorMessage(null)
    onActiveChange?.(false)
    if (!connection) {
      void closeExisting()
      return () => { disposed = true }
    }

    const start = async (): Promise<void> => {
      try {
        setStatus('connecting')
        setErrorMessage(null)
        const adapter = providerRegistry.get(providerId)
        // The chart only depends on the realtime market stream capability.
        // Do not let unrelated broker capabilities (funding, positions, etc.) block market data.
        const readiness = assessProviderReadiness(adapter, ['realtimeMarketData'])
        if (!readiness.ready) throw new Error('Deriv market stream is not ready: ' + (readiness.missingMethods.join(', ') || 'missing market-data capability.'))
        const check = validateProviderConnection(adapter, connection)
        if (!check.allowed) throw new Error(check.reason || 'The broker connection is not usable.')
        if (typeof adapter.subscribe !== 'function') throw new Error('The selected broker does not provide a live market stream.')
        const stream = await adapter.subscribe(connection, connection.accountId, [symbol], (event) => {
          if (disposed) return
          if (event.type === 'error') {
            setStatus('error')
            setErrorMessage(event.error instanceof Error ? event.error.message : 'The Deriv market stream reported an error.')
            onActiveChange?.(false)
            return
          }
          if (event.type !== 'market_snapshot') return
          const candles = event.snapshot.candles.flatMap((candle) => {
            const item = toOHLCV(candle.openTime, candle.open, candle.high, candle.low, candle.close)
            return item ? [item] : []
          })
          const price = event.snapshot.quote.last ?? event.snapshot.quote.ask ?? event.snapshot.quote.bid
          const epoch = Date.parse(event.snapshot.quote.timestamp)
          if (!candles.length || !Number.isFinite(Number(price)) || !Number.isFinite(epoch)) return
          onUpdate(candles, Number(price), epoch)
          setStatus('live')
          onActiveChange?.(true)
        }, timeframe)
        if (disposed) { await stream.close(); return }
        streamRef.current = stream
      } catch (error) {
        if (!disposed) {
          setStatus('error')
          setErrorMessage(error instanceof Error ? error.message : 'The Deriv market stream failed.')
          onActiveChange?.(false)
        }
      }
    }
    void start()
    return () => {
      disposed = true
      void closeExisting()
    }
  }, [connection, onActiveChange, onUpdate, providerId, symbol, timeframe])

  const label = status === 'live' ? 'LIVE' : status === 'connecting' ? 'CONNECTING' : status === 'error' ? 'RETRY' : 'WAITING'
  return <div className="relative">
    <button type="button" onClick={() => setDetailsOpen((value) => !value)} className="flex min-h-10 items-center gap-2 rounded-lg border border-shafx-border bg-shafx-surface px-3 text-xs font-medium"><span className={'h-2 w-2 rounded-full ' + (status === 'live' ? 'bg-emerald-400' : status === 'error' ? 'bg-red-400' : 'bg-shafx-textMuted')} />{label}</button>
    {detailsOpen && <div className="absolute right-0 top-[calc(100%+8px)] z-[120] w-72 rounded-2xl border border-shafx-border bg-shafx-surface p-3 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-semibold">Deriv market stream</div><p className="mt-1 text-[9px] leading-4 text-shafx-textMuted">{status === 'live' ? 'Live tick and candle updates are reaching SHAFX.' : status === 'connecting' ? 'Opening the Deriv market stream…' : status === 'error' ? 'The live market stream failed. SHAFX will retry when the connection changes.' : 'Waiting for the connected Deriv account.'}</p>{errorMessage && <p className="mt-2 rounded-lg border border-shafx-danger/20 bg-shafx-danger/[0.05] px-2 py-1.5 font-mono text-[8px] leading-3 text-shafx-danger">{errorMessage}</p>}</div><button type="button" onClick={() => setDetailsOpen(false)} className="min-h-8 rounded-lg border border-shafx-border px-2 text-[9px] text-shafx-textMuted">Close</button></div><div className="mt-3 grid grid-cols-2 gap-2 text-[9px]"><div className="rounded-xl border border-shafx-border bg-shafx-bg p-2"><span className="text-shafx-textMuted">Source</span><strong className="mt-1 block">Deriv</strong></div><div className="rounded-xl border border-shafx-border bg-shafx-bg p-2"><span className="text-shafx-textMuted">Timeframe</span><strong className="mt-1 block">{timeframe}</strong></div></div></div>}
  </div>
}
