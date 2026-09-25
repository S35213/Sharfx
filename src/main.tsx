import { Component, StrictMode, Suspense, lazy, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AuthProvider, useAuth } from './app/AuthContext'
import { AccountAccessGate } from './components/account/AccountAccessGate'
import { SHAFX_BRAND_TRANSITION_EVENT, ShafxBrandTransition, type ShafxBrandTransitionKind } from './components/brand/ShafxBrand'
import { chooseDefaultProviderSelection, getProviderConnections } from './data/provider/providerConnections'

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
          <p className="mt-2 text-sm leading-6 text-[#8A93A3]">The deployment is reachable, but the browser encountered an application error before the workspace could render.</p>
          <pre className="mt-4 max-h-40 overflow-auto rounded-xl border border-white/10 bg-[#070A0F] p-3 text-xs text-[#C8CFDA]">{this.state.error?.message || 'Unknown startup error'}</pre>
          <button type="button" onClick={() => window.location.reload()} className="mt-4 min-h-11 w-full rounded-xl bg-[#6D5EF7] px-4 text-xs font-semibold text-white hover:opacity-90">Reload SHAFX</button>
        </section>
      </main>
    )
  }
}

const EntryGate = () => {
  const { user, loading } = useAuth()
  const [brokerReady, setBrokerReady] = useState(false)
  const [brandTransition, setBrandTransition] = useState<ShafxBrandTransitionKind | null>(null)
  const previousUser = useRef<typeof user>(null)
  const authInitialized = useRef(false)

  useEffect(() => {
    if (loading) return
    if (!authInitialized.current) {
      previousUser.current = user
      authInitialized.current = true
    } else {
      if (!previousUser.current && user) setBrandTransition('welcome')
      if (previousUser.current && !user) setBrandTransition('goodbye')
      previousUser.current = user
    }
  }, [loading, user])

  useEffect(() => {
    if (!user) {
      setBrokerReady(false)
      return
    }
    let cancelled = false
    const checkConnection = async (): Promise<void> => {
      try {
        const connections = await getProviderConnections()
        const selected = chooseDefaultProviderSelection(connections)
        if (!cancelled) setBrokerReady(Boolean(selected?.providerId === 'deriv' && selected.connectionId && selected.accountId))
      } catch {
        if (!cancelled) setBrokerReady(false)
      }
    }
    void checkConnection()
    return () => { cancelled = true }
  }, [user])

  useEffect(() => {
    const onBrandTransition = (event: Event): void => {
      const detail = (event as CustomEvent<{ kind?: ShafxBrandTransitionKind }>).detail
      if (detail?.kind === 'welcome' || detail?.kind === 'goodbye') setBrandTransition(detail.kind)
    }
    window.addEventListener(SHAFX_BRAND_TRANSITION_EVENT, onBrandTransition)
    return () => window.removeEventListener(SHAFX_BRAND_TRANSITION_EVENT, onBrandTransition)
  }, [])

  if (brandTransition) {
    return (
      <>
        <ShafxBrandTransition kind={brandTransition} onDone={() => setBrandTransition(null)} />
        <div className="pointer-events-none">
          <AccountAccessGate onConnected={() => setBrokerReady(true)} />
        </div>
      </>
    )
  }

  if (loading || !user) return <AccountAccessGate onConnected={() => setBrokerReady(true)} />

  if (!brokerReady) return <AccountAccessGate onConnected={() => setBrokerReady(true)} />

  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#070A0F] text-sm text-[#8A93A3]">Connecting to your broker…</div>}>
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
