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
    expect(lines[0].label).toBe('BUY ENTRY')
    expect(lines[1].label).toBe('BUY CURRENT / EXIT')
    expect(lines[1].color).toBe('#22D3A5')
  })

  it('uses the live Ask as a SELL exit and colors a losing position red', () => {
    const lines = buildOpenPositionChartLines(position({ type: 'SELL', profit: -0.25 }), 1.1212, 1.1214)
    expect(lines.find(line => line.id === 'pos-1-current')).toMatchObject({
      price: 1.1214,
      label: 'SELL CURRENT / EXIT',
      color: '#FF5C75',
    })
  })

  it('does not create live trade levels for a closed trade', () => {
    expect(buildOpenPositionChartLines(position({ status: 'closed' }), 1.1212, 1.1214)).toEqual([])
  })
})
