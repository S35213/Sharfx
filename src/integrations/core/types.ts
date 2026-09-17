export type ProviderKind = 'broker' | 'exchange' | 'custodian' | 'other'
export type ProviderStatus = 'available' | 'planned' | 'unconfigured'
export type ProviderAuthMethod = 'oauth2' | 'api_key' | 'pat' | 'custom'
export type FundingMode = 'api' | 'redirect' | 'manual' | 'unsupported'
export type QuantityUnit = 'base' | 'contracts' | 'units'
export type ProviderOrderType = 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT'
export type TimeInForce = 'GTC' | 'IOC' | 'FOK' | 'DAY'

export interface ProviderFundingCapabilities {
  deposit: FundingMode
  withdrawal: FundingMode
}

export interface ProviderCapabilities {
  accountRead: boolean
  marketData: boolean
  historicalCandles: boolean
  realtimeMarketData: boolean
  realtimeAccountData: boolean
  positionsRead: boolean
  ordersRead: boolean
  orderPlacement: boolean
  orderCancellation: boolean
  positionClose: boolean
  multipleAccounts: boolean
  demoAccounts: boolean
  symbolMetadata: boolean
  funding: ProviderFundingCapabilities
}

export interface ProviderDescriptor {
  id: string
  name: string
  kind: ProviderKind
  status: ProviderStatus
  authMethods: ProviderAuthMethod[]
  description: string
  capabilities: ProviderCapabilities
}

export interface ProviderConnection {
  providerId: string
  connectionId: string
  accountId?: string
  accountLabel?: string
  environment: 'demo' | 'live'
  connectedAt: string
  expiresAt?: string
}

export interface ProviderAccountSnapshot {
  accountId: string
  accountLabel?: string
  environment: 'demo' | 'live'
  currency: string
  balance: number
  equity?: number
  usedMargin?: number
  freeMargin?: number
  floatingPL?: number
}

export interface ProviderPosition {
  id: string
  symbol: string
  side: 'BUY' | 'SELL'
  quantity: number
  entryPrice: number
  currentPrice?: number
  stopLoss?: number | null
  takeProfit?: number | null
  unrealizedPL?: number
  currency?: string
}

export interface ProviderOrderRequest {
  symbol: string
  side: 'BUY' | 'SELL'
  quantity: number
  quantityUnit: QuantityUnit
  type: ProviderOrderType
  limitPrice?: number
  stopPrice?: number
  stopLoss?: number
  takeProfit?: number
  timeInForce?: TimeInForce
  clientOrderId?: string
}

export interface ProviderOrderResult {
  providerOrderId: string
  status: 'accepted' | 'rejected' | 'filled' | 'pending' | 'cancelled'
  message?: string
  raw?: unknown
}

export interface ProviderFundingInstruction {
  mode: FundingMode
  providerUrl?: string
  reference?: string
  message?: string
  metadata?: Record<string, string>
}

export interface ProviderAdapter {
  readonly descriptor: ProviderDescriptor
  getAuthUrl?(returnTo?: string): Promise<string>
  disconnect?(connection: ProviderConnection): Promise<void>
  getAccounts?(connection: ProviderConnection): Promise<ProviderAccountSnapshot[]>
  getAccountSnapshot?(connection: ProviderConnection, accountId: string): Promise<ProviderAccountSnapshot>
  getPositions?(connection: ProviderConnection, accountId: string): Promise<ProviderPosition[]>
  getOrders?(connection: ProviderConnection, accountId: string): Promise<ProviderOrderResult[]>
  placeOrder?(connection: ProviderConnection, accountId: string, order: ProviderOrderRequest): Promise<ProviderOrderResult>
  cancelOrder?(connection: ProviderConnection, accountId: string, providerOrderId: string): Promise<ProviderOrderResult>
  closePosition?(connection: ProviderConnection, accountId: string, positionId: string): Promise<ProviderOrderResult>
  getDepositInstructions?(connection: ProviderConnection, accountId: string): Promise<ProviderFundingInstruction>
  getWithdrawalInstructions?(connection: ProviderConnection, accountId: string): Promise<ProviderFundingInstruction>
}
