import type { AITradingContext, MarketEvent } from './types'

const near = (price: number, level: number): boolean => Math.abs(price - level) / price < 0.001

const eventKey = (event: MarketEvent): string => `${event.type}|${event.description}|${event.timestamp}`

export const detectMarketEvents = (
  currentContext: AITradingContext,
  previousContext: AITradingContext | null,
): MarketEvent[] => {
  const events: MarketEvent[] = []
  const { marketStructure, liquidity, setup, currentPrice, timestamp, symbol } = currentContext
  const precision = symbol.includes('JPY') ? 3 : 5

  if (previousContext) {
    if (previousContext.marketStructure.bias !== marketStructure.bias) {
      events.push({ type: 'STRUCTURE_CHANGED', description: `Structure bias changed from ${previousContext.marketStructure.bias} to ${marketStructure.bias}.`, timestamp, severity: 'critical' })
    }

    if (marketStructure.recentHigh !== null && previousContext.marketStructure.recentHigh !== null && marketStructure.recentHigh > previousContext.marketStructure.recentHigh) {
      events.push({ type: 'NEW_HIGHER_HIGH', description: `A new higher high formed at ${marketStructure.recentHigh.toFixed(precision)}.`, timestamp, severity: 'info' })
    }
    if (marketStructure.recentLow !== null && previousContext.marketStructure.recentLow !== null && marketStructure.recentLow < previousContext.marketStructure.recentLow) {
      events.push({ type: 'NEW_LOWER_LOW', description: `A new lower low formed at ${marketStructure.recentLow.toFixed(precision)}.`, timestamp, severity: 'warning' })
    }

    const previousPools = new Set(previousContext.liquidity.pools.map((pool) => `${pool.type}|${pool.referencePrice}`))
    for (const pool of liquidity.pools) {
      const key = `${pool.type}|${pool.referencePrice}`
      if (!previousPools.has(key) && !pool.isSwept) {
        events.push({ type: 'LIQUIDITY_FORMED', description: `${pool.type === 'buy-side' ? 'Buy-side' : 'Sell-side'} liquidity formed near ${pool.referencePrice.toFixed(precision)}.`, timestamp, severity: 'info' })
      }
    }

    const previousSwept = new Set(previousContext.liquidity.pools.filter((pool) => pool.isSwept).map((pool) => `${pool.type}|${pool.referencePrice}`))
    for (const pool of liquidity.pools) {
      const key = `${pool.type}|${pool.referencePrice}`
      if (pool.isSwept && !previousSwept.has(key)) {
        events.push({ type: 'LIQUIDITY_SWEEPED', description: `${pool.type === 'buy-side' ? 'Buy-side' : 'Sell-side'} liquidity near ${pool.referencePrice.toFixed(precision)} was swept.`, timestamp, severity: 'warning' })
      }
    }

    const previousSetup = previousContext.setup.preferredSetup
    const currentSetup = setup.preferredSetup
    if (!previousSetup && currentSetup?.status === 'candidate') {
      events.push({ type: currentSetup.direction === 'BUY' ? 'BULLISH_SETUP_APPEARED' : 'BEARISH_SETUP_APPEARED', description: `A ${currentSetup.direction === 'BUY' ? 'bullish' : 'bearish'} setup candidate appeared.`, timestamp, severity: 'info' })
    }
    if (previousSetup?.status === 'candidate' && (!currentSetup || currentSetup.status === 'invalid')) {
      events.push({ type: 'SETUP_INVALIDATED', description: 'The previous preferred setup is no longer a valid candidate.', timestamp, severity: 'critical' })
    }

    if (previousSetup?.status === 'candidate') {
      if (currentPrice >= previousSetup.takeProfit && previousSetup.direction === 'BUY' || currentPrice <= previousSetup.takeProfit && previousSetup.direction === 'SELL') {
        events.push({ type: 'PRICE_REACHED_TARGET', description: `Price reached the previous setup target at ${previousSetup.takeProfit.toFixed(precision)}.`, timestamp, severity: 'info' })
      }
      if (currentPrice <= previousSetup.stopLoss && previousSetup.direction === 'BUY' || currentPrice >= previousSetup.stopLoss && previousSetup.direction === 'SELL') {
        events.push({ type: 'PRICE_REACHED_INVALIDATION', description: `Price reached the previous setup invalidation level at ${previousSetup.stopLoss.toFixed(precision)}.`, timestamp, severity: 'critical' })
      }
    }
  }

  const support = currentContext.supportResistance.nearestSupport
  const resistance = currentContext.supportResistance.nearestResistance
  if (support !== null && near(currentPrice, support)) {
    events.push({ type: 'SUPPORT_APPROACHED', description: `Price is approaching support at ${support.toFixed(precision)}.`, timestamp, severity: 'warning' })
  }
  if (resistance !== null && near(currentPrice, resistance)) {
    events.push({ type: 'RESISTANCE_APPROACHED', description: `Price is approaching resistance at ${resistance.toFixed(precision)}.`, timestamp, severity: 'warning' })
  }

  const unique = new Map<string, MarketEvent>()
  for (const event of events) unique.set(eventKey(event), event)
  const severityRank = { critical: 0, warning: 1, info: 2 }
  return [...unique.values()].sort((a, b) => a.timestamp - b.timestamp || severityRank[a.severity] - severityRank[b.severity] || a.type.localeCompare(b.type))
}
