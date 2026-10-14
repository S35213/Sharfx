import { describe, expect, it } from 'vitest'
import type { TradeOrder } from '../../types'
import { buildOpenPositionChartLines, buildOpenPositionsChartLines } from './buildPositionChartLines'

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
  it('shows OPEN and floating P/L in the plot while reserving price for the right scale', () => {
    const lines = buildOpenPositionChartLines(position(), 'USD')
    expect(lines.map(line => [line.id, line.price])).toEqual([
      ['pos-1-entry', 1.12],
      ['pos-1-sl', 1.119],
      ['pos-1-tp', 1.122],
    ])
    expect(lines[0]).toMatchObject({
      label: 'OPEN +$0.50',
      color: '#8A96A8',
      labelColor: '#22D3A5',
      priceTagOnly: true,
    })
    expect(lines[1]).toMatchObject({ label: 'STOP LOSS', priceTagOnly: true })
    expect(lines[2]).toMatchObject({ label: 'TAKE PROFIT', priceTagOnly: true })
  })

  it('colors a losing position red and marks unverified protection clearly', () => {
    const lines = buildOpenPositionChartLines(position({
      type: 'SELL',
      profit: -0.25,
      brokerProtectionConfirmed: false,
    }), 'EUR')
    expect(lines.find(line => line.id === 'pos-1-entry')).toMatchObject({
      label: 'OPEN −€0.25',
      color: '#8A96A8',
      labelColor: '#FF5C75',
    })
    expect(lines.find(line => line.id === 'pos-1-sl')?.label).toContain('UNCONFIRMED')
    expect(lines.find(line => line.id === 'pos-1-tp')?.label).toContain('UNCONFIRMED')
  })

  it('prefers broker-confirmed SL/TP over stale planned levels', () => {
    const lines = buildOpenPositionChartLines(position({
      stopLoss: 1.119,
      plannedStopLossPrice: 1.1187,
      takeProfit: 1.122,
      plannedTakeProfitPrice: 1.1223,
    }))
    expect(lines.find(line => line.id === 'pos-1-sl')?.price).toBe(1.119)
    expect(lines.find(line => line.id === 'pos-1-tp')?.price).toBe(1.122)
  })

  it('does not fabricate a P/L amount when the broker has not supplied one', () => {
    const lines = buildOpenPositionChartLines(position({ profit: undefined }))
    expect(lines.find(line => line.id === 'pos-1-entry')).toMatchObject({
      label: 'OPEN —',
      color: '#8A96A8',
      labelColor: '#8A96A8',
    })
  })

  it('does not create live trade levels for a closed trade', () => {
    expect(buildOpenPositionChartLines(position({ status: 'closed' }))).toEqual([])
  })

  it('shows the lines for all open positions while collapsing duplicate stop/target prices', () => {
    const lines = buildOpenPositionsChartLines([
      position({ id: 'pos-1', entryPrice: 1.12, stopLoss: 1.119, takeProfit: 1.122 }),
      position({ id: 'pos-2', entryPrice: 1.121, stopLoss: 1.119, takeProfit: 1.122, profit: -0.2 }),
      position({ id: 'pos-3', entryPrice: 1.122, stopLoss: 1.121, takeProfit: 1.125 }),
      position({ id: 'closed', status: 'closed', entryPrice: 1.13 }),
    ])
    expect(lines.filter(line => line.id.endsWith('-entry'))).toHaveLength(3)
    expect(lines.find(line => line.label === 'STOP LOSS · 2 trades')?.price).toBe(1.119)
    expect(lines.find(line => line.label === 'TAKE PROFIT · 2 trades')?.price).toBe(1.122)
    expect(lines.some(line => line.id.endsWith('-current'))).toBe(false)
  })
})
