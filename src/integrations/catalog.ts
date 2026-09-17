import type { ProviderAdapter, ProviderDescriptor } from './core/types'
import { providerRegistry } from './core/providerRegistry'
import { DERIV_PROVIDER_ADAPTER } from './deriv/adapter'
import { SIMULATOR_PROVIDER_DESCRIPTOR } from './simulator/descriptor'
import { BINANCE_PROVIDER_DESCRIPTOR } from './planned/binanceDescriptor'
import { OANDA_PROVIDER_DESCRIPTOR } from './planned/oandaDescriptor'
import { IBKR_PROVIDER_DESCRIPTOR } from './planned/ibkrDescriptor'

const descriptorAdapter = (descriptor: ProviderDescriptor): ProviderAdapter => ({ descriptor })

const adapters: ProviderAdapter[] = [
  DERIV_PROVIDER_ADAPTER,
  descriptorAdapter(SIMULATOR_PROVIDER_DESCRIPTOR),
  descriptorAdapter(BINANCE_PROVIDER_DESCRIPTOR),
  descriptorAdapter(OANDA_PROVIDER_DESCRIPTOR),
  descriptorAdapter(IBKR_PROVIDER_DESCRIPTOR),
]

for (const adapter of adapters) {
  if (!providerRegistry.has(adapter.descriptor.id)) providerRegistry.register(adapter)
}

export const providerCatalog = providerRegistry.list()
export { providerRegistry }
