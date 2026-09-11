import React, { createContext, useContext, useState, type ReactNode } from 'react'
import type { Timeframe } from '../types'
import { DEFAULT_SYMBOL } from '../data/mock/symbols'

interface TerminalContextValue { selectedSymbol: string; setSelectedSymbol: (symbol: string) => void; timeframe: Timeframe; setTimeframe: (tf: Timeframe) => void }
const TerminalContext = createContext<TerminalContextValue | undefined>(undefined)

export const TerminalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [selectedSymbol, setSelectedSymbol] = useState(DEFAULT_SYMBOL)
  const [timeframe, setTimeframe] = useState<Timeframe>('H1')
  return <TerminalContext.Provider value={{ selectedSymbol, setSelectedSymbol, timeframe, setTimeframe }}>{children}</TerminalContext.Provider>
}

export const useTerminal = (): TerminalContextValue => {
  const context = useContext(TerminalContext)
  if (!context) throw new Error('useTerminal must be used within a TerminalProvider')
  return context
}
