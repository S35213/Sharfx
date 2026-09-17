import { assessProviderReadiness } from '../../integrations/core/providerReadiness'
import { providerRegistry } from '../../integrations/core/providerRegistry'
import { validateProviderConnection } from '../../integrations/core/providerConnectionGuard'
import type { ProviderAccountSnapshot, ProviderConnection, ProviderStreamHandle } from '../../integrations/core/types'

interface ProviderAccountStreamOptions {
  providerId: string
  accountType?: 'real' | 'demo'
  accountId?: string
  onSnapshot: (snapshot: ProviderAccountSnapshot) => void
  onStatus?: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void
}

export class ProviderAccountStream {
  private handle: ProviderStreamHandle | null = null
  private stopped = false

  constructor(private readonly options: ProviderAccountStreamOptions) {}

  async start(): Promise<void> {
    this.stopped = false
    this.options.onStatus?.('connecting')
    try {
      const adapter = providerRegistry.get(this.options.providerId)
      const readiness = assessProviderReadiness(adapter)
      if (!readiness.ready) {
        throw new Error(`Provider ${adapter.descriptor.name} is not ready: ${readiness.missingMethods.join(', ') || readiness.issues.join(', ')}`)
      }
      if (typeof adapter.subscribeAccount !== 'function') throw new Error(`${adapter.descriptor.name} does not support realtime account data.`)

      const environment = this.options.accountType === 'demo' ? 'demo' : 'live'
      const connection: ProviderConnection = {
        providerId: this.options.providerId,
        connectionId: `account:${this.options.providerId}:${environment}`,
        accountId: this.options.accountId,
        environment,
        connectedAt: new Date().toISOString(),
        state: 'connected',
      }
      const connectionCheck = validateProviderConnection(adapter, connection, environment)
      if (!connectionCheck.allowed) throw new Error(connectionCheck.reason || 'Provider account connection is not usable.')

      const handle = await adapter.subscribeAccount(connection, this.options.accountId, (event) => {
        if (this.stopped) return
        if (event.type === 'account') {
          this.options.onSnapshot(event.account)
          this.options.onStatus?.('connected')
        } else if (event.type === 'error') {
          this.options.onStatus?.('error')
        }
      })

      if (this.stopped) {
        await handle.close()
        return
      }
      this.handle = handle
      this.options.onStatus?.('connected')
    } catch (error) {
      this.options.onStatus?.('error')
      throw error
    }
  }

  stop(): void {
    this.stopped = true
    const handle = this.handle
    this.handle = null
    if (handle) void handle.close()
    this.options.onStatus?.('disconnected')
  }
}
