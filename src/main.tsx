import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { AuthProvider, useAuth } from './app/AuthContext'
import { AccountAccessGate } from './components/account/AccountAccessGate'
import { clearSessionTradingMode, getStoredTradingMode, type TradingMode } from './app/tradingMode'

const Disclaimer = () => <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-3 py-1 text-center text-[10px] font-medium text-yellow-500 sm:text-xs">SIMULATED — NOT FINANCIAL ADVICE. SHAFX does not currently place real-money orders.</div>

const EntryGate = () => {
  const { user } = useAuth()
  const [mode, setMode] = useState<TradingMode | null>(() => {
    if (typeof window === 'undefined') return null
    const requested = new URLSearchParams(window.location.search).get('account')
    if (requested === 'broker' || requested === 'demo') return null
    return null
  })

  useEffect(() => {
    if (!user) {
      clearSessionTradingMode()
      setMode(null)
      return
    }
    const requested = new URLSearchParams(window.location.search).get('account')
    if (requested === 'broker' || requested === 'demo') {
      setMode(null)
      return
    }
    setMode(getStoredTradingMode(user.simulatorAccountId))
  }, [user])

  if (!user || !mode) return <AccountAccessGate onEnterTerminal={setMode} />
  return <App />
}

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element #root not found')

createRoot(rootEl).render(<StrictMode><Disclaimer /><AuthProvider><EntryGate /></AuthProvider></StrictMode>)
