import type { ProviderAccountSnapshot } from '../../integrations/core/types'
import { ProviderAccountStream } from './ProviderAccountStream'

export interface ProviderAccountStreamSpec {
  providerId: string
  connectionId: string
  accountId: string
  accountType: 'real' | 'demo'
}

export type ManagedProviderStreamStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export interface ManagedProviderAccount {
  key: string
  spec: ProviderAccountStreamSpec
  snapshot: ProviderAccountSnapshot | null
  status: ManagedProviderStreamStatus
}

export const providerAccountStreamKey = (spec: ProviderAccountStreamSpec): string =>
  [spec.providerId, spec.connectionId, spec.accountId, spec.accountType].map((value) => encodeURIComponent(value)).join(':')

export class ProviderAccountStreamManager {
  private readonly streams = new Map<string, ProviderAccountStream>()
  private readonly records = new Map<string, ManagedProviderAccount>()

  async start(
    spec: ProviderAccountStreamSpec,
    onSnapshot?: (snapshot: ProviderAccountSnapshot) => void,
    onStatus?: (status: ManagedProviderStreamStatus) => void,
  ): Promise<string> {
    const key = providerAccountStreamKey(spec)
    await this.stop(key)
    this.records.set(key, { key, spec, snapshot: null, status: 'connecting' })

    const stream = new ProviderAccountStream({
      providerId: spec.providerId,
      connectionId: spec.connectionId,
      accountId: spec.accountId,
      accountType: spec.accountType,
      onSnapshot: (snapshot) => {
        const record = this.records.get(key)
        if (!record) return
        record.snapshot = snapshot
        record.status = 'connected'
        onSnapshot?.(snapshot)
      },
      onStatus: (status) => {
        const record = this.records.get(key)
        if (!record) return
        record.status = status
        onStatus?.(status)
      },
    })

    this.streams.set(key, stream)
    try {
      await stream.start()
      return key
    } catch (error) {
      this.streams.delete(key)
      const record = this.records.get(key)
      if (record) record.status = 'error'
      throw error
    }
  }

  async stop(key: string): Promise<void> {
    const stream = this.streams.get(key)
    this.streams.delete(key)
    if (stream) stream.stop()
    this.records.delete(key)
  }

  get(key: string): ManagedProviderAccount | undefined {
    const record = this.records.get(key)
    return record ? { ...record, spec: { ...record.spec } } : undefined
  }

  list(): ManagedProviderAccount[] {
    return [...this.records.values()].map((record) => ({
      ...record,
      spec: { ...record.spec },
    }))
  }

  async stopAll(): Promise<void> {
    const keys = [...this.streams.keys()]
    await Promise.all(keys.map((key) => this.stop(key)))
  }
}
