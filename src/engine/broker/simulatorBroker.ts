import type { SimulatedOrderDraft, TradeOrder } from '../../types'
import type { BrokerAdapter, BrokerCapabilities } from './types'

export class SimulatorBroker implements BrokerAdapter {
  getCapabilities(): BrokerCapabilities {
    return {
      environment: 'SIMULATOR',
      canPlaceOrders: true,
      canCancelOrders: true,
      canClosePositions: true,
      supportsStreamingPrices: false,
    }
  }

  async placeOrder(order: SimulatedOrderDraft): Promise<TradeOrder> {
    return {
      ...order,
      id: `sim-${order.symbol}-${order.openTime}`,
      status: order.type === 'MARKET' ? 'open' : 'pending',
    }
  }

  async cancelOrder(orderId: string): Promise<void> {
    if (!orderId.trim()) throw new Error('Order id is required')
  }

  async closePosition(orderId: string): Promise<void> {
    if (!orderId.trim()) throw new Error('Order id is required')
  }
}

export const simulatorBroker = new SimulatorBroker()
