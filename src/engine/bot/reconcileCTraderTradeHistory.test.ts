import { describe, expect, it } from 'vitest'
import type { TradeOrder } from '../../types'
import { reconcileCTraderTradeHistory } from './reconcileCTraderTradeHistory'

const baseTrade = (overrides: Partial<TradeOrder> = {}): TradeOrder => ({
  id: 'position-1',
  symbol: 'EUR/USD',
  type: 'BUY',
  lotSize: 0.1,
  volumeLots: 0.1,
  entryPrice: 1.1,
  exitPrice: 1.101,
  stopLoss: null,
  takeProfit: null,
  riskPercent: 0,
  riskAmount: 0,
  rewardAmount: 0,
  riskRewardRatio: 0,
  status: 'closed',
  openTime: '2026-10-14T10:00:00.000Z',
  closeTime: '2026-10-14T10:05:00.000Z',
  profit: 1.25,
  providerId: 'ctrader',
  providerConnectionId: 'connection-1',
  providerAccountId: 'account-1',
  brokerProduct: 'SHAFX_CFD_CTRADER',
  ...overrides,
})

const scope = { connectionId: 'connection-1', accountId: 'account-1' }

describe('reconcileCTraderTradeHistory', () => {
  it('refreshes matching history from cTrader and preserves local chart context', () => {
    const local = baseTrade({ chartTimeframe: 'M5', profit: 0 })
    const broker = baseTrade({
      profit: 2.7,
      exitPrice: 1.102,
      closeTime: '2026-10-14T10:06:00.000Z',
    })

    const result = reconcileCTraderTradeHistory([local], [broker], scope)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'position-1',
      profit: 2.7,
      exitPrice: 1.102,
      chartTimeframe: 'M5',
    })
  })

  it('preserves a locally confirmed close omitted by a lagging broker history page', () => {
    const local = baseTrade({ id: 'just-closed', profit: -0.6 })
    const result = reconcileCTraderTradeHistory([local], [], scope)

    expect(result).toEqual([local])
  })

  it('keeps other providers and cTrader accounts isolated even for colliding IDs', () => {
    const selectedAccount = baseTrade({ profit: 0.5 })
    const otherAccount = baseTrade({
      providerConnectionId: 'connection-2',
      providerAccountId: 'account-2',
      profit: 99,
    })
    const deriv = baseTrade({ providerId: 'deriv', providerConnectionId: 'deriv-connection', providerAccountId: 'deriv-account', profit: 7 })
    const broker = baseTrade({ profit: 1.5 })

    const result = reconcileCTraderTradeHistory([selectedAccount, otherAccount, deriv], [broker], scope)

    expect(result).toHaveLength(3)
    expect(result.find((trade) => trade.providerId === 'ctrader' && trade.providerConnectionId === 'connection-1')?.profit).toBe(1.5)
    expect(result.find((trade) => trade.providerConnectionId === 'connection-2')?.profit).toBe(99)
    expect(result.find((trade) => trade.providerId === 'deriv')?.profit).toBe(7)
  })

  it('is idempotent across repeated broker snapshots and does not duplicate IDs', () => {
    const broker = baseTrade({ profit: 1.5 })
    const once = reconcileCTraderTradeHistory([], [broker, broker], scope)
    const twice = reconcileCTraderTradeHistory(once, [broker, broker], scope)

    expect(once).toHaveLength(1)
    expect(twice).toHaveLength(1)
    expect(twice[0].id).toBe('position-1')
  })

  it('ignores malformed and out-of-scope broker rows without deleting known history', () => {
    const local = baseTrade({ id: 'known-close' })
    const invalid = { ...baseTrade(), entryPrice: 0 }
    const otherAccount = baseTrade({ id: 'foreign-close', providerAccountId: 'account-2' })

    const result = reconcileCTraderTradeHistory(
      [local],
      [invalid, otherAccount, { nonsense: true }],
      scope,
    )

    expect(result).toEqual([local])
  })

  it('sorts merged results by newest close/open timestamp first', () => {
    const older = baseTrade({ id: 'older', closeTime: '2026-10-13T10:05:00.000Z' })
    const newer = baseTrade({ id: 'newer', closeTime: '2026-10-15T10:05:00.000Z' })
    const result = reconcileCTraderTradeHistory([older], [newer], scope)

    expect(result.map((trade) => trade.id)).toEqual(['newer', 'older'])
  })
})
