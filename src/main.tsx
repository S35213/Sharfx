import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { AuthProvider } from './app/AuthContext'

const Disclaimer = () => <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-3 py-1 text-center text-[10px] font-medium text-yellow-500 sm:text-xs">SIMULATED — NOT FINANCIAL ADVICE. SHAFX does not currently place real-money orders.</div>
const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element #root not found')

createRoot(rootEl).render(<StrictMode><Disclaimer /><AuthProvider><App /></AuthProvider></StrictMode>)
