import type { TradeOrder } from '../../types'

export interface CTraderTradeHistoryScope {
  connectionId: string
  accountId: string
}

const hasValidTimestamp = (value: unknown): boolean =>
  typeof value === 'string' && value.trim().length > 0 && Number.isFinite(Date.parse(value))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const isScopedCTraderTrade = (
  trade: TradeOrder,
  scope: CTraderTradeHistoryScope,
): boolean =>
  trade.providerId === 'ctrader' &&
  trade.providerConnectionId === scope.connectionId &&
  trade.providerAccountId === scope.accountId

const isUsableBrokerHistoryRecord = (
  value: unknown,
  scope: CTraderTradeHistoryScope,
): value is TradeOrder => {
  if (!isRecord(value)) return false
  const trade = value as unknown as TradeOrder
  if (!isScopedCTraderTrade(trade, scope) || trade.status !== 'closed') return false
  if (typeof trade.id !== 'string' || !trade.id.trim()) return false
  if (typeof trade.symbol !== 'string' || !trade.symbol.trim()) return false
  if (trade.type !== 'BUY' && trade.type !== 'SELL') return false
  if (!hasValidTimestamp(trade.openTime)) return false
  if (trade.closeTime !== undefined && !hasValidTimestamp(trade.closeTime)) return false
  if (!Number.isFinite(Number(trade.entryPrice)) || Number(trade.entryPrice) <= 0) return false
  if (trade.profit !== undefined && !Number.isFinite(Number(trade.profit))) return false
  if (trade.lotSize !== undefined && !Number.isFinite(Number(trade.lotSize))) return false
  return true
}

/**
 * Merge the selected cTrader account's closed-deal snapshot into the shared
 * trade journal. A broker row is authoritative for a matching position ID,
 * but an omitted row does not erase a local close confirmed by the close API.
 * Other providers and other cTrader accounts are kept isolated.
 *
 * This is a read-only journal reconciliation: it never sends or changes orders.
 */
export const reconcileCTraderTradeHistory = (
  current: readonly TradeOrder[],
  brokerSnapshot: readonly unknown[],
  scope: CTraderTradeHistoryScope,
): TradeOrder[] => {
  if (!scope.connectionId || !scope.accountId) return [...current]

  const preserved: TradeOrder[] = []
  const byId = new Map<string, TradeOrder>()

  for (const trade of current) {
    if (!isScopedCTraderTrade(trade, scope) || !trade.id?.trim()) {
      preserved.push(trade)
      continue
    }
    // Keep existing rows until a same-ID broker row can refresh them. This
    // prevents an incomplete/lagging history response from deleting a close.
    if (!byId.has(trade.id)) byId.set(trade.id, trade)
  }

  for (const candidate of brokerSnapshot) {
    if (!isUsableBrokerHistoryRecord(candidate, scope)) continue
    const previous = byId.get(candidate.id)
    byId.set(candidate.id, {
      ...previous,
      ...candidate,
      // Chart timeframe is local SHAFX context; cTrader deal history does not
      // return it, so don't throw it away when authoritative history arrives.
      chartTimeframe: candidate.chartTimeframe ?? previous?.chartTimeframe,
    })
  }

  return [...preserved, ...byId.values()].sort((left, right) => {
    const leftTime = Date.parse(left.closeTime || left.openTime)
    const rightTime = Date.parse(right.closeTime || right.openTime)
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0)
  })
}
