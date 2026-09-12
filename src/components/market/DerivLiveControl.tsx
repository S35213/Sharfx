import React, { useEffect, useRef, useState } from 'react'
import type { OHLCV, Timeframe } from '../../types'
import { DerivPublicMarketFeed } from '../../data/deriv/DerivPublicMarketFeed'

interface DerivLiveControlProps {
  symbol: string
  timeframe: Timeframe
  onUpdate: (candles: OHLCV[], price: number, epoch: number) => void
}

type Status = 'demo' | 'connecting' | 'live' | 'error'

export const DerivLiveControl: React.FC<DerivLiveControlProps> = ({ symbol, timeframe, onUpdate }) => {
  const feedRef = useRef<DerivPublicMarketFeed | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [status, setStatus] = useState<Status>('demo')

  useEffect(() => () => feedRef.current?.disconnect(), [])

  const toggle = (): void => {
    if (enabled) {
      feedRef.current?.disconnect()
      setEnabled(false)
      setStatus('demo')
      return
    }
    const feed = new DerivPublicMarketFeed()
    feedRef.current = feed
    setEnabled(true)
    setStatus('connecting')
    feed.connect(symbol, timeframe, {
      onUpdate,
      onStatus: (next, message) => {
        if (next === 'connected') setStatus('live')
        else if (next === 'error') setStatus('error')
        else if (next === 'disconnected' && enabled) setStatus('error')
        if (message) console.warn(`Deriv market feed: ${message}`)
      },
    })
  }

  useEffect(() => {
    if (!enabled) return
    feedRef.current?.disconnect()
    const feed = new DerivPublicMarketFeed()
    feedRef.current = feed
    setStatus('connecting')
    feed.connect(symbol, timeframe, {
      onUpdate,
      onStatus: (next) => setStatus(next === 'connected' ? 'live' : next === 'error' ? 'error' : next === 'disconnected' ? 'error' : 'connecting'),
    })
    return () => feed.disconnect()
  }, [enabled, onUpdate, symbol, timeframe])

  const label = status === 'live' ? 'Live' : status === 'connecting' ? 'Connecting' : status === 'error' ? 'Retry Live' : 'Demo'
  return <button type="button" onClick={toggle} aria-pressed={enabled} className="flex min-h-10 items-center gap-2 rounded-lg border border-shafx-border bg-shafx-surface px-3 text-xs font-medium text-shafx-text transition hover:border-shafx-primary"><span className={`h-2 w-2 rounded-full ${status === 'live' ? 'bg-emerald-400' : status === 'error' ? 'bg-red-400' : 'bg-shafx-textMuted'}`} />{label} Market</button>
}
