export type ProviderKind = 'broker' | 'exchange' | 'custodian' | 'other'
export type ProviderStatus = 'available' | 'planned' | 'unconfigured'
export type ProviderAuthMethod = 'oauth2' | 'api_key' | 'pat' | 'custom'
export type FundingMode = 'api' | 'redirect' | 'manual' | 'unsupported'
export type QuantityUnit = 'base' | 'contracts' | 'units'
export type ProviderOrderType = 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT'
export type TimeInForce = 'GTC' | 'IOC' | 'FOK' | 'DAY'
export type OrderSide = 'BUY' | 'SELL'
export type ProviderConnectionState = 'connected' | 'expired' | 'disconnected' | 'error'
export type ProviderExecutionMode = 'simulated' | 'external'

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
  orderModification: boolean
  orderLookupByClientOrderId: boolean
  positionClose: boolean
  multipleAccounts: boolean
  demoAccounts: boolean
  symbolMetadata: boolean
  funding: ProviderFundingCapabilities
}

export interface ProviderCredentialField {
  key: string
  label: string
  type: 'secret' | 'text' | 'select'
  required: boolean
  options?: Array<{ value: string; label: string }>
}

export interface ProviderDescriptor {
  id: string
  name: string
  kind: ProviderKind
  status: ProviderStatus
  executionMode: ProviderExecutionMode
  authMethods: ProviderAuthMethod[]
  description: string
  capabilities: ProviderCapabilities
  credentialFields?: ProviderCredentialField[]
  rateLimit?: {
    requestsPerSecond: number
    scope: 'connection' | 'provider'
  }
}

export interface ProviderConnection {
  providerId: string
  connectionId: string
  accountId?: string
  accountLabel?: string
  environment: 'demo' | 'live'
  state?: ProviderConnectionState
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
  side: OrderSide
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
  side: OrderSide
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
  clientOrderId?: string
  symbol?: string
  side?: OrderSide
  quantity?: number
  timestamp?: string
  message?: string
  raw?: unknown
}

export interface ProviderInstrument {
  symbol: string
  providerSymbol: string
  displayName?: string
  assetClass?: string
  baseCurrency?: string
  quoteCurrency?: string
  contractSize?: number
  pipSize?: number
  priceIncrement?: number
  quantityMin?: number
  quantityMax?: number
  quantityStep?: number
  supportedOrderTypes?: ProviderOrderType[]
  supportedTimeInForce?: TimeInForce[]
  tradable: boolean
  metadata?: Record<string, string>
}

export interface ProviderQuote {
  symbol: string
  bid?: number
  ask?: number
  last?: number
  timestamp: string
}

export interface ProviderCandle {
  symbol: string
  timeframe: string
  openTime: string
  closeTime?: string
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export interface ProviderMarketSnapshot {
  symbol: string
  timeframe: string
  candles: ProviderCandle[]
  quote: ProviderQuote
}

export interface ProviderFundingInstruction {
  mode: FundingMode
  providerUrl?: string
  reference?: string
  message?: string
  metadata?: Record<string, string>
}

export type ProviderStreamEvent =
  | { type: 'quote'; quote: ProviderQuote }
  | { type: 'market_snapshot'; snapshot: ProviderMarketSnapshot }
  | { type: 'account'; account: ProviderAccountSnapshot }
  | { type: 'position'; position: ProviderPosition }
  | { type: 'order'; order: ProviderOrderResult }
  | { type: 'error'; error: ProviderNormalizedError }

export interface ProviderStreamHandle {
  streamId: string
  close: () => Promise<void>
}

export type ProviderErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_EXPIRED'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'INVALID_REQUEST'
  | 'UNSUPPORTED'
  | 'STALE_DATA'
  | 'PROVIDER_REJECTED'
  | 'UNKNOWN'

export interface ProviderNormalizedError {
  code: ProviderErrorCode
  message: string
  retryable: boolean
  providerCode?: string
  requestId?: string
}

export interface ProviderAdapter {
  readonly descriptor: ProviderDescriptor
  getAuthUrl?(returnTo?: string): Promise<string>
  disconnect?(connection: ProviderConnection): Promise<void>
  getAccounts?(connection: ProviderConnection): Promise<ProviderAccountSnapshot[]>
  getAccountSnapshot?(connection: ProviderConnection, accountId: string): Promise<ProviderAccountSnapshot>
  getPositions?(connection: ProviderConnection, accountId: string): Promise<ProviderPosition[]>
  getOrders?(connection: ProviderConnection, accountId: string): Promise<ProviderOrderResult[]>
  getOrderByClientOrderId?(connection: ProviderConnection, accountId: string, clientOrderId: string): Promise<ProviderOrderResult | null>
  getInstruments?(connection: ProviderConnection, accountId?: string): Promise<ProviderInstrument[]>
  getQuote?(connection: ProviderConnection, accountId: string | undefined, symbol: string): Promise<ProviderQuote>
  getHistoricalCandles?(connection: ProviderConnection, accountId: string | undefined, symbol: string, timeframe: string, limit?: number): Promise<ProviderCandle[]>
  subscribe?(connection: ProviderConnection, accountId: string | undefined, symbols: string[], onEvent: (event: ProviderStreamEvent) => void, timeframe?: string): Promise<ProviderStreamHandle>
  subscribeAccount?(connection: ProviderConnection, accountId: string | undefined, onEvent: (event: ProviderStreamEvent) => void): Promise<ProviderStreamHandle>
  placeOrder?(connection: ProviderConnection, accountId: string, order: ProviderOrderRequest): Promise<ProviderOrderResult>
  cancelOrder?(connection: ProviderConnection, accountId: string, providerOrderId: string): Promise<ProviderOrderResult>
  modifyOrder?(connection: ProviderConnection, accountId: string, providerOrderId: string, order: Partial<ProviderOrderRequest>): Promise<ProviderOrderResult>
  closePosition?(connection: ProviderConnection, accountId: string, positionId: string): Promise<ProviderOrderResult>
  getDepositInstructions?(connection: ProviderConnection, accountId: string): Promise<ProviderFundingInstruction>
  getWithdrawalInstructions?(connection: ProviderConnection, accountId: string): Promise<ProviderFundingInstruction>
}
