import React, { useEffect, useState } from 'react'
import { ArrowRight, Bot, KeyRound, LockKeyhole, LogIn, ShieldCheck, Sparkles, UserPlus } from 'lucide-react'
import { useAuth } from '../../app/AuthContext'
import { ShafxIntroMark, ShafxBrandMark, ShafxWordmark } from '../brand/ShafxBrand'

type FormMode = 'signin' | 'signup'

async function publicAuthRequest(action: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/auth?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({ ok: false, error: 'Unexpected SHARFX identity response.' }))
  if (!response.ok || !data.ok) throw new Error(data.error || 'SHARFX identity request failed.')
  return data
}

export const PublicWelcome: React.FC = () => {
  const [brandIntroVisible, setBrandIntroVisible] = useState(() => {
    if (typeof window === 'undefined') return true
    try {
      const suppressed = window.sessionStorage.getItem('shafx-suppress-landing-intro') === '1'
      if (suppressed) window.sessionStorage.removeItem('shafx-suppress-landing-intro')
      return !suppressed
    } catch {
      return true
    }
  })

  useEffect(() => {
    const timer = window.setTimeout(() => setBrandIntroVisible(false), 850)
    return () => window.clearTimeout(timer)
  }, [])
  const [showAuth, setShowAuth] = useState(false)
  const [formMode, setFormMode] = useState<FormMode>('signin')
  const [forgotMode, setForgotMode] = useState(false)
  const [resetToken, setResetToken] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [verificationStep, setVerificationStep] = useState<'none' | 'signup'>('none')
  const [verificationCode, setVerificationCode] = useState('')
  const [codeRequested, setCodeRequested] = useState(false)
  const [resendCountdown, setResendCountdown] = useState(0)
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirm, setResetConfirm] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [website, setWebsite] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const { signIn, signUp, requestVerificationCode, verifyEmailCode, error } = useAuth()
  useEffect(() => {
    if (resendCountdown <= 0) return
    const timer = window.setTimeout(() => setResendCountdown((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [resendCountdown])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('auth') !== 'reset') return
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const token = hash.get('access_token')
    if (token) {
      setResetToken(token)
      setShowAuth(true)
    }
  }, [])

  const openAuth = (mode: FormMode): void => {
    setFormMode(mode)
    setForgotMode(false)
    setMessage(null)
    setVerificationStep('none')
    setVerificationCode('')
    setCodeRequested(false)
    setResendCountdown(0)
    setShowAuth(true)
  }

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
      } else if (verificationStep === 'signup') {
        if (!/^\d{6}$/.test(verificationCode)) { setMessage('Enter the 6-digit code from your email.'); return }
        await verifyEmailCode({ email, code: verificationCode })
        setVerificationStep('none')
        setVerificationCode('')
        setCodeRequested(false)
      } else if (formMode === 'signup') {
        if (password.length < 10) { setMessage('Password must be at least 10 characters.'); return }
        if (password !== confirmPassword) { setMessage('Passwords do not match.'); return }
        const result = await signUp({ displayName, email, password, website })
        if (result.needsEmailConfirmation) {
          setVerificationStep('signup')
          setVerificationCode('')
          setCodeRequested(true)
          setPassword('')
          setMessage('Your account is created. We sent a verification code to your email. Copy it from Gmail and enter it below.')
        } else {
          setMessage(result.message || 'Your SHARFX account is ready.')
        }
      } else {
        const result = await signIn({ email, password })
        setMessage(result.message || 'Login successful.')
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to complete SHARFX account request.')
    } finally {
      setSubmitting(false)
    }
  }

  if (showAuth) {
    const title = resetToken ? 'Create a new password' : forgotMode ? 'Recover your account' : verificationStep === 'signup' ? 'Verify your email' : formMode === 'signin' ? 'Welcome back' : 'Create your SHARFX account'
    const subtitle = resetToken ? 'Set a new password and return to your workspace.' : forgotMode ? 'We will send a secure reset link to your account email.' : verificationStep === 'signup' ? `Enter the 6-digit code sent to ${email}. It is single-use and expires automatically.` : formMode === 'signin' ? 'Sign in with your email and password.' : 'Create your SHARFX identity with an email and password, then verify your email.'

    return <main className="min-h-[calc(100vh-28px)] overflow-y-auto bg-shafx-bg text-shafx-text">
      <div className="mx-auto flex min-h-[calc(100vh-28px)] w-full max-w-[1480px] items-center justify-center px-4 py-8 sm:px-8">
        <div className="w-full max-w-md">
          <button type="button" onClick={() => { setShowAuth(false); setForgotMode(false); setMessage(null) }} className="mb-6 flex items-center gap-2 text-[11px] text-shafx-textMuted hover:text-shafx-text"><ArrowRight className="h-3.5 w-3.5 rotate-180" />Back to SHARFX welcome</button>
          <div className="mb-7 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-shafx-accent/30 bg-shafx-accent/[0.06]"><ShafxBrandMark size={31} /></div><div><div className="font-semibold tracking-tight">SHARFX</div><div className="text-[9px] uppercase tracking-[0.24em] text-shafx-textMuted">Market workspace</div></div></div>
          <div className="mb-7"><div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-shafx-textMuted">Secure access</div><h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1><p className="mt-2 text-sm leading-6 text-shafx-textMuted">{subtitle}</p></div>
          {!resetToken && !forgotMode && verificationStep === 'none' && <div className="grid grid-cols-2 rounded-xl border border-shafx-border bg-shafx-surface p-1"><button type="button" onClick={() => { setFormMode('signin'); setMessage(null); setVerificationStep('none') }} className={`min-h-11 rounded-lg text-xs font-semibold transition ${formMode === 'signin' ? 'bg-shafx-accent text-white shadow-lg shadow-shafx-accent/10' : 'text-shafx-textMuted hover:text-shafx-text'}`}>Login</button><button type="button" onClick={() => { setFormMode('signup'); setMessage(null); setVerificationStep('none') }} className={`min-h-11 rounded-lg text-xs font-semibold transition ${formMode === 'signup' ? 'bg-shafx-accent text-white shadow-lg shadow-shafx-accent/10' : 'text-shafx-textMuted hover:text-shafx-text'}`}>Create account</button></div>}
          <form onSubmit={(event) => void submit(event)} className="mt-5 space-y-3">
            {resetToken ? <><input value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} type="password" autoComplete="new-password" required minLength={10} placeholder="New password" className="min-h-12 w-full rounded-xl border border-shafx-border bg-shafx-surface px-4 text-sm outline-none focus:border-shafx-accent" /><input value={resetConfirm} onChange={(event) => setResetConfirm(event.target.value)} type="password" autoComplete="new-password" required minLength={10} placeholder="Confirm new password" className="min-h-12 w-full rounded-xl border border-shafx-border bg-shafx-surface px-4 text-sm outline-none focus:border-shafx-accent" /><button disabled={submitting} type="submit" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-shafx-accent px-4 text-sm font-semibold text-white disabled:opacity-60"><KeyRound className="h-4 w-4" />{submitting ? 'Updating…' : 'Update password'}</button></> : forgotMode ? <><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required placeholder="Email address" className="min-h-12 w-full rounded-xl border border-shafx-border bg-shafx-surface px-4 text-sm outline-none focus:border-shafx-accent" /><button disabled={submitting} type="submit" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-shafx-accent px-4 text-sm font-semibold text-white disabled:opacity-60"><KeyRound className="h-4 w-4" />{submitting ? 'Sending…' : 'Send reset link'}</button></> : <>
              {verificationStep === 'signup' ? <>
              <input value={email} readOnly type="email" autoComplete="email" required placeholder="Email address" className="min-h-12 w-full rounded-xl border border-shafx-border bg-shafx-surface px-4 text-sm outline-none opacity-80" />
              <>
                <input value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" required placeholder="000000" className="min-h-12 w-full rounded-xl border border-shafx-border bg-shafx-surface px-4 text-center text-lg font-mono tracking-[0.35em] outline-none focus:border-shafx-accent" />
                <button disabled={submitting} type="submit" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-shafx-accent px-4 text-sm font-semibold text-white disabled:opacity-60"><KeyRound className="h-4 w-4" />{submitting ? 'Verifying…' : 'Verify code'}</button>
                <button type="button" disabled={submitting || resendCountdown > 0} onClick={async () => { try { setSubmitting(true); setMessage(null); const result = await requestVerificationCode(email); setResendCountdown(Math.max(0, Number(result.retryAfterSeconds || 0))); setMessage(result.message || 'A new verification code has been sent.'); } catch (err) { setMessage(err instanceof Error ? err.message : 'Unable to resend the code.'); } finally { setSubmitting(false) } }} className="w-full py-2 text-[11px] text-shafx-textMuted hover:text-shafx-accent disabled:opacity-50">{resendCountdown > 0 ? `Didn't receive it? Request another code in ${resendCountdown}s` : 'Resend verification code'}</button>
              </>
              <button type="button" onClick={() => { setVerificationStep('none'); setVerificationCode(''); setCodeRequested(false); setResendCountdown(0); setMessage(null) }} className="w-full py-1 text-[11px] text-shafx-textMuted hover:text-shafx-accent">Back to email and password</button>
            </> : <>
              {formMode === 'signup' && <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Full name" className="min-h-12 w-full rounded-xl border border-shafx-border bg-shafx-surface px-4 text-sm outline-none focus:border-shafx-accent" />}
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required placeholder="Email address" className="min-h-12 w-full rounded-xl border border-shafx-border bg-shafx-surface px-4 text-sm outline-none focus:border-shafx-accent" />{formMode === 'signin' && <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required minLength={10} placeholder="Password" className="min-h-12 w-full rounded-xl border border-shafx-border bg-shafx-surface px-4 text-sm outline-none focus:border-shafx-accent" />}
              {formMode === 'signup' && <><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" required minLength={10} placeholder="Password (minimum 10 characters)" className="min-h-12 w-full rounded-xl border border-shafx-border bg-shafx-surface px-4 text-sm outline-none focus:border-shafx-accent" /><input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" required minLength={10} placeholder="Confirm password" className="min-h-12 w-full rounded-xl border border-shafx-border bg-shafx-surface px-4 text-sm outline-none focus:border-shafx-accent" /><input aria-hidden="true" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} className="absolute -left-[10000px] top-auto h-px w-px opacity-0" /></>}
              <button disabled={submitting} type="submit" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-shafx-accent px-4 text-sm font-semibold text-white disabled:opacity-60">{formMode === 'signin' ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}{submitting ? 'Please wait…' : formMode === 'signin' ? 'Login to SHARFX' : 'Create SHARFX account'}<ArrowRight className="h-4 w-4 opacity-70" /></button>
              {formMode === 'signin' && <button type="button" onClick={() => { setForgotMode(true); setMessage(null) }} className="w-full py-1 text-[11px] text-shafx-textMuted hover:text-shafx-accent">Forgot password?</button>}
            </>}
            </>}
          </form>
          {(message || error) && <div className="mt-4 rounded-xl border border-shafx-border bg-shafx-surface px-3 py-2.5 text-xs leading-5 text-shafx-textMuted">{message || error}</div>}
          {forgotMode && <button type="button" onClick={() => { setForgotMode(false); setMessage(null) }} className="mt-3 w-full text-[11px] text-shafx-textMuted hover:text-shafx-text">Back to login</button>}
          <div className="mt-8 flex items-start gap-2 border-t border-shafx-border pt-5 text-[10px] leading-5 text-shafx-textMuted"><LockKeyhole className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-shafx-accent" /><span>SHARFX identity is separate from connected provider credentials. Provider secrets remain behind the server-side boundary.</span></div>
        </div>
      </div>
    </main>
  }

  return <main className="relative min-h-[calc(100vh-28px)] overflow-hidden bg-shafx-bg text-shafx-text">
    <div className={brandIntroVisible ? 'shafx-brand-intro' : 'shafx-brand-intro shafx-brand-intro--done'} aria-hidden="true">
      <div className="shafx-brand-intro__grid" />
      <div className="shafx-brand-intro__scan" />
      <div className="shafx-brand-intro__mark"><ShafxIntroMark /></div>
      <div className="shafx-brand-intro__word"><ShafxWordmark /></div>
      <div className="shafx-brand-intro__line" />
      <div className="shafx-brand-intro__tag">DIGITAL ASSETS • MARKET INSIGHTS • GLOBAL TRADE</div>
    </div>
    <div className="absolute inset-0 shafx-grid opacity-50" />
    <div className="absolute -left-32 top-20 h-96 w-96 rounded-full bg-shafx-accent/10 blur-3xl" />
    <div className="absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-shafx-success/5 blur-3xl" />
    <div className="relative z-10 mx-auto flex min-h-[calc(100vh-28px)] w-full max-w-7xl flex-col px-5 py-8 sm:px-8 lg:px-12">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-shafx-accent/30 bg-shafx-accent/[0.06]"><ShafxBrandMark size={31} /></div><div><ShafxWordmark compact /><div className="mt-1 text-[8px] uppercase tracking-[0.28em] text-shafx-textMuted">AI-powered market workspace</div></div></div>
      </header>

      <section className="flex flex-1 items-center py-12 lg:py-16">
        <div className="grid w-full items-center gap-12 lg:grid-cols-[1.05fr_.95fr] lg:gap-16">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-shafx-accent/20 bg-shafx-accent/5 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-shafx-accent"><Sparkles className="h-3 w-3" />Trade with more clarity</div>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-6xl lg:text-7xl">Welcome to <span className="text-shafx-accent">SHARFX.</span></h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-shafx-textMuted sm:text-lg">SHARFX is built to help you trade more easily with AI agents, market intelligence and a professional trading interface — all in one workspace.</p>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] text-shafx-textMuted"><span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-shafx-success" />Simulation-first access</span><span className="flex items-center gap-1.5"><LockKeyhole className="h-3.5 w-3.5 text-shafx-accent" />Provider credentials separated</span></div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-3xl border border-shafx-border bg-shafx-surface/75 p-5 backdrop-blur-sm lg:p-6"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-shafx-accent/10 text-shafx-accent"><Sparkles className="h-5 w-5" /></div><div className="mt-4 text-sm font-semibold">AI market intelligence</div><p className="mt-2 text-xs leading-5 text-shafx-textMuted">Use SHARFX analysis and agents alongside your own decisions, with structure, liquidity and risk context in one place.</p></div>
            <div className="rounded-3xl border border-shafx-border bg-shafx-surface/75 p-5 backdrop-blur-sm lg:p-6"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-shafx-success/10 text-shafx-success"><Bot className="h-5 w-5" /></div><div className="mt-4 text-sm font-semibold">Professional workflow</div><p className="mt-2 text-xs leading-5 text-shafx-textMuted">Chart, research, replay, backtesting, trading tools and the SHARFX Bot are designed around one workspace.</p></div>
            <div className="rounded-3xl border border-shafx-border bg-shafx-surface/75 p-5 backdrop-blur-sm lg:p-6"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5"><ShafxBrandMark size={31} /></div><div className="mt-4 text-sm font-semibold">Adaptive by provider</div><p className="mt-2 text-xs leading-5 text-shafx-textMuted">SHARFX keeps its own interface while supported providers supply the account, market and execution capabilities they actually expose.</p></div>
          </div>
        </div>
      </section>

      <section className="mt-auto border-t border-shafx-border pt-7">
        <div className="rounded-3xl border border-shafx-accent/20 bg-shafx-accent/[0.045] p-5 sm:p-6 lg:flex lg:items-center lg:justify-between lg:gap-8">
          <div className="max-w-xl">
            <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-shafx-accent">Ready when you are</div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">Enter the SHARFX workspace.</h2>
            <p className="mt-2 text-xs leading-5 text-shafx-textMuted">Create your account first. You can then choose the simulator or connect a supported provider.</p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5 lg:mt-0 lg:w-[360px]">
            <button type="button" onClick={() => openAuth('signup')} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-shafx-accent px-4 text-xs font-semibold text-white shadow-xl shadow-shafx-accent/15 hover:bg-shafx-primaryHover"><UserPlus className="h-4 w-4" />Create account</button>
            <button type="button" onClick={() => openAuth('signin')} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-shafx-border bg-shafx-surface px-4 text-xs font-semibold hover:border-shafx-accent/40"><LogIn className="h-4 w-4" />Login</button>
          </div>
        </div>
        <footer className="pt-5 text-[10px] leading-5 text-shafx-textMuted">SHARFX is a trading and market-analysis workspace. Create an account to enter the simulator or continue to supported provider connections.</footer>
      </section>
    </div>
  </main>
}
