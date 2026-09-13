import React, { useEffect, useState } from 'react'
import { Activity, ArrowRight, KeyRound, LockKeyhole, LogIn, UserPlus } from 'lucide-react'
import { useAuth } from '../../app/AuthContext'

type FormMode = 'signin' | 'signup'

async function publicAuthRequest(action: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/auth?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({ ok: false, error: 'Unexpected SHAFX identity response.' }))
  if (!response.ok || !data.ok) throw new Error(data.error || 'SHAFX identity request failed.')
  return data
}

export const PublicWelcome: React.FC = () => {
  const [formMode, setFormMode] = useState<FormMode>('signin')
  const [forgotMode, setForgotMode] = useState(false)
  const [resetToken, setResetToken] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirm, setResetConfirm] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [website, setWebsite] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const { signIn, signUp, error } = useAuth()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('auth') !== 'reset') return
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const token = hash.get('access_token')
    if (token) setResetToken(token)
  }, [])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setMessage(null)
    try {
      if (forgotMode) {
        const result = await publicAuthRequest('reset-request', { email })
        setMessage(result.message)
      } else if (resetToken) {
        if (resetPassword.length < 10) { setMessage('Password must be at least 10 characters.'); return }
        if (resetPassword !== resetConfirm) { setMessage('Passwords do not match.'); return }
        const result = await publicAuthRequest('update-password', { token: resetToken, password: resetPassword })
        setMessage(result.message)
        setResetToken(null)
        window.history.replaceState({}, '', '/')
        window.location.hash = ''
        setFormMode('signin')
        setPassword('')
        setResetPassword('')
        setResetConfirm('')
      } else if (formMode === 'signup') {
        if (password.length < 10) { setMessage('Password must be at least 10 characters.'); return }
        if (password !== confirmPassword) { setMessage('Passwords do not match.'); return }
        const result = await signUp({ displayName, email, password, website })
        setMessage(result.message || (result.needsEmailConfirmation ? 'Check your email to confirm your SHAFX account, then sign in.' : 'Your SHAFX account is ready.'))
        if (result.needsEmailConfirmation) setPassword('')
      } else {
        await signIn({ email, password })
        setPassword('')
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to complete SHAFX account request.')
    } finally {
      setSubmitting(false)
    }
  }

  const title = resetToken ? 'Set a new password' : forgotMode ? 'Reset your password' : formMode === 'signin' ? 'Sign in to SHAFX' : 'Create your SHAFX account'
  const subtitle = resetToken ? 'Choose a new password for your SHAFX account.' : forgotMode ? 'Enter your email and we will send a secure reset link.' : formMode === 'signin' ? 'Continue to your SHAFX trading workspace.' : 'Create your SHAFX identity before choosing a trading account.'

  return <main className="min-h-[calc(100vh-32px)] overflow-y-auto bg-shafx-bg px-4 py-10 text-shafx-text sm:px-6 sm:py-14">
    <div className="mx-auto w-full max-w-lg">
      <section className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-shafx-primary/30 bg-shafx-primary/10 text-shafx-primary shadow-lg shadow-shafx-primary/5">
          <Activity className="h-8 w-8" />
        </div>
        <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">Welcome to SHAFX</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-shafx-textMuted sm:text-base">SHAFX is a trading analysis and simulator platform designed to help you understand the market, test ideas, and trade with more clarity.</p>
      </section>

      <section className="mt-8 rounded-2xl border border-shafx-border bg-shafx-surface p-4 shadow-xl sm:p-6">
        <div className="flex items-center gap-3 border-b border-shafx-border pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-shafx-primary/10 text-shafx-primary"><LockKeyhole className="h-5 w-5" /></div>
          <div><h2 className="text-sm font-semibold">Your SHAFX identity</h2><p className="mt-0.5 text-[11px] text-shafx-textMuted">One account for your SHAFX workspace.</p></div>
        </div>

        {!resetToken && !forgotMode && <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl border border-shafx-border bg-shafx-bg p-1">
          <button type="button" onClick={() => { setFormMode('signin'); setMessage(null) }} className={`min-h-11 rounded-lg text-xs font-semibold transition ${formMode === 'signin' ? 'bg-shafx-primary text-white shadow' : 'text-shafx-textMuted hover:text-shafx-text'}`}>Sign in</button>
          <button type="button" onClick={() => { setFormMode('signup'); setMessage(null) }} className={`min-h-11 rounded-lg text-xs font-semibold transition ${formMode === 'signup' ? 'bg-shafx-primary text-white shadow' : 'text-shafx-textMuted hover:text-shafx-text'}`}>Create account</button>
        </div>}

        <div className="mt-5">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-shafx-textMuted">{subtitle}</p>
        </div>

        <form onSubmit={(event) => void submit(event)} className="mt-4 space-y-3">
          {resetToken ? <>
            <input value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} type="password" autoComplete="new-password" required minLength={10} placeholder="New password" className="min-h-12 w-full rounded-xl border border-shafx-border bg-shafx-bg px-4 text-sm outline-none transition focus:border-shafx-primary" />
            <input value={resetConfirm} onChange={(event) => setResetConfirm(event.target.value)} type="password" autoComplete="new-password" required minLength={10} placeholder="Confirm new password" className="min-h-12 w-full rounded-xl border border-shafx-border bg-shafx-bg px-4 text-sm outline-none transition focus:border-shafx-primary" />
            <button disabled={submitting} type="submit" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-shafx-primary px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"><KeyRound className="h-4 w-4" />{submitting ? 'Updating…' : 'Update password'}</button>
          </> : forgotMode ? <>
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required placeholder="Email address" className="min-h-12 w-full rounded-xl border border-shafx-border bg-shafx-bg px-4 text-sm outline-none transition focus:border-shafx-primary" />
            <button disabled={submitting} type="submit" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-shafx-primary px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"><KeyRound className="h-4 w-4" />{submitting ? 'Sending…' : 'Send reset link'}</button>
          </> : <>
            {formMode === 'signup' && <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" className="min-h-12 w-full rounded-xl border border-shafx-border bg-shafx-bg px-4 text-sm outline-none transition focus:border-shafx-primary" />}
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required placeholder="Email address" className="min-h-12 w-full rounded-xl border border-shafx-border bg-shafx-bg px-4 text-sm outline-none transition focus:border-shafx-primary" />
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={formMode === 'signin' ? 'current-password' : 'new-password'} required minLength={formMode === 'signup' ? 10 : 1} placeholder={formMode === 'signup' ? 'Password (minimum 10 characters)' : 'Password'} className="min-h-12 w-full rounded-xl border border-shafx-border bg-shafx-bg px-4 text-sm outline-none transition focus:border-shafx-primary" />
            {formMode === 'signup' && <><input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" required minLength={10} placeholder="Confirm password" className="min-h-12 w-full rounded-xl border border-shafx-border bg-shafx-bg px-4 text-sm outline-none transition focus:border-shafx-primary" /><input aria-hidden="true" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} className="absolute -left-[10000px] top-auto h-px w-px opacity-0" /></>}
            <button disabled={submitting} type="submit" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-shafx-primary px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60">{formMode === 'signin' ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}{submitting ? 'Please wait…' : formMode === 'signin' ? 'Sign in to SHAFX' : 'Create SHAFX account'}<ArrowRight className="h-4 w-4 opacity-70" /></button>
            {formMode === 'signin' && <button type="button" onClick={() => { setForgotMode(true); setMessage(null) }} className="w-full py-1 text-[11px] text-shafx-primary hover:underline">Forgot password?</button>}
          </>}
        </form>

        {(message || error) && <div className="mt-4 rounded-xl border border-shafx-border bg-shafx-bg px-3 py-2.5 text-xs leading-5 text-shafx-textMuted">{message || error}</div>}
        {forgotMode && <button type="button" onClick={() => { setForgotMode(false); setMessage(null) }} className="mt-3 w-full text-[11px] text-shafx-textMuted hover:text-shafx-text">Back to sign in</button>}
      </section>

      <p className="mt-5 text-center text-[10px] leading-5 text-shafx-textMuted">Create your SHAFX identity first. After signing in, you can choose the SHAFX Simulator or connect an existing broker account. No real-money order is placed from this welcome screen.</p>
    </div>
  </main>
}
