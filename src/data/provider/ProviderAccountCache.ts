import type { ProviderOrderResult, ProviderPosition, ProviderAccountSnapshot } from '../../integrations/core/types'

export interface ProviderAccountCacheEntry {
  account: ProviderAccountSnapshot | null
  positions: ProviderPosition[]
  orders: ProviderOrderResult[]
  updatedAt: number
}

export class ProviderAccountCache {
  private readonly entries = new Map<string, ProviderAccountCacheEntry>()

  get(key: string): ProviderAccountCacheEntry | undefined {
    const entry = this.entries.get(key)
    return entry ? { account: entry.account, positions: [...entry.positions], orders: [...entry.orders], updatedAt: entry.updatedAt } : undefined
  }

  setAccount(key: string, account: ProviderAccountSnapshot, updatedAt = Date.now()): void {
    const current = this.entries.get(key)
    this.entries.set(key, {
      account,
      positions: current?.positions || [],
      orders: current?.orders || [],
      updatedAt,
    })
  }

  setPositions(key: string, positions: ProviderPosition[], updatedAt = Date.now()): void {
    const current = this.entries.get(key)
    this.entries.set(key, {
      account: current?.account || null,
      positions: [...positions],
      orders: current?.orders || [],
      updatedAt,
    })
  }

  setOrders(key: string, orders: ProviderOrderResult[], updatedAt = Date.now()): void {
    const current = this.entries.get(key)
    this.entries.set(key, {
      account: current?.account || null,
      positions: current?.positions || [],
      orders: [...orders],
      updatedAt,
    })
  }

  invalidate(key?: string): void {
    if (key) this.entries.delete(key)
    else this.entries.clear()
  }
}
