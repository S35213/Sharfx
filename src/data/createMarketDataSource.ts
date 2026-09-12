import type { MarketDataSource } from '../types'
import { runtimeConfig } from '../config/runtime'
import { HttpMarketTransport } from './live/HttpMarketTransport'
import { LiveMarketDataSource } from './live/LiveMarketDataSource'
import { marketDataSource as mockMarketDataSource } from './mock/MockDataSource'

export type DataMode = 'demo' | 'live'

export const getDataMode = (): DataMode => runtimeConfig.mode === 'live' ? 'live' : 'demo'

export const createMarketDataSource = (mode: DataMode = getDataMode()): MarketDataSource => {
  if (mode === 'demo') return mockMarketDataSource
  if (!runtimeConfig.liveMarketApiBaseUrl) throw new Error('Live market API URL is not configured.')
  return new LiveMarketDataSource(new HttpMarketTransport({ baseUrl: runtimeConfig.liveMarketApiBaseUrl }), {
    enforceFreshness: true,
  })
}

export const marketDataSource = createMarketDataSource()
