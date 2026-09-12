import { describe, expect, it } from 'vitest'
import { assessMarketHealth } from './LiveMarketHealth'

describe('assessMarketHealth', () => {
  it('accepts fresh data', () => expect(assessMarketHealth({ latestCandleTime: 9_500, now: 10_000, maxAgeMs: 1_000 }).status).toBe('HEALTHY'))
  it('rejects future timestamps', () => expect(assessMarketHealth({ latestCandleTime: 10_001, now: 10_000, maxAgeMs: 1_000 }).status).toBe('INVALID'))
  it('blocks stale data', () => expect(assessMarketHealth({ latestCandleTime: 8_000, now: 10_000, maxAgeMs: 1_000 }).status).toBe('STALE'))
  it('rejects invalid thresholds', () => expect(assessMarketHealth({ latestCandleTime: 9_000, now: 10_000, maxAgeMs: 0 }).status).toBe('INVALID'))
})
