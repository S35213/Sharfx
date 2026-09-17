import { ProviderAccountStream } from '../provider/ProviderAccountStream'

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

/**
 * Compatibility wrapper for older callers. The transport now goes through
 * the provider adapter boundary instead of talking to Deriv directly here.
 */
export class DerivAccountStream {
  private readonly stream: ProviderAccountStream

  constructor(options: StreamOptions) {
    this.stream = new ProviderAccountStream({
      providerId: 'deriv',
      accountType: options.accountType,
      onSnapshot: (snapshot) => options.onSnapshot({
        balance: snapshot.balance,
        currency: snapshot.currency,
        accountId: snapshot.accountId,
        accountType: snapshot.environment === 'demo' ? 'demo' : 'real',
      }),
      onStatus: options.onStatus,
    })
  }

  start(): Promise<void> {
    return this.stream.start()
  }

  stop(): void {
    this.stream.stop()
  }
}
