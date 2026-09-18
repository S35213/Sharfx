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

export interface FixSessionSettings {
  host: string
  port: number
  senderCompId: string
  targetCompId: string
  beginString?: string
  heartbeatSeconds?: number
}

export interface FixGatewayContract {
  connect(settings: FixSessionSettings): Promise<{ sessionId: string }>
  send(message: string): Promise<void>
  disconnect(sessionId: string): Promise<void>
  health(sessionId: string): Promise<{ ok: boolean; message?: string }>
}

export interface CustomProviderGateway {
  providerId: string
  connect(input: Record<string, unknown>): Promise<{ connectionId: string; metadata?: Record<string, unknown> }>
  disconnect(connectionId: string): Promise<void>
  request<T = unknown>(connectionId: string, operation: string, payload?: Record<string, unknown>): Promise<T>
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
  subscribe: async (_connection, _accountId, symbols, onEvent) => subscribe(symbols, onEvent),
})