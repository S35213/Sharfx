import type { SimulatedOrderDraft, TradeOrder } from '../../types'

export type ExecutionEnvironment = 'SIMULATOR' | 'LIVE'

export interface BrokerCapabilities {
  environment: ExecutionEnvironment
  canPlaceOrders: boolean
  canCancelOrders: boolean
  canClosePositions: boolean
  supportsStreamingPrices: boolean
}

export interface BrokerAdapter {
  getCapabilities(): BrokerCapabilities
  placeOrder(order: SimulatedOrderDraft): Promise<TradeOrder>
  cancelOrder(orderId: string): Promise<void>
  closePosition(orderId: string): Promise<void>
}
