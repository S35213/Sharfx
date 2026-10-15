import { describe, expect, it, vi } from 'vitest'
import type { TradeOrder } from '../../types'
import { isCompleteCTraderPositionSnapshot, reconcileCTraderPositionList } from './reconcileCTraderPositionList'

const NOW = Date.parse('2026-10-15T09:00:00.000Z')

const trade = (overrides: Partial<TradeOrder> = {}): TradeOrder => ({
  id: 'position-1',
  symbol: 'EUR/USD',
  type: 'BUY',
  lotSize: 0.01,
  entryPrice: 1.1,
  stopLoss: null,
  takeProfit: null,
  riskPercent: 0,
  riskAmount: 0,
  rewardAmount: 0,
  riskRewardRatio: 0,
  status: 'open',
  openTime: new Date(NOW - 180_000).toISOString(),
  providerId: 'ctrader',
  providerConnectionId: 'connection-1',
  providerAccountId: 'account-1',
  providerOrderId: 'position-1',
  ...overrides,
})

const options = {
  connectionId: 'connection-1',
  accountId: 'account-1',
  nowMs: NOW,
}

describe('reconcileCTraderPositionList', () => {
  it('accepts a genuinely empty provider snapshot as complete', () => {
    expect(isCompleteCTraderPositionSnapshot([], [])).toBe(true)
  })

  it('rejects a non-empty provider snapshot when a row failed normalization', () => {
    expect(isCompleteCTraderPositionSnapshot([{ id: 'bad-position' }], [])).toBe(false)
  })

  it('accepts a snapshot only when every reported row was normalized', () => {
    expect(isCompleteCTraderPositionSnapshot([{ id: 'position-1' }], [trade()])).toBe(true)
  })

  it('removes stale local positions when a successful broker snapshot is empty', () => {
    const stale = trade({ id: 'stale-position', providerOrderId: 'stale-position' })
    const recent = trade({
      id: 'just-opened',
      providerOrderId: 'just-opened',
      openTime: new Date(NOW - 20_000).toISOString(),
    })
    const otherCTraderAccount = trade({
      id: 'other-account-position',
      providerOrderId: 'other-account-position',
      providerConnectionId: 'connection-2',
      providerAccountId: 'account-2',
    })
    const derivPosition = trade({
      id: 'deriv-position',
      providerId: 'deriv',
      providerConnectionId: 'deriv-connection',
      providerAccountId: 'deriv-account',
    })

    const result = reconcileCTraderPositionList(
      [stale, recent, otherCTraderAccount, derivPosition],
      [],
      options,
    )

    expect(result.map((item) => item.id).sort()).toEqual([
      'deriv-position',
      'just-opened',
      'other-account-position',
    ])
  })

  it('updates an existing position by broker identity without making a duplicate', () => {
    const local = trade({
      id: 'local-order-id',
      providerOrderId: 'position-1',
      openTime: new Date(NOW - 300_000).toISOString(),
      chartTimeframe: 'M5',
    })
    const broker = trade({
      id: 'position-1',
      providerOrderId: 'position-1',
      entryPrice: 1.101,
      profit: 2.5,
      openTime: new Date(NOW - 240_000).toISOString(),
    })
    const merge = vi.fn((position: TradeOrder, previous?: TradeOrder): TradeOrder => ({
      ...previous,
      ...position,
      chartTimeframe: previous?.chartTimeframe ?? position.chartTimeframe,
    }))

    const result = reconcileCTraderPositionList([local], [broker], options, merge)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: 'position-1', entryPrice: 1.101, profit: 2.5, chartTimeframe: 'M5' })
    expect(merge).toHaveBeenCalledWith(broker, local)
  })

  it('does not match a same-ID position from another account into this account', () => {
    const otherAccount = trade({
      id: 'position-other',
      providerOrderId: 'position-1',
      providerConnectionId: 'connection-2',
      providerAccountId: 'account-2',
    })
    const broker = trade({ id: 'position-1', providerOrderId: 'position-1' })

    const result = reconcileCTraderPositionList([otherAccount], [broker], options)

    expect(result).toHaveLength(2)
    expect(result.find((item) => item.id === 'position-other')).toBe(otherAccount)
    expect(result.some((item) => item.id === 'position-1' && item.providerAccountId === 'account-1')).toBe(true)
  })

  it('does not collapse ambiguous same-entry positions into one guessed match', () => {
    const first = trade({ id: 'local-a', providerOrderId: 'local-a', openTime: new Date(NOW - 300_000).toISOString() })
    const second = trade({ id: 'local-b', providerOrderId: 'local-b', openTime: new Date(NOW - 300_000).toISOString() })
    const broker = trade({ id: 'broker-position', providerOrderId: 'broker-position' })

    const result = reconcileCTraderPositionList([first, second], [broker], options)

    expect(result.map((item) => item.id)).toEqual(['broker-position'])
  })

  it('fails closed for missing source identity and invalid clocks', () => {
    const local = trade()
    expect(reconcileCTraderPositionList([local], [], { connectionId: '', accountId: 'account-1' })).toEqual([local])
    expect(() => reconcileCTraderPositionList([local], [], { ...options, nowMs: Number.NaN })).toThrow(RangeError)
  })
})
