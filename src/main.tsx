import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { AuthProvider, useAuth } from './app/AuthContext'
import { AccountAccessGate } from './components/account/AccountAccessGate'
import { clearSessionTradingMode, getStoredTradingMode, type TradingMode } from './app/tradingMode'

const Disclaimer = () => (
  <div className="flex h-7 items-center justify-center border-b border-shafx-border bg-[#080B10] px-3 text-[9px] font-medium tracking-wide text-shafx-textMuted">
    <span className="mr-2 h-1.5 w-1.5 rounded-full bg-shafx-warning" />
    SIMULATION-FIRST • MARKET INFORMATION ONLY • LIVE EXECUTION REMAINS RELEASE-GATED
  </div>
)

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
