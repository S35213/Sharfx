import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export interface ShafxUser {
  id: string
  email: string
  displayName: string | null
  status: 'active' | 'suspended' | 'banned'
  simulatorAccountId: string
  createdAt: string
}

interface AuthContextValue {
  user: ShafxUser | null
  loading: boolean
  error: string | null
  signUp: (input: { displayName: string; email: string; password: string }) => Promise<{ needsEmailConfirmation?: boolean; message?: string }>
  signIn: (input: { email: string; password: string }) => Promise<void>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function request(action: string, options: RequestInit = {}) {
  const response = await fetch(`/api/auth?action=${encodeURIComponent(action)}`, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options })
  const data = await response.json().catch(() => ({ ok: false, error: 'Unexpected SHAFX identity response.' }))
  if (!response.ok || !data.ok) throw new Error(data.error || 'SHAFX identity request failed.')
  return data
}

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [user, setUser] = useState<ShafxUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try { const data = await request('me'); setUser(data.user); setError(null) }
    catch (err) { setUser(null); setError(err instanceof Error && err.message !== 'Not signed in' ? err.message : null) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const signUp = useCallback(async (input: { displayName: string; email: string; password: string }) => {
    const data = await request('signup', { method: 'POST', body: JSON.stringify(input) })
    if (data.user) setUser(data.user)
    return { needsEmailConfirmation: data.needsEmailConfirmation, message: data.message }
  }, [])

  const signIn = useCallback(async (input: { email: string; password: string }) => {
    const data = await request('login', { method: 'POST', body: JSON.stringify(input) })
    setUser(data.user); setError(null)
  }, [])

  const signOut = useCallback(async () => { await request('logout'); setUser(null); setError(null) }, [])

  const value = useMemo(() => ({ user, loading, error, signUp, signIn, signOut, refresh }), [user, loading, error, signUp, signIn, signOut, refresh])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
