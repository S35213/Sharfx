import React, { useEffect, useState } from 'react'
import { Activity, ArrowRight, KeyRound, LockKeyhole, LogIn, ShieldCheck, Sparkles, UserPlus } from 'lucide-react'
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

const featureCopy = [
  ['Adaptive workspace', 'One interface that follows the connected provider instead of forcing a broker-specific layout.'],
  ['Market intelligence', 'Structure, liquidity, risk and replay tools stay in one workspace.'],
  ['Controlled execution', 'Provider credentials stay server-side and execution remains explicitly gated.'],
]

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

  const title = resetToken ? 'Create a new password' : forgotMode ? 'Recover your account' : formMode === 'signin' ? 'Welcome back' : 'Create your SHAFX account'
  const subtitle = resetToken ? 'Set a new password and return to your workspace.' : forgotMode ? 'We will send a secure reset link to your account email.' : formMode === 'signin' ? 'Sign in to open your saved market workspace.' : 'Create your SHAFX identity before choosing a trading environment.'

  return <main className="min-h-[calc(100vh-28px)] overflow-y-auto bg-shafx-bg text-shafx-text">
    <div className="mx-auto flex min-h-[calc(100vh-28px)] w-full max-w-[1480px] flex-col lg:flex-row">
      <section className="relative hidden min-h-[calc(100vh-28px)] flex-1 overflow-hidden border-r border-shafx-border px-12 py-12 lg:flex xl:px-20">
        <div className="absolute inset-0 shafx-grid opacity-60" />
        <div className="absolute -left-24 top-24 h-80 w-80 rounded-full bg-shafx-accent/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-shafx-success/5 blur-3xl" />
        <div className="relative z-10 flex w-full flex-col">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-shafx-accent/30 bg-shafx-accent/10 text-shafx-accent"><Activity className="h-5 w-5" /></div>
            <div><div className="text-lg font-semibold tracking-tight">SHAFX</div><div className="text-[9px] uppercase tracking-[0.28em] text-shafx-textMuted">Market workspace</div></div>
          </div>
          <div className="mt-auto max-w-xl pb-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-shafx-border bg-shafx-surface/70 px-3 py-1.5 text-[9px] uppercase tracking-[0.18em] text-shafx-textMuted"><Sparkles className="h-3 w-3 text-shafx-accent" />Adaptive by design</div>
            <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-[-0.035em] xl:text-6xl">Your market.<br /><span className="text-shafx-accent">Your workspace.</span><br />Any supported provider.</h1>
            <p className="mt-5 max-w-lg text-sm leading-7 text-shafx-textMuted xl:text-base">SHAFX separates the analysis experience from the broker connection. Your charts, risk tools, research and workflow stay consistent while provider adapters supply the market and account capabilities they actually support.</p>
            <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
              {featureCopy.map(([titleText, body]) => <div key={titleText} className="rounded-2xl border border-shafx-border bg-shafx-surface/70 p-4 backdrop-blur-sm"><div className="text-xs font-semibold">{titleText}</div><p className="mt-2 text-[10px] leading-5 text-shafx-textMuted">{body}</p></div>)}
            </div>
          </div>
        </div>
      </section>

      <section className="flex w-full items-center justify-center px-4 py-8 sm:px-8 lg:w-[470px] lg:flex-shrink-0 lg:px-10">
        <div className="w-full max-w-md">
          <div className="mb-7 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-shafx-accent/30 bg-shafx-accent/10 text-shafx-accent"><Activity className="h-5 w-5" /></div>
            <div><div className="font-semibold tracking-tight">SHAFX</div><div className="text-[9px] uppercase tracking-[0.24em] text-shafx-textMuted">Market workspace</div></div>
          </div>
          <div className="mb-7"><div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-shafx-textMuted">Secure access</div><h2 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h2><p className="mt-2 text-sm leading-6 text-shafx-textMuted">{subtitle}</p></div>
          {!resetToken && !forgotMode && <div className="grid grid-cols-2 rounded-xl border border-shafx-border bg-shafx-surface p-1"><button type="button" onClick={() => { setFormMode('signin'); setMessage(null) }} className={`min-h-11 rounded-lg text-xs font-semibold transition ${formMode === 'signin' ? 'bg-shafx-accent text-white shadow-lg shadow-shafx-accent/10' : 'text-shafx-textMuted hover:text-shafx-text'}`}>Sign in</button><button type="button" onClick={() => { setFormMode('signup'); setMessage(null) }} className={`min-h-11 rounded-lg text-xs font-semibold transition ${formMode === 'signup' ? 'bg-shafx-accent text-white shadow-lg shadow-shafx-accent/10' : 'text-shafx-textMuted hover:text-shafx-text'}`}>Create account</button></div>}
          <form onSubmit={(event) => void submit(event)} className="mt-5 space-y-3">
            {resetToken ? <><input value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} type="password" autoComplete="new-password" required minLength={10} placeholder="New password" className="min-h-12 w-full rounded-xl border border-shafx-border bg-shafx-surface px-4 text-sm outline-none transition focus:border-shafx-accent" /><input value={resetConfirm} onChange={(event) => setResetConfirm(event.target.value)} type="password" autoComplete="new-password" required minLength={10} placeholder="Confirm new password" className="min-h-12 w-full rounded-xl border border-shafx-border bg-shafx-surface px-4 text-sm outline-none transition focus:border-shafx-accent" /><button disabled={submitting} type="submit" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-shafx-accent px-4 text-sm font-semibold text-white transition hover:bg-shafx-primaryHover disabled:opacity-60"><KeyRound className="h-4 w-4" />{submitting ? 'Updating…' : 'Update password'}</button></> : forgotMode ? <><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required placeholder="Email address" className="min-h-12 w-full rounded-xl border border-shafx-border bg-shafx-surface px-4 text-sm outline-none transition focus:border-shafx-accent" /><button disabled={submitting} type="submit" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-shafx-accent px-4 text-sm font-semibold text-white transition hover:bg-shafx-primaryHover disabled:opacity-60"><KeyRound className="h-4 w-4" />{submitting ? 'Sending…' : 'Send reset link'}</button></> : <>
              {formMode === 'signup' && <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Full name" className="min-h-12 w-full rounded-xl border border-shafx-border bg-shafx-surface px-4 text-sm outline-none transition focus:border-shafx-accent" />}
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required placeholder="Email address" className="min-h-12 w-full rounded-xl border border-shafx-border bg-shafx-surface px-4 text-sm outline-none transition focus:border-shafx-accent" />
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={formMode === 'signin' ? 'current-password' : 'new-password'} required minLength={formMode === 'signup' ? 10 : 1} placeholder={formMode === 'signup' ? 'Password (minimum 10 characters)' : 'Password'} className="min-h-12 w-full rounded-xl border border-shafx-border bg-shafx-surface px-4 text-sm outline-none transition focus:border-shafx-accent" />
              {formMode === 'signup' && <><input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" required minLength={10} placeholder="Confirm password" className="min-h-12 w-full rounded-xl border border-shafx-border bg-shafx-surface px-4 text-sm outline-none transition focus:border-shafx-accent" /><input aria-hidden="true" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} className="absolute -left-[10000px] top-auto h-px w-px opacity-0" /></>}
              <button disabled={submitting} type="submit" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-shafx-accent px-4 text-sm font-semibold text-white transition hover:bg-shafx-primaryHover disabled:opacity-60">{formMode === 'signin' ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}{submitting ? 'Please wait…' : formMode === 'signin' ? 'Continue to workspace' : 'Create SHAFX account'}<ArrowRight className="h-4 w-4 opacity-70" /></button>
              {formMode === 'signin' && <button type="button" onClick={() => { setForgotMode(true); setMessage(null) }} className="w-full py-1 text-[11px] text-shafx-textMuted hover:text-shafx-accent">Forgot password?</button>}
            </>}
          </form>
          {(message || error) && <div className="mt-4 rounded-xl border border-shafx-border bg-shafx-surface px-3 py-2.5 text-xs leading-5 text-shafx-textMuted">{message || error}</div>}
          {forgotMode && <button type="button" onClick={() => { setForgotMode(false); setMessage(null) }} className="mt-3 w-full text-[11px] text-shafx-textMuted hover:text-shafx-text">Back to sign in</button>}
          <div className="mt-8 flex items-start gap-2 border-t border-shafx-border pt-5 text-[10px] leading-5 text-shafx-textMuted"><LockKeyhole className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-shafx-accent" /><span>Credentials for connected providers remain behind the SHAFX server-side secret boundary. Your SHAFX sign-in is separate from your broker credentials.</span></div>
          <div className="mt-3 flex items-center gap-2 text-[10px] text-shafx-textMuted"><ShieldCheck className="h-3.5 w-3.5 text-shafx-success" />Simulation-first access • explicit execution release gates</div>
        </div>
      </section>
    </div>
  </main>
}
