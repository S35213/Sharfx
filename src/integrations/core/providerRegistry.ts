import type { ProviderAdapter, ProviderCapabilities, ProviderDescriptor, ProviderFundingInstruction } from './types'

export const DEFAULT_PROVIDER_CAPABILITIES: ProviderCapabilities = {
  accountRead: false,
  marketData: false,
  historicalCandles: false,
  realtimeMarketData: false,
  realtimeAccountData: false,
  positionsRead: false,
  ordersRead: false,
  orderPlacement: false,
  orderCancellation: false,
  orderModification: false,
  orderLookupByClientOrderId: false,
  positionClose: false,
  multipleAccounts: false,
  demoAccounts: false,
  symbolMetadata: false,
  funding: {
    deposit: 'unsupported',
    withdrawal: 'unsupported',
  },
}

const cloneCapabilities = (capabilities: ProviderCapabilities): ProviderCapabilities => ({
  ...capabilities,
  funding: { ...capabilities.funding },
})

const cloneDescriptor = (descriptor: ProviderDescriptor): ProviderDescriptor => ({
  ...descriptor,
  authMethods: [...descriptor.authMethods],
  capabilities: cloneCapabilities(descriptor.capabilities),
  rateLimit: descriptor.rateLimit ? { ...descriptor.rateLimit } : undefined,
})

export class ProviderRegistry {
  private readonly adapters = new Map<string, ProviderAdapter>()

  register(adapter: ProviderAdapter): void {
    const id = adapter.descriptor.id.trim()
    if (!id) throw new Error('Provider id is required.')
    if (this.adapters.has(id)) throw new Error(`Provider already registered: ${id}`)
    this.adapters.set(id, adapter)
  }

  has(providerId: string): boolean {
    return this.adapters.has(providerId)
  }

  get(providerId: string): ProviderAdapter {
    const adapter = this.adapters.get(providerId)
    if (!adapter) throw new Error(`Unsupported provider: ${providerId}`)
    return adapter
  }

  list(): ProviderDescriptor[] {
    return [...this.adapters.values()].map((adapter) => cloneDescriptor(adapter.descriptor))
  }
}

export const supportsOrderPlacement = (descriptor: ProviderDescriptor): boolean => descriptor.capabilities.orderPlacement
export const supportsDeposit = (descriptor: ProviderDescriptor): boolean => descriptor.capabilities.funding.deposit !== 'unsupported'
export const supportsWithdrawal = (descriptor: ProviderDescriptor): boolean => descriptor.capabilities.funding.withdrawal !== 'unsupported'

export const unavailableFundingInstruction = (message: string): ProviderFundingInstruction => ({
  mode: 'unsupported',
  message,
})

export const providerRegistry = new ProviderRegistry()
