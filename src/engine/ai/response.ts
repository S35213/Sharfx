import type { AITradingContext, AITradingResponse, MarketEvent, UserIntent } from './types'

const fmt = (value: number, precision: number): string => value.toFixed(precision)

export const buildTradingResponse = (context: AITradingContext, events: MarketEvent[], intent: UserIntent): AITradingResponse => {
  const { symbol, timeframe, marketStructure, supportResistance, liquidity, setup, externalEvents } = context
  const precision = symbol.includes('JPY') ? 3 : 5
  const preferred = setup.preferredSetup

  let marketState: string
  if (marketStructure.bias === 'Bullish') marketState = `${symbol} is structurally bullish on ${timeframe}.`
  else if (marketStructure.bias === 'Bearish') marketState = `${symbol} is structurally bearish on ${timeframe}.`
  else if (marketStructure.bias === 'Sideways') marketState = `${symbol} is moving sideways on ${timeframe}.`
  else marketState = `${symbol} has an unclear structure on ${timeframe}.`

  let reasoning: string
  if (marketStructure.bias === 'Bullish') reasoning = `The latest swing sequence is ${marketStructure.structureType}, with higher highs and higher lows supporting the bullish interpretation.`
  else if (marketStructure.bias === 'Bearish') reasoning = `The latest swing sequence is ${marketStructure.structureType}, with lower highs and lower lows supporting the bearish interpretation.`
  else if (marketStructure.bias === 'Sideways') reasoning = `The swing structure is consolidating, so there is not enough directional evidence to favor a trend.`
  else reasoning = `The available swing structure is not clear enough to support a directional bias.`

  if (context.higherTimeframeBias) reasoning += ` Higher-timeframe context is ${context.higherTimeframeBias.toLowerCase()}.`
  if (externalEvents.length === 0) reasoning += ` Live economic-news data is not available in simulator mode.`
  else if (externalEvents.some((event) => event.impact === 'high' && !event.isSimulated)) reasoning += ` High-impact external events are present, so headline risk should be considered.`

  let watching = 'I am watching the next structural reaction.'
  if (marketStructure.bias === 'Bullish' && supportResistance.nearestSupport !== null) watching = `I am watching support at ${fmt(supportResistance.nearestSupport, precision)} for a bullish reaction.`
  else if (marketStructure.bias === 'Bearish' && supportResistance.nearestResistance !== null) watching = `I am watching resistance at ${fmt(supportResistance.nearestResistance, precision)} for a bearish reaction.`
  else if (supportResistance.nearestSupport !== null && supportResistance.nearestResistance !== null) watching = `I am watching support at ${fmt(supportResistance.nearestSupport, precision)} and resistance at ${fmt(supportResistance.nearestResistance, precision)}.`

  const invalidation = preferred?.status === 'candidate'
    ? `The setup becomes invalid if ${preferred.invalidation}`
    : marketStructure.bias === 'Bullish' && marketStructure.recentLow !== null
      ? `A confirmed break below the recent structural low at ${fmt(marketStructure.recentLow, precision)} would weaken the bullish interpretation.`
      : marketStructure.bias === 'Bearish' && marketStructure.recentHigh !== null
        ? `A confirmed break above the recent structural high at ${fmt(marketStructure.recentHigh, precision)} would weaken the bearish interpretation.`
        : 'There is no active setup with a defined invalidation level.'

  let setupDetails: string | null = null
  let confidence = 0
  let riskReward: string | null = null
  if (preferred?.status === 'candidate') {
    setupDetails = `${preferred.direction} | Entry ${fmt(preferred.entryPrice, precision)} | SL ${fmt(preferred.stopLoss, precision)} | TP ${fmt(preferred.takeProfit, precision)} | ${preferred.quality} quality`
    confidence = preferred.confidence
    riskReward = `1:${preferred.riskRewardRatio.toFixed(1)}`
  }

  switch (intent) {
    case 'WHY_BULLISH':
      reasoning = marketStructure.bias === 'Bullish' ? `The bullish view comes from ${marketStructure.structureType}: successive swing highs and lows are stepping higher.` : `I would not call the current structure bullish; it is ${marketStructure.bias.toLowerCase()}.`
      break
    case 'WHY_BEARISH':
      reasoning = marketStructure.bias === 'Bearish' ? `The bearish view comes from ${marketStructure.structureType}: successive swing highs and lows are stepping lower.` : `I would not call the current structure bearish; it is ${marketStructure.bias.toLowerCase()}.`
      break
    case 'WHERE_LIQUIDITY': {
      const parts: string[] = []
      if (liquidity.nearestBuySide) parts.push(`Buy-side liquidity is near ${fmt(liquidity.nearestBuySide.referencePrice, precision)} (${liquidity.nearestBuySide.association}, ${liquidity.nearestBuySide.strength}).`)
      if (liquidity.nearestSellSide) parts.push(`Sell-side liquidity is near ${fmt(liquidity.nearestSellSide.referencePrice, precision)} (${liquidity.nearestSellSide.association}, ${liquidity.nearestSellSide.strength}).`)
      reasoning = parts.length ? parts.join(' ') : 'No significant liquidity pool is detected from the current swing data.'
      break
    }
    case 'WHAT_INVALIDATES': reasoning = invalidation; break
    case 'WHERE_ENTER': reasoning = preferred?.status === 'candidate' ? `The current candidate uses ${fmt(preferred.entryPrice, precision)} as entry, ${fmt(preferred.stopLoss, precision)} as stop, and ${fmt(preferred.takeProfit, precision)} as target.` : 'There is no valid preferred entry candidate right now.'; break
    case 'IS_SETUP': reasoning = preferred?.status === 'candidate' ? `Yes. A ${preferred.direction === 'BUY' ? 'bullish' : 'bearish'} ${preferred.quality} setup candidate is present.` : 'No aligned setup is currently detected.'; break
    case 'WHY_NO_ENTRY': reasoning = preferred?.status === 'candidate' ? 'A setup candidate exists, but the simulator does not assume that a candidate guarantees execution or outcome.' : 'There is no aligned setup because the required structure, level, and liquidity conditions are not simultaneously satisfied.'; break
    case 'WHAT_WATCHING': reasoning = watching; break
    case 'WHAT_CHANGED': reasoning = events.length ? `The latest detected change is: ${events[events.length - 1].description}` : 'No new state change has been detected.'; break
    case 'WHAT_IF_SUPPORT_BREAKS': reasoning = supportResistance.nearestSupport !== null ? `A confirmed break below ${fmt(supportResistance.nearestSupport, precision)} would require the current structure to be reassessed.` : 'No immediate support level is available.'; break
    case 'WHAT_IF_RESISTANCE_BREAKS': reasoning = supportResistance.nearestResistance !== null ? `A confirmed break above ${fmt(supportResistance.nearestResistance, precision)} would require the current structure to be reassessed and could expose the next liquidity area.` : 'No immediate resistance level is available.'; break
    case 'WHAT_IS_HAPPENING': break
  }

  return { marketState, reasoning, watching, invalidation, setupDetails, confidence, riskReward, recentEvent: events[events.length - 1] ?? null, intent, dataStatus: context.dataStatus }
}
