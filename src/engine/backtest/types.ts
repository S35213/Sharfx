import type { OHLCV, SymbolSpec, TradeSide } from '../../types'

export interface BacktestSignal {
  side: TradeSide
  stopLoss: number
  takeProfit: number
  lotSize: number
}

export interface BacktestConfig {
  initialBalance: number
  accountCurrency: string
  symbolSpec: SymbolSpec
  conversionRate?: number
  startIndex?: number
  endIndex?: number
}

export interface BacktestTrade {
  id: string
  side: TradeSide
  entryTime: number
  exitTime: number
  entryPrice: number
  exitPrice: number
  stopLoss: number
  takeProfit: number
  lotSize: number
  profit: number
  outcome: 'win' | 'loss' | 'breakeven'
  exitReason: 'stop-loss' | 'take-profit' | 'end-of-test'
}

export interface BacktestResult {
  initialBalance: number
  finalBalance: number
  netProfit: number
  returnPercent: number
  totalTrades: number
  winningTrades: number
  losingTrades: number
  breakevenTrades: number
  winRate: number
  grossProfit: number
  grossLoss: number
  profitFactor: number | null
  maxDrawdown: number
  trades: BacktestTrade[]
}

export type BacktestSignalProvider = (history: OHLCV[], index: number) => BacktestSignal | null
