export interface DerivAccountSnapshot {
  balance: number
  currency: string
  accountId: string
  accountType: string
  equity?: number
  usedMargin?: number
  freeMargin?: number
  floatingPL?: number
}

interface StreamOptions {
  connectionId?: string
  accountId?: string
  accountType?: 'real' | 'demo'
  onSnapshot: (snapshot: DerivAccountSnapshot) => void
  onEvent?: (event: import('../core/types').ProviderStreamEvent) => void
  onStatus?: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void
}

interface DerivContract {
  contract_id?: string | number
  transaction_id?: string | number
  contract_type?: string
  currency?: string
  underlying_symbol?: string
  symbol?: string
  buy_price?: string | number
  sell_price?: string | number
  bid_price?: string | number
  current_spot?: string | number
  start_spot?: string | number
  profit?: string | number
  multiplier?: string | number
  stake?: string | number
  payout?: string | number
  purchase_time?: number
  sell_time?: number
  is_sold?: number | boolean
  status?: string
  stop_loss?: string | number
  take_profit?: string | number
}

interface DerivMessage {
  msg_type?: string
  balance?: { balance?: number; currency?: string }
  portfolio?: { contract_list?: DerivContract[]; contracts?: DerivContract[] }
  proposal_open_contract?: DerivContract
  profit_table?: { count?: number | string; transactions?: Array<Record<string, unknown>> }
  transaction?: Record<string, unknown>
}

const toNumber = (value: unknown): number | undefined => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

export interface DerivedMultiplierAccountMetrics {
  balance: number
  equity: number
  usedMargin: number
  freeMargin: number
  floatingPL: number
}

/**
 * Deriv Multipliers do not expose MT5 CFD margin fields through the account
 * balance API. SHAFX therefore derives an MT5-style account view from the
 * authoritative balance plus the current open-contract profit and stake.
 *
 * The "used margin" figure is the stake currently committed to open
 * multiplier contracts; it is not a broker-reported MT5 margin requirement.
 */
export const deriveMultiplierAccountMetrics = (
  balance: number,
  openContracts: DerivContract[],
): DerivedMultiplierAccountMetrics => {
  const safeBalance = Number.isFinite(balance) ? balance : 0
  const floatingPL = openContracts.reduce((sum, contract) => sum + (toNumber(contract.profit) ?? 0), 0)
  const usedMargin = openContracts.reduce((sum, contract) => sum + (toNumber(contract.stake ?? contract.buy_price) ?? 0), 0)
  const equity = safeBalance + floatingPL
  const freeMargin = Math.max(0, equity - usedMargin)
  return { balance: safeBalance, equity, usedMargin, freeMargin, floatingPL }
}

export const normalizeDerivSymbol = (value: unknown): string => {
  const raw = String(value || '').trim()
  if (/^frx[a-z0-9]{6}$/i.test(raw)) {
    const pair = raw.slice(3).toUpperCase()
    return pair.slice(0, 3) + '/' + pair.slice(3)
  }
  return raw
}

const contractIsClosed = (contract: DerivContract): boolean =>
  Boolean(contract.is_sold === true || Number(contract.is_sold) === 1 || ['sold', 'closed'].includes(String(contract.status || '').toLowerCase()))

const contractSide = (contract: DerivContract): import('../core/types').OrderSide =>
  String(contract.contract_type || '').toUpperCase() === 'MULTDOWN' ? 'SELL' : 'BUY'

const emitOpenContract = (
  contract: DerivContract,
  emit: (event: import('../core/types').ProviderStreamEvent) => void,
): void => {
  const id = String(contract.contract_id ?? '')
  if (!id) return
  const stake = toNumber(contract.stake ?? contract.buy_price) ?? 0
  const multiplier = toNumber(contract.multiplier)
  const entryPrice = toNumber(contract.start_spot ?? contract.current_spot ?? contract.buy_price) ?? 0
  const currentPrice = toNumber(contract.current_spot)
  const profit = toNumber(contract.profit) ?? 0
  const symbol = normalizeDerivSymbol(contract.underlying_symbol ?? contract.symbol)
  if (!symbol) return

  emit({
    type: 'position',
    position: {
      id,
      symbol,
      side: contractSide(contract),
      quantity: stake,
      entryPrice,
      currentPrice,
      unrealizedPL: profit,
      currency: typeof contract.currency === 'string' ? contract.currency : undefined,
      metadata: {
        stake,
        multiplier,
        contractType: contract.contract_type,
        purchaseTime: contract.purchase_time,
        raw: contract,
      },
    },
  })
}

const emitClosedContract = (
  contract: DerivContract,
  emit: (event: import('../core/types').ProviderStreamEvent) => void,
): void => {
  const id = String(contract.contract_id ?? contract.transaction_id ?? '')
  if (!id) return
  const buyPrice = toNumber(contract.buy_price) ?? 0
  const sellPrice = toNumber(contract.sell_price ?? contract.bid_price ?? contract.payout)
  const profit = toNumber(contract.profit ?? (sellPrice !== undefined ? sellPrice - buyPrice : undefined))
  emit({
    type: 'order',
    order: {
      providerOrderId: id,
      status: 'filled',
      symbol: normalizeDerivSymbol(contract.underlying_symbol ?? contract.symbol) || undefined,
      side: contractSide(contract),
      quantity: toNumber(contract.stake ?? buyPrice),
      timestamp: typeof contract.sell_time === 'number'
        ? new Date(contract.sell_time * 1000).toISOString()
        : new Date().toISOString(),
      message: 'Deriv contract closed.',
      raw: {
        closed: true,
        contractId: id,
        buyPrice,
        sellPrice,
        profit,
        multiplier: toNumber(contract.multiplier),
        stake: toNumber(contract.stake ?? buyPrice),
        currency: contract.currency,
        purchaseTime: contract.purchase_time,
        sellTime: contract.sell_time,
        source: 'deriv_account_stream',
      },
    },
  })
}

const emitProfitTransaction = (
  transaction: Record<string, unknown>,
  emit: (event: import('../core/types').ProviderStreamEvent) => void,
): void => {
  const contractId = String(transaction.contract_id ?? transaction.transaction_id ?? '')
  if (!contractId) return
  emitClosedContract({
    contract_id: contractId,
    contract_type: typeof transaction.contract_type === 'string' ? transaction.contract_type : undefined,
    currency: typeof transaction.currency === 'string' ? transaction.currency : undefined,
    underlying_symbol: typeof transaction.underlying_symbol === 'string' ? transaction.underlying_symbol : undefined,
    symbol: typeof transaction.symbol === 'string' ? transaction.symbol : undefined,
    buy_price: transaction.buy_price as string | number | undefined,
    sell_price: transaction.sell_price as string | number | undefined,
    payout: transaction.payout as string | number | undefined,
    profit: transaction.profit as string | number | undefined,
    multiplier: transaction.multiplier as string | number | undefined,
    stake: transaction.stake as string | number | undefined,
    purchase_time: toNumber(transaction.purchase_time),
    sell_time: toNumber(transaction.sell_time),
  }, emit)
}

export class DerivAccountStreamTransport {
  private socket: WebSocket | null = null
  private reconnectTimer: number | null = null
  private stopped = false
  private reconnectAttempt = 0
  private subscribedContracts = new Set<string>()
  private openContracts = new Map<string, DerivContract>()
  private profitHistoryOffset = 0
  private lastBalance: number | null = null
  private lastCurrency = 'USD'
  private lastAccountId = ''
  private lastAccountType = 'real'

  constructor(private readonly options: StreamOptions) {}

  async start(): Promise<void> {
    this.stopped = false
    await this.connect()
  }

  stop(): void {
    this.stopped = true
    if (this.reconnectTimer !== null) globalThis.clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.socket?.close()
    this.socket = null
    this.subscribedContracts.clear()
    this.openContracts.clear()
    this.profitHistoryOffset = 0
    this.lastBalance = null
    this.options.onStatus?.('disconnected')
  }

  private requestOpenContracts(socket: WebSocket, contracts: DerivContract[]): void {
    for (const contract of contracts) {
      const id = String(contract.contract_id ?? '')
      if (!id || this.subscribedContracts.has(id)) continue
      this.subscribedContracts.add(id)
      socket.send(JSON.stringify({
        proposal_open_contract: 1,
        contract_id: Number(id),
        subscribe: 1,
        req_id: 1000 + this.subscribedContracts.size,
      }))
    }
  }

  private requestProfitTable(socket: WebSocket, offset: number): void {
    this.profitHistoryOffset = offset
    socket.send(JSON.stringify({
      profit_table: 1,
      limit: 500,
      offset,
      sort: 'DESC',
      req_id: 4000 + Math.floor(offset / 500),
    }))
  }

  private sendPortfolioAndHistory(socket: WebSocket): void {
    this.profitHistoryOffset = 0
    socket.send(JSON.stringify({ portfolio: 1, req_id: 3 }))
    this.requestProfitTable(socket, 0)
  }

  private emitEvent(event: import('../core/types').ProviderStreamEvent): void {
    this.options.onEvent?.(event)
  }

  private emitAccountMetrics(): void {
    if (this.lastBalance === null) return
    const metrics = deriveMultiplierAccountMetrics(this.lastBalance, [...this.openContracts.values()])
    this.options.onSnapshot({
      balance: metrics.balance,
      currency: this.lastCurrency,
      accountId: this.lastAccountId,
      accountType: this.lastAccountType,
      equity: metrics.equity,
      usedMargin: metrics.usedMargin,
      freeMargin: metrics.freeMargin,
      floatingPL: metrics.floatingPL,
    })
  }

  private async connect(): Promise<void> {
    if (this.stopped) return
    this.options.onStatus?.('connecting')
    try {
      const accountType = this.options.accountType ?? 'real'
      const query = new URLSearchParams({ accountType })
      if (this.options.connectionId) query.set('connectionId', this.options.connectionId)
      if (this.options.accountId) query.set('accountId', this.options.accountId)

      const response = await fetch('/api/deriv/stream?' + query.toString(), {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({})) as {
        wsUrl?: unknown
        account?: { id?: unknown; type?: unknown }
        error?: unknown
      }
      if (!response.ok || typeof data.wsUrl !== 'string' || !data.wsUrl) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Unable to obtain Deriv account stream')
      }

      this.subscribedContracts.clear()
      this.openContracts.clear()
      this.lastBalance = null
      this.lastCurrency = 'USD'
      this.lastAccountId = typeof data.account?.id === 'string' ? data.account.id : ''
      this.lastAccountType = typeof data.account?.type === 'string' ? data.account.type : accountType
      const socket = new WebSocket(data.wsUrl)
      this.socket = socket

      socket.onopen = () => {
        this.reconnectAttempt = 0
        this.options.onStatus?.('connected')
        socket.send(JSON.stringify({ balance: 1, subscribe: 1, req_id: 1 }))
        socket.send(JSON.stringify({ transaction: 1, subscribe: 1, req_id: 2 }))
        this.sendPortfolioAndHistory(socket)
      }

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as DerivMessage
          const balance = message.balance?.balance
          const currency = message.balance?.currency

          if (message.msg_type === 'balance' && typeof balance === 'number' && Number.isFinite(balance) && typeof currency === 'string' && currency.length > 0) {
            this.lastBalance = balance
            this.lastCurrency = currency
            this.emitAccountMetrics()
          }

          if (message.msg_type === 'portfolio') {
            const contracts = message.portfolio?.contract_list || message.portfolio?.contracts || []
            this.openContracts.clear()
            this.requestOpenContracts(socket, contracts)
            contracts.forEach((contract) => {
              const id = String(contract.contract_id ?? '')
              if (contractIsClosed(contract)) {
                if (id) this.openContracts.delete(id)
                emitClosedContract(contract, (event) => this.emitEvent(event))
              } else {
                if (id) this.openContracts.set(id, contract)
                emitOpenContract(contract, (event) => this.emitEvent(event))
              }
            })
            this.emitAccountMetrics()
          }

          if (message.msg_type === 'proposal_open_contract' && message.proposal_open_contract) {
            const contract = message.proposal_open_contract
            const id = String(contract.contract_id ?? '')
            if (contractIsClosed(contract)) {
              if (id) this.openContracts.delete(id)
              emitClosedContract(contract, (event) => this.emitEvent(event))
            } else {
              if (id) this.openContracts.set(id, contract)
              emitOpenContract(contract, (event) => this.emitEvent(event))
            }
            this.emitAccountMetrics()
          }

          if (message.msg_type === 'profit_table') {
            const transactions = message.profit_table?.transactions || []
            transactions.forEach((transaction) => emitProfitTransaction(transaction, (event) => this.emitEvent(event)))
            const total = Number(message.profit_table?.count)
            const nextOffset = this.profitHistoryOffset + transactions.length
            if (Number.isFinite(total) && total > nextOffset && transactions.length > 0) {
              this.requestProfitTable(socket, nextOffset)
            } else {
              this.profitHistoryOffset = 0
            }
          }

          if (message.msg_type === 'transaction') {
            const transaction = message.transaction || {}
            const action = String(transaction.action || '').toLowerCase()
            if (action === 'buy' || action === 'sell' || action === 'contract') {
              this.sendPortfolioAndHistory(socket)
            }
          }
        } catch {
          this.options.onStatus?.('error')
        }
      }

      socket.onerror = () => this.options.onStatus?.('error')
      socket.onclose = () => {
        this.socket = null
        this.subscribedContracts.clear()
        if (!this.stopped) {
          this.options.onStatus?.('disconnected')
          this.scheduleReconnect()
        }
      }
    } catch {
      this.options.onStatus?.('error')
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer !== null) return
    const delay = Math.min(30000, 1000 * (2 ** Math.min(this.reconnectAttempt, 5)))
    this.reconnectAttempt += 1
    this.reconnectTimer = globalThis.setTimeout(() => {
      this.reconnectTimer = null
      void this.connect()
    }, delay)
  }
}
