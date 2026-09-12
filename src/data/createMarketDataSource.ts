import type { MarketDataSource } from '../types'
import { HttpMarketTransport } from './live/HttpMarketTransport'
import { LiveMarketDataSource } from './live/LiveMarketDataSource'
import { marketDataSource as mockMarketDataSource } from './mock/MockDataSource'

export type DataMode = 'demo' | 'live'

export const getDataMode = (): DataMode => {
  if (typeof window === 'undefined') return 'demo'
  return new URLSearchParams(window.location.search).get('data') === 'live' ? 'live' : 'demo'
}

export const createMarketDataSource = (mode: DataMode = getDataMode()): MarketDataSource => {
  if (mode === 'demo') return mockMarketDataSource
  const baseUrl = typeof window === 'undefined' ? '/api/market' : `${window.location.origin}/api/market`
  return new LiveMarketDataSource(new HttpMarketTransport({ baseUrl }))
}

export const marketDataSource = createMarketDataSource()
