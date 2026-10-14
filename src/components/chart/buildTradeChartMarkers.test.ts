import { describe, expect, it } from 'vitest'
import type { OHLCV } from '../../types'
import { buildOpenTradeEntryMarkers, buildTradeChartMarkers, type TradeChartMarker } from './buildTradeChartMarkers'

const baseTime = 1_791_547_200
const candles: OHLCV[] = [
  { time: baseTime, open: 1.11980, high: 1.12000, low: 1.11970, close: 1.11990 },
  { time: baseTime + 60, open: 1.11990, high: 1.12010, low: 1.11980, close: 1.12000 },
  { time: baseTime + 120, open: 1.12000, high: 1.12020, low: 1.11990, close: 1.12010 },
]

const trade = (overrides: Partial<TradeChartMarker> = {}): TradeChartMarker => ({
  id: 'ticket-1',
  side: 'BUY',
  openTime: new Date((baseTime + 15) * 1000).toISOString(),
  entryPrice: 1.11985,
  volume: 0.02,
  status: 'open',
  ...overrides,
})

describe('SHAFX trade chart markers', () => {
  it('keeps an entry arrow and exact lot size visible for an open position', () => {
    expect(buildTradeChartMarkers(candles, [trade()], 'M1')).toMatchObject([
      { time: baseTime, position: 'belowBar', shape: 'arrowUp', text: 'BUY 0.02', color: '#22D3A5' },
    ])
  })

  it('shows SELL entries and exit markers for closed trades', () => {
    const markers = buildTradeChartMarkers(candles, [
      trade({
        side: 'SELL',
        status: 'closed',
        openTime: new Date((baseTime + 75) * 1000).toISOString(),
        closeTime: new Date((baseTime + 135) * 1000).toISOString(),
        exitPrice: 1.12010,
        profit: -0.35,
      }),
    ], 'M1')
    expect(markers).toHaveLength(2)
    expect(markers[0]).toMatchObject({ time: baseTime + 60, position: 'aboveBar', shape: 'arrowDown', text: 'SELL 0.02' })
    expect(markers[1]).toMatchObject({ time: baseTime + 120, shape: 'circle', text: 'OUT −', color: '#F5B84B' })
  })

  it('groups same-direction entries on the same candle to avoid label pile-ups', () => {
    const markers = buildTradeChartMarkers(candles, [
      trade({ id: 'one', status: 'closed' }),
      trade({ id: 'two', status: 'closed', openTime: new Date((baseTime + 25) * 1000).toISOString() }),
    ], 'M1')
    expect(markers).toHaveLength(1)
    expect(markers[0].text).toBe('BUY 0.02 ×2')
  })

  it('preserves distinct lot sizes when multiple entries share the same candle', () => {
    const markers = buildTradeChartMarkers(candles, [
      trade({ id: 'small', volume: 0.02 }),
      trade({ id: 'large', volume: 0.10 }),
    ], 'M1')
    expect(markers).toHaveLength(1)
    expect(markers[0].text).toBe('BUY 0.02 + 0.10')
  })

  it('returns independent price-anchored entry records for simultaneous open BUY and SELL positions', () => {
    const entries = buildOpenTradeEntryMarkers(candles, [
      trade({ id: 'buy-open', side: 'BUY', openTime: new Date((baseTime + 15) * 1000).toISOString(), entryPrice: 1.11985, volume: 0.10 }),
      trade({ id: 'sell-open', side: 'SELL', openTime: new Date((baseTime + 135) * 1000).toISOString(), entryPrice: 1.12015, volume: 0.02 }),
    ], 'M1')

    expect(entries).toHaveLength(2)
    expect(entries).toMatchObject([
      { id: 'buy-open', side: 'BUY', time: baseTime, entryPrice: 1.11985, volume: 0.10 },
      { id: 'sell-open', side: 'SELL', time: baseTime + 120, entryPrice: 1.12015, volume: 0.02 },
    ])
  })

  it('snaps an open entry across a single missing candle bucket only to a nearby real candle', () => {
    const sparse = [candles[0], candles[2]]
    const entries = buildOpenTradeEntryMarkers(sparse, [
      trade({ id: 'sell-gap', side: 'SELL', openTime: new Date((baseTime + 75) * 1000).toISOString() }),
    ], 'M1')
    expect(entries).toMatchObject([{ id: 'sell-gap', side: 'SELL', time: baseTime + 120 }])

    const outOfHistory = buildOpenTradeEntryMarkers(sparse, [
      trade({ id: 'old-sell', side: 'SELL', openTime: new Date((baseTime - 600) * 1000).toISOString() }),
    ], 'M1')
    expect(outOfHistory).toHaveLength(0)
  })

  it('does not attach a marker to an unrelated candle when the entry bucket is missing', () => {
    const sparse = [candles[0], candles[2]]
    const markers = buildTradeChartMarkers(sparse, [
      trade({ status: 'closed', openTime: new Date((baseTime + 75) * 1000).toISOString() }),
    ], 'M1')
    expect(markers).toHaveLength(0)
  })
})
