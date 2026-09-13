export type TradingMode = 'simulator' | 'broker'

const STORAGE_PREFIX = 'shafx-trading-mode:'
const SESSION_KEY = 'shafx-trading-mode'

const keyFor = (simulatorAccountId?: string): string => `${STORAGE_PREFIX}${simulatorAccountId || 'default'}`

export const getStoredTradingMode = (simulatorAccountId?: string): TradingMode | null => {
  if (typeof window === 'undefined') return null
  const accountKey = keyFor(simulatorAccountId)
  const stored = window.localStorage.getItem(accountKey) ?? window.sessionStorage.getItem(SESSION_KEY)
  return stored === 'broker' || stored === 'simulator' ? stored : null
}

export const setStoredTradingMode = (mode: TradingMode, simulatorAccountId?: string): void => {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(SESSION_KEY, mode)
  try { window.localStorage.setItem(keyFor(simulatorAccountId), mode) } catch { /* local persistence is best-effort */ }
}

export const clearSessionTradingMode = (): void => {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(SESSION_KEY)
}
