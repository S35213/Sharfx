import type { ProviderAdapter, ProviderDescriptor } from './core/types'
import { providerRegistry } from './core/providerRegistry'
import { DERIV_PROVIDER_ADAPTER } from './deriv/adapter'
import { BINANCE_PROVIDER_ADAPTER } from './binance/adapter'
import { OANDA_PROVIDER_ADAPTER } from './oanda/adapter'
import { IBKR_PROVIDER_DESCRIPTOR } from './planned/ibkrDescriptor'

const descriptorAdapter = (descriptor: ProviderDescriptor): ProviderAdapter => ({ descriptor })

const adapters: ProviderAdapter[] = [
  DERIV_PROVIDER_ADAPTER,
  BINANCE_PROVIDER_ADAPTER,
  OANDA_PROVIDER_ADAPTER,
  descriptorAdapter(IBKR_PROVIDER_DESCRIPTOR),
]

for (const adapter of adapters) {
  if (!providerRegistry.has(adapter.descriptor.id)) providerRegistry.register(adapter)
}

export const providerCatalog = providerRegistry.list()
export { providerRegistry }
