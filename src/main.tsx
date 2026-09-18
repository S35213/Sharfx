import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { AuthProvider, useAuth } from './app/AuthContext'
import { AccountAccessGate } from './components/account/AccountAccessGate'
import { clearSessionTradingMode, getStoredTradingMode, type TradingMode } from './app/tradingMode'

const EntryGate = () => {
  const { user } = useAuth()
  const [mode, setMode] = useState<TradingMode | null>(null)

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

createRoot(rootEl).render(<StrictMode><AuthProvider><EntryGate /></AuthProvider></StrictMode>)
