import type { SimulatedOrderDraft, TradeOrder } from '../../types'
import type { LiveBrokerTransport } from './liveBroker'

export interface HttpBrokerTransportOptions {
  baseUrl: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

class BrokerGatewayError extends Error {
  constructor(message: string, cause: unknown) {
    super(message)
    this.name = 'BrokerGatewayError'
    Object.defineProperty(this, 'cause', { configurable: true, enumerable: false, value: cause, writable: true })
  }
}

const assertBaseUrl = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('A broker gateway base URL is required.')
  const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
  const url = new URL(trimmed, origin)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Broker gateway base URL must use HTTP or HTTPS.')
  return url.toString().replace(/\/$/, '')
}

export class HttpBrokerTransport implements LiveBrokerTransport {
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number

  constructor(options: HttpBrokerTransportOptions) {
    this.baseUrl = assertBaseUrl(options.baseUrl)
    this.fetchImpl = options.fetchImpl ?? fetch
    if (!Number.isInteger(options.timeoutMs ?? 10_000) || (options.timeoutMs ?? 10_000) <= 0) {
      throw new Error('Broker gateway timeout must be a positive integer.')
    }
    this.timeoutMs = options.timeoutMs ?? 10_000
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: { Accept: 'application/json', ...init.headers },
        credentials: 'include',
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`Broker gateway request failed (${response.status}).`)
      return await response.json() as T
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BrokerGatewayError(`Broker gateway request timed out after ${this.timeoutMs}ms.`, error)
      }
      if (error instanceof BrokerGatewayError) throw error
      if (error instanceof Error) throw error
      throw new BrokerGatewayError('Broker gateway request failed.', error)
    } finally {
      clearTimeout(timer)
    }
  }

  async placeOrder(order: SimulatedOrderDraft): Promise<TradeOrder> {
    return this.request<TradeOrder>('/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order),
    })
  }

  async cancelOrder(orderId: string): Promise<void> {
    if (!orderId.trim()) throw new Error('Order id is required')
    await this.request<void>(`/orders/${encodeURIComponent(orderId)}`, { method: 'DELETE' })
  }

  async closePosition(orderId: string): Promise<void> {
    if (!orderId.trim()) throw new Error('Order id is required')
    await this.request<void>(`/positions/${encodeURIComponent(orderId)}/close`, { method: 'POST' })
  }
}
