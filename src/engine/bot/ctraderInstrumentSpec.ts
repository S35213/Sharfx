import type { CTraderLiveInstrument } from '../../data/ctrader/CTraderLiveQuote'
import { normalizeProviderSymbol, providerSymbolsMatch } from '../../lib/normalizeProviderSymbol'
import type { SymbolSpec } from '../../types'

const isPositiveFinite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

/**
 * Turn verified cTrader instrument metadata into the SymbolSpec used by the
 * Trade Bot risk calculator. Missing/incomplete provider metadata deliberately
 * returns null; mock/default specs are not a safe substitute for broker rules.
 */
export const cTraderInstrumentToSymbolSpec = (
  selectedSymbol: string,
  instrument: CTraderLiveInstrument | null | undefined,
): SymbolSpec | null => {
  if (!instrument || instrument.tradable !== true) return null
  if (!instrument.symbol || !providerSymbolsMatch(selectedSymbol, instrument.symbol)) return null

  const canonicalSymbol = normalizeProviderSymbol(selectedSymbol)
  const currencies = canonicalSymbol.match(/^([A-Z]{3})\/([A-Z]{3})$/)
  if (!currencies) return null

  const contractSize = instrument.contractSize
  const pipSize = instrument.pipSize
  const minLotSize = instrument.quantityMin
  const maxLotSize = instrument.quantityMax
  const lotStep = instrument.quantityStep
  const priceIncrement = instrument.priceIncrement
  if (
    !isPositiveFinite(contractSize) ||
    !isPositiveFinite(pipSize) ||
    !isPositiveFinite(minLotSize) ||
    !isPositiveFinite(maxLotSize) ||
    !isPositiveFinite(lotStep) ||
    !isPositiveFinite(priceIncrement) ||
    maxLotSize < minLotSize
  ) return null

  const incrementText = priceIncrement.toFixed(10).replace(/0+$/, '')
  const pricePrecision = incrementText.includes('.') ? incrementText.split('.')[1].length : 0

  return {
    symbol: canonicalSymbol,
    baseCurrency: currencies[1],
    quoteCurrency: currencies[2],
    pipSize,
    contractSize,
    minLotSize,
    maxLotSize,
    lotStep,
    pricePrecision,
  }
}

export interface CTraderBrokerSpecEntry {
  sourceKey: string
  symbolSpec: SymbolSpec | null
  error?: string | null
}

export type CTraderBrokerSpecCache = Record<string, CTraderBrokerSpecEntry>

/**
 * Keep asynchronously resolved specs under their exact provider/account/
 * symbol key. A response from a previous selection must not overwrite the
 * current selection, and a transient failed refresh must not erase a verified
 * spec that was already cached for the same key.
 */
export const updateCTraderBrokerSpecCache = (
  cache: CTraderBrokerSpecCache,
  sourceKey: string,
  entry: Omit<CTraderBrokerSpecEntry, 'sourceKey'>,
  maxEntries = 24,
): CTraderBrokerSpecCache => {
  const previous = cache[sourceKey]
  if (previous?.symbolSpec && !entry.symbolSpec) return cache

  const next = Object.fromEntries(
    Object.entries(cache).filter(([key]) => key !== sourceKey),
  ) as CTraderBrokerSpecCache
  next[sourceKey] = { sourceKey, ...entry }

  const keys = Object.keys(next)
  const limit = Math.max(1, Math.floor(maxEntries))
  for (const oldestKey of keys.slice(0, Math.max(0, keys.length - limit))) {
    delete next[oldestKey]
  }
  return next
}
