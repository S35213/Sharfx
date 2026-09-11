import type { TradeOrder } from '../../types'

export const mockOpenPositions: TradeOrder[] = [{ id: 'SIM-000001', symbol: 'EUR/USD', type: 'BUY', lotSize: 0.1, entryPrice: 1.084, stopLoss: 1.081, takeProfit: 1.0915, riskPercent: 1, riskAmount: 30, rewardAmount: 75, riskRewardRatio: 2.5, status: 'open', openTime: '2024-01-15T10:30:00Z', profit: 14.2 }]
export const mockPendingOrders: TradeOrder[] = [{ id: 'SIM-000002', symbol: 'GBP/USD', type: 'SELL', lotSize: 0.05, entryPrice: 1.265, stopLoss: 1.268, takeProfit: 1.259, riskPercent: 0.5, riskAmount: 15, rewardAmount: 30, riskRewardRatio: 2, status: 'pending', openTime: '2024-01-15T14:00:00Z' }]
export const mockTradeHistory: TradeOrder[] = [{ id: 'SIM-000000', symbol: 'USD/JPY', type: 'BUY', lotSize: 0.1, entryPrice: 149.5, stopLoss: 149.2, takeProfit: 150.1, riskPercent: 1, riskAmount: 20, rewardAmount: 40, riskRewardRatio: 2, status: 'closed', openTime: '2024-01-14T08:00:00Z', closeTime: '2024-01-14T16:00:00Z', profit: 40 }]
