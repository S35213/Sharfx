import type { ProviderAdapter, ProviderDescriptor, ProviderStreamHandle, ProviderStreamEvent } from './types'

export interface ProviderRestTransport {
  request<T>(input: { method?: string; path: string; query?: Record<string, string>; body?: unknown }): Promise<T>
}

export interface ProviderWebSocketTransport {
  subscribe(
    symbols: string[],
    onEvent: (event: ProviderStreamEvent) => void,
  ): Promise<ProviderStreamHandle>
}

export interface ProviderGatewayContract {
  providerId: string
  connect(input: Record<string, unknown>): Promise<Record<string, unknown>>
  disconnect(connectionId: string): Promise<void>
  health(connectionId: string): Promise<{ ok: boolean; message?: string }>
}

export interface ConfigurableRestProvider {
  descriptor: ProviderDescriptor
  rest: ProviderRestTransport
}

export const createRestProviderAdapter = (
  descriptor: ProviderDescriptor,
  methods: Omit<ProviderAdapter, 'descriptor'>,
): ProviderAdapter => ({ descriptor, ...methods })

export const createWebSocketProviderAdapter = (
  descriptor: ProviderDescriptor,
  subscribe: ProviderWebSocketTransport['subscribe'],
  methods: Omit<ProviderAdapter, 'descriptor' | 'subscribe'> = {},
): ProviderAdapter => ({
  descriptor,
  ...methods,
  subscribe,
})