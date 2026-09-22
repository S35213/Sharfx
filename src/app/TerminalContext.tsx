import React, { createContext, useContext, useState, type ReactNode } from 'react'
import type { Timeframe } from '../types'
import { DEFAULT_SYMBOL } from '../data/mock/symbols'

const SELECTED_SYMBOL_KEY = 'shafx-terminal-symbol'
const TIMEFRAME_KEY = 'shafx-terminal-timeframe'
const VALID_TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1']

const readStored = <T,>(key: string, fallback: T, validate?: (value: unknown) => value is T): T => {
  if (typeof window === 'undefined') return fallback
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? 'null')
    return validate ? (validate(value) ? value : fallback) : (typeof value === 'string' ? value as T : fallback)
  } catch {
    return fallback
  }
}

const isTimeframe = (value: unknown): value is Timeframe => typeof value === 'string' && VALID_TIMEFRAMES.includes(value as Timeframe)

interface TerminalContextValue {
  selectedSymbol: string
  setSelectedSymbol: (symbol: string) => void
  timeframe: Timeframe
  setTimeframe: (tf: Timeframe) => void
}

const TerminalContext = createContext<TerminalContextValue | undefined>(undefined)

export const TerminalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [selectedSymbol, setSelectedSymbolState] = useState<string>(() => readStored<string>(SELECTED_SYMBOL_KEY, DEFAULT_SYMBOL))
  const [timeframe, setTimeframeState] = useState<Timeframe>(() => readStored<Timeframe>(TIMEFRAME_KEY, 'H1', isTimeframe))

  const setSelectedSymbol = (symbol: string): void => {
    setSelectedSymbolState(symbol)
    try { window.localStorage.setItem(SELECTED_SYMBOL_KEY, JSON.stringify(symbol)) } catch { /* storage may be unavailable */ }
  }

  const setTimeframe = (tf: Timeframe): void => {
    setTimeframeState(tf)
    try { window.localStorage.setItem(TIMEFRAME_KEY, JSON.stringify(tf)) } catch { /* storage may be unavailable */ }
  }

  return <TerminalContext.Provider value={{ selectedSymbol, setSelectedSymbol, timeframe, setTimeframe }}>{children}</TerminalContext.Provider>
}

export const useTerminal = (): TerminalContextValue => {
  const context = useContext(TerminalContext)
  if (!context) throw new Error('useTerminal must be used within a TerminalProvider')
  return context
}
