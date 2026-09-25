import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

interface ShafxUser {
  id: string
  email: string
  displayName: string
  status: string
  createdAt: string
  botPlan: 'FREE' | 'REGULAR' | 'PRO'
}

interface AuthResult {
  message?: string
  needsEmailConfirmation?: boolean
  retryAfterSeconds?: number
}

interface AuthContextValue {
  user: ShafxUser | null
  loading: boolean
  error: string | null
  signUp: (input: { displayName: string; email: string; password: string; website?: string }) => Promise<AuthResult>
  signIn: (input: { email: string; password: string }) => Promise<AuthResult>
  requestVerificationCode: (email: string) => Promise<AuthResult>
  verifyEmailCode: (input: { email: string; code: string }) => Promise<AuthResult>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

async function authRequest(action: string, body?: Record<string, unknown>): Promise<{ user: ShafxUser | null; data?: AuthResult; error?: string }> {
  const response = await fetch('/api/auth?action=' + encodeURIComponent(action), {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.ok === false) throw new Error(typeof payload?.error === 'string' ? payload.error : 'SHAFX authentication request failed.')
  return { user: payload?.user ?? null, data: payload }
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<ShafxUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const result = await authRequest('me')
      setUser(result.user)
    } catch (err) {
      setUser(null)
      setError(err instanceof Error ? err.message : 'Unable to restore SHAFX authentication.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const signUp = useCallback(async (input: { displayName: string; email: string; password: string; website?: string }) => {
    setError(null)
    const result = await authRequest('signup', input)
    setUser(result.user)
    return result.data ?? {}
  }, [])

  const signIn = useCallback(async (input: { email: string; password: string }) => {
    setError(null)
    const result = await authRequest('signin', input)
    setUser(result.user)
    return result.data ?? {}
  }, [])

  const requestVerificationCode = useCallback(async (email: string) => {
    setError(null)
    const result = await authRequest('request-verification', { email })
    return result.data ?? {}
  }, [])

  const verifyEmailCode = useCallback(async (input: { email: string; code: string }) => {
    setError(null)
    const result = await authRequest('verify-email', input)
    setUser(result.user)
    return result.data ?? {}
  }, [])

  const signOut = useCallback(async () => {
    try { await authRequest('signout') } finally { setUser(null) }
  }, [])

  const value: AuthContextValue = { user, loading, error, signUp, signIn, requestVerificationCode, verifyEmailCode, signOut, refresh }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
