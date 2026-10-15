import type { TradeOrder } from '../../types'
import { providerSymbolsMatch } from '../../lib/normalizeProviderSymbol'

export interface CTraderPositionReconcileOptions {
  connectionId: string
  accountId: string
  /** Injected for deterministic tests; defaults to the current wall clock. */
  nowMs?: number
  /** Keep a just-submitted local trade briefly while broker position reads catch up. */
  recentLocalGraceMs?: number
  /** Lets callers tolerate an unresolved numeric broker symbol ID as before. */
  symbolMatches?: (localSymbol: string, brokerSymbol: string) => boolean
}

const isTargetAccountPosition = (
  position: TradeOrder,
  connectionId: string,
  accountId: string,
): boolean =>
  position.providerId === 'ctrader' &&
  position.providerConnectionId === connectionId &&
  position.providerAccountId === accountId

const sharesBrokerIdentity = (local: TradeOrder, broker: TradeOrder): boolean =>
  local.id === broker.id ||
  local.providerOrderId === broker.id ||
  broker.providerOrderId === local.id ||
  (Boolean(local.providerOrderId) && local.providerOrderId === broker.providerOrderId)

/**
 * Replace one account's local open-position mirror with a successful broker
 * snapshot. The broker is authoritative for older positions, including an
 * empty snapshot; only unmatched local positions within the short submission
 * grace period survive a temporarily delayed broker position read.
 *
 * Other providers/accounts are kept separate instead of being matched by a
 * coincidentally reused provider position ID.
 */
export const reconcileCTraderPositionList = (
  current: readonly TradeOrder[],
  brokerSnapshot: readonly TradeOrder[],
  options: CTraderPositionReconcileOptions,
  mergeBrokerPosition: (broker: TradeOrder, previous?: TradeOrder) => TradeOrder = (broker, previous) => ({
    ...previous,
    ...broker,
  }),
): TradeOrder[] => {
  const {
    connectionId,
    accountId,
    nowMs = Date.now(),
    recentLocalGraceMs = 120_000,
    symbolMatches = providerSymbolsMatch,
  } = options
  if (!connectionId || !accountId) return [...current]
  if (!Number.isFinite(nowMs) || !Number.isFinite(recentLocalGraceMs) || recentLocalGraceMs < 0) {
    throw new RangeError('cTrader reconciliation clock and grace period must be finite and non-negative.')
  }

  const localAccountPositions = current.filter((position) =>
    isTargetAccountPosition(position, connectionId, accountId))
  const otherAccountPositions = current.filter((position) =>
    !isTargetAccountPosition(position, connectionId, accountId))
  const consumedIds = new Set<string>()
  const merged: TradeOrder[] = []

  for (const brokerPosition of brokerSnapshot) {
    let previous = localAccountPositions.find((position) =>
      !consumedIds.has(position.id) && sharesBrokerIdentity(position, brokerPosition))

    if (!previous) {
      const tolerance = brokerPosition.symbol.toUpperCase().includes('JPY') ? 0.05 : 0.0005
      const similar = localAccountPositions.filter((position) =>
        !consumedIds.has(position.id) &&
        position.type === brokerPosition.type &&
        symbolMatches(position.symbol, brokerPosition.symbol) &&
        Math.abs(position.entryPrice - brokerPosition.entryPrice) <= tolerance)
      if (similar.length === 1) previous = similar[0]
    }

    if (previous) consumedIds.add(previous.id)
    merged.push(mergeBrokerPosition(brokerPosition, previous))
  }

  const recentUnmatchedLocal = localAccountPositions.filter((position) => {
    if (consumedIds.has(position.id)) return false
    const openedAt = Date.parse(position.openTime)
    return Number.isFinite(openedAt) && nowMs - openedAt < recentLocalGraceMs
  })

  return [...otherAccountPositions, ...merged, ...recentUnmatchedLocal]
    .sort((left, right) => right.openTime.localeCompare(left.openTime))
}
