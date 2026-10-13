import { describe, expect, it } from 'vitest'
import type { TradeOrder } from '../../types'
import { buildOpenPositionChartLines } from './buildPositionChartLines'

const position = (overrides: Partial<TradeOrder> = {}): TradeOrder => ({
  id: 'pos-1',
  symbol: 'EUR/USD',
  type: 'BUY',
  lotSize: 0.02,
  entryPrice: 1.12,
  stopLoss: 1.119,
  takeProfit: 1.122,
  riskPercent: 1,
  riskAmount: 2,
  rewardAmount: 4,
  riskRewardRatio: 2,
  status: 'open',
  openTime: '2026-10-09T10:00:00.000Z',
  profit: 0.5,
  ...overrides,
})

describe('open position chart lines', () => {
  it('keeps BUY entry fixed and uses the live Bid as its current exit price', () => {
    const lines = buildOpenPositionChartLines(position(), 1.1212, 1.1214)
    expect(lines.map(line => [line.id, line.price])).toEqual([
      ['pos-1-entry', 1.12],
      ['pos-1-current', 1.1212],
      ['pos-1-sl', 1.119],
      ['pos-1-tp', 1.122],
    ])
    expect(lines[0].label).toBe('OPEN +$0.50')
    expect(lines[0].color).toBe('#8A96A8')
    expect(lines[0].labelColor).toBe('#22D3A5')
    expect(lines[1].label).toBe('BUY CURRENT / EXIT')
    expect(lines[1].color).toBe('#2F80FF')
  })

  it('uses the live Ask as a SELL exit and colors a losing position red', () => {
    const lines = buildOpenPositionChartLines(position({ type: 'SELL', profit: -0.25 }), 1.1212, 1.1214, 'EUR')
    expect(lines.find(line => line.id === 'pos-1-entry')).toMatchObject({
      label: 'OPEN −€0.25',
      color: '#8A96A8',
      labelColor: '#FF5C75',
    })
    expect(lines.find(line => line.id === 'pos-1-current')).toMatchObject({
      price: 1.1214,
      label: 'SELL CURRENT / EXIT',
      color: '#F04452',
      labelColor: '#F04452',
    })
  })

  it('does not fabricate a P/L amount when the broker has not supplied one', () => {
    const lines = buildOpenPositionChartLines(position({ profit: undefined }), 1.1212, 1.1214)
    expect(lines.find(line => line.id === 'pos-1-entry')).toMatchObject({
      label: 'OPEN —',
      color: '#8A96A8',
      labelColor: '#8A96A8',
    })
  })

  it('does not create live trade levels for a closed trade', () => {
    expect(buildOpenPositionChartLines(position({ status: 'closed' }), 1.1212, 1.1214)).toEqual([])
  })
})
