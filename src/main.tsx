import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { AuthProvider, useAuth } from './app/AuthContext'
import { AccountAccessGate } from './components/account/AccountAccessGate'

const Disclaimer = () => <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-3 py-1 text-center text-[10px] font-medium text-yellow-500 sm:text-xs">SIMULATED — NOT FINANCIAL ADVICE. SHAFX does not currently place real-money orders.</div>
type TradingMode = 'simulator' | 'broker'

const EntryGate = () => {
  const { user } = useAuth()
  const [mode, setMode] = useState<TradingMode | null>(null)

  useEffect(() => {
    if (!user) setMode(null)
  }, [user])

  if (!user || !mode) return <AccountAccessGate onEnterTerminal={setMode} />
  return <App />
}

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element #root not found')

createRoot(rootEl).render(<StrictMode><Disclaimer /><AuthProvider><EntryGate /></AuthProvider></StrictMode>)
