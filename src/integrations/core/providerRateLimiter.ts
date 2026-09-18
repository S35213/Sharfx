export interface ProviderRateLimitPolicy {
  requestsPerSecond: number
  burst?: number
}

interface Bucket {
  nextAvailableAtMs: number
}

type SleepFn = (ms: number) => Promise<void>

const defaultSleep: SleepFn = (ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms))

export class ProviderRateLimiter {
  private readonly buckets = new Map<string, Bucket>()

  constructor(
    private readonly policy: ProviderRateLimitPolicy,
    private readonly now: () => number = Date.now,
    private readonly sleep: SleepFn = defaultSleep,
  ) {
    if (!Number.isFinite(policy.requestsPerSecond) || policy.requestsPerSecond <= 0) {
      throw new Error('Provider rate-limit requestsPerSecond must be greater than zero.')
    }
  }

  async acquire(key: string): Promise<void> {
    const spacingMs = 1000 / this.policy.requestsPerSecond
    const current = this.now()
    const bucket = this.buckets.get(key) || { nextAvailableAtMs: current }
    const waitMs = Math.max(0, bucket.nextAvailableAtMs - current)
    bucket.nextAvailableAtMs = Math.max(bucket.nextAvailableAtMs, current) + spacingMs
    this.buckets.set(key, bucket)
    if (waitMs > 0) await this.sleep(waitMs)
  }

  clear(key?: string): void {
    if (key) this.buckets.delete(key)
    else this.buckets.clear()
  }
}

export const createProviderRateLimiter = (policy: ProviderRateLimitPolicy): ProviderRateLimiter =>
  new ProviderRateLimiter(policy)
