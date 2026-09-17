export interface DerivAccountSnapshot {
  balance: number
  currency: string
  accountId: string
  accountType: string
}

interface StreamOptions {
  accountType?: 'real' | 'demo'
  onSnapshot: (snapshot: DerivAccountSnapshot) => void
  onStatus?: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void
}

interface DerivMessage {
  msg_type?: string
  balance?: { balance?: number; currency?: string }
}

export class DerivAccountStreamTransport {
  private socket: WebSocket | null = null
  private reconnectTimer: number | null = null
  private stopped = false
  private reconnectAttempt = 0

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
    this.options.onStatus?.('disconnected')
  }

  private async connect(): Promise<void> {
    if (this.stopped) return
    this.options.onStatus?.('connecting')
    try {
      const accountType = this.options.accountType ?? 'real'
      const response = await fetch(`/api/deriv/stream?accountType=${accountType}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({})) as { wsUrl?: unknown; account?: { id?: unknown; type?: unknown }; error?: unknown }
      if (!response.ok || typeof data.wsUrl !== 'string' || !data.wsUrl) throw new Error(typeof data.error === 'string' ? data.error : 'Unable to obtain Deriv account stream')

      const socket = new WebSocket(data.wsUrl)
      this.socket = socket
      socket.onopen = () => {
        this.reconnectAttempt = 0
        this.options.onStatus?.('connected')
        socket.send(JSON.stringify({ balance: 1, subscribe: 1, req_id: 1 }))
        socket.send(JSON.stringify({ transaction: 1, subscribe: 1, req_id: 2 }))
        socket.send(JSON.stringify({ portfolio: 1, req_id: 3 }))
      }
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as DerivMessage
          const balance = message.balance?.balance
          const currency = message.balance?.currency
          if (message.msg_type === 'balance' && typeof balance === 'number' && Number.isFinite(balance) && typeof currency === 'string' && currency.length > 0) {
            this.options.onSnapshot({
              balance,
              currency,
              accountId: typeof data.account?.id === 'string' ? data.account.id : '',
              accountType: typeof data.account?.type === 'string' ? data.account.type : accountType,
            })
          }
        } catch {
          this.options.onStatus?.('error')
        }
      }
      socket.onerror = () => this.options.onStatus?.('error')
      socket.onclose = () => {
        this.socket = null
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
