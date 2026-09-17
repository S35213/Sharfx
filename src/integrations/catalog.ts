import type { ProviderAdapter, ProviderDescriptor } from './core/types'
import { providerRegistry } from './core/providerRegistry'
import { DERIV_PROVIDER_DESCRIPTOR } from './deriv/descriptor'
import { SIMULATOR_PROVIDER_DESCRIPTOR } from './simulator/descriptor'
import { BINANCE_PROVIDER_DESCRIPTOR } from './planned/binanceDescriptor'
import { OANDA_PROVIDER_DESCRIPTOR } from './planned/oandaDescriptor'
import { IBKR_PROVIDER_DESCRIPTOR } from './planned/ibkrDescriptor'

const descriptorAdapter = (descriptor: ProviderDescriptor): ProviderAdapter => ({ descriptor })

const descriptors = [
  SIMULATOR_PROVIDER_DESCRIPTOR,
  DERIV_PROVIDER_DESCRIPTOR,
  BINANCE_PROVIDER_DESCRIPTOR,
  OANDA_PROVIDER_DESCRIPTOR,
  IBKR_PROVIDER_DESCRIPTOR,
] as const

for (const descriptor of descriptors) {
  if (!providerRegistry.has(descriptor.id)) providerRegistry.register(descriptorAdapter(descriptor))
}

export const providerCatalog = providerRegistry.list()
export { providerRegistry }
