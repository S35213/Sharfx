import type { SymbolSpec } from '../../types'

export const DEFAULT_SYMBOL = 'EUR/USD'

export const SYMBOL_SPECS: Record<string, SymbolSpec> = {
  'EUR/USD': { symbol: 'EUR/USD', baseCurrency: 'EUR', quoteCurrency: 'USD', pipSize: 0.0001, contractSize: 100000, minLotSize: 0.01, maxLotSize: 100, lotStep: 0.01, pricePrecision: 5 },
  'GBP/USD': { symbol: 'GBP/USD', baseCurrency: 'GBP', quoteCurrency: 'USD', pipSize: 0.0001, contractSize: 100000, minLotSize: 0.01, maxLotSize: 100, lotStep: 0.01, pricePrecision: 5 },
  'USD/JPY': { symbol: 'USD/JPY', baseCurrency: 'USD', quoteCurrency: 'JPY', pipSize: 0.01, contractSize: 100000, minLotSize: 0.01, maxLotSize: 100, lotStep: 0.01, pricePrecision: 3 },
  'USD/CHF': { symbol: 'USD/CHF', baseCurrency: 'USD', quoteCurrency: 'CHF', pipSize: 0.0001, contractSize: 100000, minLotSize: 0.01, maxLotSize: 100, lotStep: 0.01, pricePrecision: 5 },
  'AUD/USD': { symbol: 'AUD/USD', baseCurrency: 'AUD', quoteCurrency: 'USD', pipSize: 0.0001, contractSize: 100000, minLotSize: 0.01, maxLotSize: 100, lotStep: 0.01, pricePrecision: 5 },
  'USD/CAD': { symbol: 'USD/CAD', baseCurrency: 'USD', quoteCurrency: 'CAD', pipSize: 0.0001, contractSize: 100000, minLotSize: 0.01, maxLotSize: 100, lotStep: 0.01, pricePrecision: 5 },
  'NZD/USD': { symbol: 'NZD/USD', baseCurrency: 'NZD', quoteCurrency: 'USD', pipSize: 0.0001, contractSize: 100000, minLotSize: 0.01, maxLotSize: 100, lotStep: 0.01, pricePrecision: 5 },
}

const USD_PER_UNIT: Record<string, number> = {
  USD: 1,
  JPY: 1 / 149.85,
  CHF: 0.8842,
  CAD: 1 / 1.3625,
}

export const getConversionRate = (fromCurrency: string, toCurrency: string): number | undefined => {
  if (fromCurrency === toCurrency) return 1
  if (toCurrency === 'USD') return USD_PER_UNIT[fromCurrency]
  if (fromCurrency === 'USD') {
    const usdPerUnit = USD_PER_UNIT[toCurrency]
    return usdPerUnit && usdPerUnit > 0 ? 1 / usdPerUnit : undefined
  }
  return undefined
}
