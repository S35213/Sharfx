import type { AccountData } from '../../types'

const DEFAULT_DEMO_BALANCE = 10000
const STORAGE_PREFIX = 'shafx-demo-balance:'

const accountKey = (): string => {
  if (typeof window === 'undefined') return 'default'
  return window.sessionStorage.getItem('shafx-simulator-account-id') || 'default'
}

const storageKey = (): string => `${STORAGE_PREFIX}${accountKey()}`

export const getDemoBalance = (fallback = DEFAULT_DEMO_BALANCE): number => {
  if (typeof window === 'undefined') return fallback
  const raw = window.localStorage.getItem(storageKey())
  const value = raw === null ? fallback : Number(raw)
  return Number.isFinite(value) && value >= 0 ? Number(value.toFixed(2)) : fallback
}

export const setDemoBalance = (balance: number): number => {
  const safe = Number.isFinite(balance) && balance >= 0 ? Number(balance.toFixed(2)) : DEFAULT_DEMO_BALANCE
  if (typeof window !== 'undefined') window.localStorage.setItem(storageKey(), String(safe))
  return safe
}

export const applyDemoProfit = (profit: number): number => setDemoBalance(getDemoBalance() + profit)

export const getDemoAccountData = (base: AccountData): AccountData => {
  const balance = getDemoBalance(base.balance)
  return { ...base, balance, equity: balance, freeMargin: balance, floatingPL: 0 }
}
