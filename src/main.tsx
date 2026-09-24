import { Component, StrictMode, Suspense, lazy, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AuthProvider, useAuth } from './app/AuthContext'
import { AccountAccessGate } from './components/account/AccountAccessGate'
import { SHAFX_BRAND_TRANSITION_EVENT, ShafxBrandTransition, type ShafxBrandTransitionKind } from './components/brand/ShafxBrand'
import { clearSessionTradingMode, getStoredTradingMode, type TradingMode } from './app/tradingMode'

const App = lazy(() => import('./App'))

class RootErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  state = { hasError: false, error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('SHAFX root error boundary caught:', error, info)
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children

    return (
      <main className="flex min-h-screen items-center justify-center bg-[#070A0F] px-4 py-8 text-[#E7EAF0]">
        <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#11161D] p-6 shadow-2xl">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8A93A3]">SHAFX startup guard</div>
          <h1 className="mt-2 text-2xl font-semibold">The workspace hit a startup error.</h1>
          <p className="mt-2 text-sm leading-6 text-[#8A93A3]">
            The deployment is reachable, but the browser encountered an application error before the workspace could render.
          </p>
          <pre className="mt-4 max-h-40 overflow-auto rounded-xl border border-white/10 bg-[#070A0F] p-3 text-xs text-[#C8CFDA]">
            {this.state.error?.message || 'Unknown startup error'}
          </pre>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-11 flex-1 rounded-xl bg-[#6D5EF7] px-4 text-xs font-semibold text-white hover:opacity-90"
            >
              Reload SHAFX
            </button>
            <a
              href="/?account=demo"
              className="min-h-11 flex-1 rounded-xl border border-white/10 bg-[#070A0F] px-4 py-3 text-center text-xs font-semibold text-[#C8CFDA]"
            >
              Open demo route
            </a>
          </div>
        </section>
      </main>
    )
  }
}

const EntryGate = () => {
  const { user, loading } = useAuth()
  const [mode, setMode] = useState<TradingMode | null>(null)
  const [brandTransition, setBrandTransition] = useState<ShafxBrandTransitionKind | null>(null)
  const previousUser = useRef<typeof user>(null)
  const authInitialized = useRef(false)

  useEffect(() => {
    if (loading) return
    if (!authInitialized.current) {
      previousUser.current = user
      authInitialized.current = true
      return
    }
    if (!previousUser.current && user) setBrandTransition('welcome')
    if (previousUser.current && !user) {
      try {
        window.sessionStorage.setItem('shafx-suppress-landing-intro', '1')
      } catch {
        /* storage may be unavailable */
      }
      setBrandTransition('goodbye')
    }
    previousUser.current = user
  }, [loading, user])

  useEffect(() => {
    const onBrandTransition = (event: Event): void => {
      const detail = (event as CustomEvent<{ kind?: ShafxBrandTransitionKind }>).detail
      if (detail?.kind === 'welcome' || detail?.kind === 'goodbye') setBrandTransition(detail.kind)
    }
    window.addEventListener(SHAFX_BRAND_TRANSITION_EVENT, onBrandTransition)
    return () => window.removeEventListener(SHAFX_BRAND_TRANSITION_EVENT, onBrandTransition)
  }, [])


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

  const previewMode = new URLSearchParams(window.location.search).get('preview') === '1'

  if (brandTransition) {
    return (
      <>
        <ShafxBrandTransition kind={brandTransition} onDone={() => setBrandTransition(null)} />
        <div className="pointer-events-none">
          <AccountAccessGate onEnterTerminal={setMode} />
        </div>
      </>
    )
  }

  if (previewMode) return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#070A0F] text-sm text-[#8A93A3]">Loading SHAFX workspace…</div>}>
      <App />
    </Suspense>
  )

  if (!user || !mode) return <AccountAccessGate onEnterTerminal={setMode} />

  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#070A0F] text-sm text-[#8A93A3]">Loading SHAFX workspace…</div>}>
      <App />
    </Suspense>
  )
}

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element #root not found')

createRoot(rootEl).render(
  <StrictMode>
    <RootErrorBoundary>
      <AuthProvider>
        <EntryGate />
      </AuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
)
