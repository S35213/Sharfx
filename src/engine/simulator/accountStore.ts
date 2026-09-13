import type { AccountData, TradeOrder } from '../../types'

const DEFAULT_DEMO_BALANCE = 10000
const STORAGE_PREFIX = 'shafx-demo-balance:'
const POSITIONS_PREFIX = 'shafx-demo-open-positions:'
const HISTORY_PREFIX = 'shafx-demo-trade-history:'

const accountKey = (): string => {
  if (typeof window === 'undefined') return 'default'
  return window.sessionStorage.getItem('shafx-simulator-account-id') || 'default'
}

const storageKey = (prefix: string): string => `${prefix}${accountKey()}`

const readJson = <T>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw)
    return parsed as T
  } catch {
    return fallback
  }
}

const writeJson = <T>(key: string, value: T): void => {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* local persistence is best-effort */ }
}

export const getDemoBalance = (fallback = DEFAULT_DEMO_BALANCE): number => {
  if (typeof window === 'undefined') return fallback
  const raw = window.localStorage.getItem(storageKey(STORAGE_PREFIX))
  const value = raw === null ? fallback : Number(raw)
  return Number.isFinite(value) && value >= 0 ? Number(value.toFixed(2)) : fallback
}

export const setDemoBalance = (balance: number): number => {
  const safe = Number.isFinite(balance) && balance >= 0 ? Number(balance.toFixed(2)) : DEFAULT_DEMO_BALANCE
  if (typeof window !== 'undefined') window.localStorage.setItem(storageKey(STORAGE_PREFIX), String(safe))
  return safe
}

export const applyDemoProfit = (profit: number): number => setDemoBalance(getDemoBalance() + profit)

export const getDemoOpenPositions = (fallback: TradeOrder[]): TradeOrder[] => readJson<TradeOrder[]>(storageKey(POSITIONS_PREFIX), fallback)
export const setDemoOpenPositions = (positions: TradeOrder[]): void => writeJson(storageKey(POSITIONS_PREFIX), positions)
export const getDemoTradeHistory = (fallback: TradeOrder[]): TradeOrder[] => readJson<TradeOrder[]>(storageKey(HISTORY_PREFIX), fallback)
export const setDemoTradeHistory = (history: TradeOrder[]): void => writeJson(storageKey(HISTORY_PREFIX), history)

export const getDemoAccountData = (base: AccountData): AccountData => {
  const balance = getDemoBalance(base.balance)
  return { ...base, balance, equity: balance, freeMargin: balance, floatingPL: 0 }
}
