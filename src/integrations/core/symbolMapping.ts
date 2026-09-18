export interface ProviderSymbolMapping {
  providerId: string
  normalizedSymbol: string
  providerSymbol: string
  aliases?: string[]
}

export interface SymbolMappingResult {
  normalizedSymbol: string
  providerSymbol: string
  source: 'exact' | 'alias' | 'identity'
}

const normalize = (symbol: string): string => symbol.trim().replace(/\s+/g, '').replace('-', '/').toUpperCase()

export class SymbolMappingRegistry {
  private readonly mappings = new Map<string, ProviderSymbolMapping[]>()

  register(mapping: ProviderSymbolMapping): void {
    const providerId = mapping.providerId.trim()
    const normalizedSymbol = normalize(mapping.normalizedSymbol)
    const providerSymbol = mapping.providerSymbol.trim()
    if (!providerId || !normalizedSymbol || !providerSymbol) throw new Error('Provider symbol mapping requires providerId, normalizedSymbol and providerSymbol.')

    const list = this.mappings.get(providerId) || []
    const duplicate = list.find((item) => normalize(item.normalizedSymbol) === normalizedSymbol)
    if (duplicate) throw new Error('A normalized symbol mapping already exists for ' + providerId + ': ' + normalizedSymbol)

    list.push({ ...mapping, providerId, normalizedSymbol, providerSymbol, aliases: (mapping.aliases || []).map(normalize) })
    this.mappings.set(providerId, list)
  }

  mapToProvider(providerId: string, symbol: string): SymbolMappingResult | null {
    const normalized = normalize(symbol)
    const list = this.mappings.get(providerId) || []
    const exact = list.find((item) => normalize(item.normalizedSymbol) === normalized)
    if (exact) return { normalizedSymbol: exact.normalizedSymbol, providerSymbol: exact.providerSymbol, source: 'exact' }

    const alias = list.find((item) => item.aliases?.includes(normalized))
    if (alias) return { normalizedSymbol: alias.normalizedSymbol, providerSymbol: alias.providerSymbol, source: 'alias' }

    return null
  }

  mapFromProvider(providerId: string, providerSymbol: string): SymbolMappingResult | null {
    const raw = providerSymbol.trim().toUpperCase()
    const list = this.mappings.get(providerId) || []
    const found = list.find((item) => item.providerSymbol.toUpperCase() === raw)
    return found
      ? { normalizedSymbol: found.normalizedSymbol, providerSymbol: found.providerSymbol, source: 'exact' }
      : null
  }

  list(providerId?: string): ProviderSymbolMapping[] {
    const source = providerId ? this.mappings.get(providerId) || [] : [...this.mappings.values()].flat()
    return source.map((item) => ({ ...item, aliases: [...(item.aliases || [])] }))
  }
}

export const symbolMappingRegistry = new SymbolMappingRegistry()

symbolMappingRegistry.register({
  providerId: 'oanda',
  normalizedSymbol: 'EUR/USD',
  providerSymbol: 'EUR_USD',
  aliases: ['EURUSD'],
})

symbolMappingRegistry.register({
  providerId: 'oanda',
  normalizedSymbol: 'GBP/USD',
  providerSymbol: 'GBP_USD',
  aliases: ['GBPUSD'],
})

symbolMappingRegistry.register({
  providerId: 'oanda',
  normalizedSymbol: 'USD/JPY',
  providerSymbol: 'USD_JPY',
  aliases: ['USDJPY'],
})
