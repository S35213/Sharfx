import type { SimulatedOrderDraft, TradeOrder } from '../../types'
import type { BrokerAdapter, BrokerCapabilities } from './types'

export interface LiveBrokerTransport {
  placeOrder(order: SimulatedOrderDraft): Promise<TradeOrder>
  cancelOrder(orderId: string): Promise<void>
  closePosition(orderId: string): Promise<void>
}

export class LiveBroker implements BrokerAdapter {
  constructor(private readonly transport?: LiveBrokerTransport) {}

  getCapabilities(): BrokerCapabilities {
    return {
      environment: 'LIVE',
      canPlaceOrders: this.transport !== undefined,
      canCancelOrders: this.transport !== undefined,
      canClosePositions: this.transport !== undefined,
      supportsStreamingPrices: false,
    }
  }

  private requireTransport(): LiveBrokerTransport {
    if (!this.transport) throw new Error('Live broker execution is not configured. SHAFX remains in safe mode.')
    return this.transport
  }

  async placeOrder(order: SimulatedOrderDraft): Promise<TradeOrder> {
    return this.requireTransport().placeOrder(order)
  }

  async cancelOrder(orderId: string): Promise<void> {
    if (!orderId.trim()) throw new Error('Order id is required')
    await this.requireTransport().cancelOrder(orderId)
  }

  async closePosition(orderId: string): Promise<void> {
    if (!orderId.trim()) throw new Error('Order id is required')
    await this.requireTransport().closePosition(orderId)
  }
}

export const liveBroker = new LiveBroker()
