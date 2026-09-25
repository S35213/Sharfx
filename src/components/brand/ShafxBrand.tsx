import React, { useEffect } from 'react'

interface BrandMarkProps {
  size?: number
  className?: string
  title?: string
}

export const ShafxBrandMark: React.FC<BrandMarkProps> = ({ size = 36, className = '', title = 'SHARFX' }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={title} className={className}>
    <defs>
      <linearGradient id="shafx-blue" x1="15" y1="12" x2="98" y2="108" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#1677FF" /><stop offset=".48" stopColor="#00C9FF" /><stop offset="1" stopColor="#0757D6" />
      </linearGradient>
      <linearGradient id="shafx-orange" x1="35" y1="96" x2="105" y2="18" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#FF7A00" /><stop offset=".55" stopColor="#FFAA00" /><stop offset="1" stopColor="#FFD24A" />
      </linearGradient>
      <filter id="shafx-glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="2.3" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
    <path d="M78 24C66 15 48 14 35 22 20 31 18 48 29 58c7 6 17 8 29 10 13 2 19 5 17 12-3 9-16 13-29 11-10-1-19-6-25-13l-10 14c9 11 24 18 40 18 23 0 42-11 47-28 5-17-8-28-29-32-13-2-20-5-18-12 2-7 10-10 19-9 8 1 15 4 21 9l10-14Z" fill="url(#shafx-blue)" filter="url(#shafx-glow)" />
    <path d="M61 29 96 99M96 29 61 99" fill="none" stroke="url(#shafx-orange)" stroke-width="9" stroke-linecap="round" />
    <path d="M57 25 100 103" fill="none" stroke="#FFD24A" stroke-width="2.5" stroke-linecap="round" opacity=".55" />
  </svg>
)

interface WordmarkProps { className?: string; compact?: boolean }

export const ShafxWordmark: React.FC<WordmarkProps> = ({ className = '', compact = false }) => (
  <span
    className={['font-black uppercase leading-none tracking-[0.12em]', compact ? 'text-sm' : 'text-4xl sm:text-5xl', className].join(' ')}
    style={{
      backgroundImage: 'linear-gradient(180deg,#F8FBFF 0%,#D6DCE5 44%,#8D98A8 100%)',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
      textShadow: compact ? '0 0 18px rgba(22,119,255,.10)' : '0 8px 32px rgba(0,0,0,.45)',
    }}
  >
    SHARFX
  </span>
)

export const ShafxIntroMark: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={className} aria-hidden="true">
    <svg viewBox="0 0 220 220" className="h-full w-full overflow-visible">
      <defs>
        <linearGradient id="intro-blue" x1="22" y1="12" x2="170" y2="200" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0A5BFF" /><stop offset=".52" stopColor="#00D2FF" /><stop offset="1" stopColor="#0B5CDA" />
        </linearGradient>
        <linearGradient id="intro-orange" x1="60" y1="190" x2="200" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FF6A00" /><stop offset=".6" stopColor="#FFAB00" /><stop offset="1" stopColor="#FFE06A" />
        </linearGradient>
        <filter id="intro-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <path className="shafx-intro-blue" d="M145 38C126 24 98 23 77 35 52 49 49 76 66 92c12 12 28 15 47 18 21 4 30 9 27 20-4 15-25 22-46 19-17-2-31-9-42-21l-16 22c15 18 38 29 65 29 38 0 68-18 76-45 8-28-12-46-48-53-21-4-32-9-29-19 3-11 17-16 31-14 13 2 24 7 34 15l16-22Z" fill="url(#intro-blue)" filter="url(#intro-glow)" />
      <path className="shafx-intro-orange" d="M123 56 183 169M183 56 123 169" fill="none" stroke="url(#intro-orange)" stroke-width="14" stroke-linecap="round" />
      <path className="shafx-intro-x" d="M118 49 189 176" fill="none" stroke="#FFE06A" stroke-width="4" stroke-linecap="round" opacity=".6" />
    </svg>
  </div>
)


export type ShafxBrandTransitionKind = 'welcome' | 'goodbye'

export const SHAFX_BRAND_TRANSITION_EVENT = 'shafx:brand-transition'

export const triggerShafxBrandTransition = (kind: ShafxBrandTransitionKind): void => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<{ kind: ShafxBrandTransitionKind }>(SHAFX_BRAND_TRANSITION_EVENT, { detail: { kind } }))
}

export const ShafxBrandTransition: React.FC<{
  kind: ShafxBrandTransitionKind
  onDone: () => void
}> = ({ kind, onDone }) => {
  useEffect(() => {
    const duration = 3150
    const timer = window.setTimeout(onDone, duration)
    return () => window.clearTimeout(timer)
  }, [onDone])

  const welcome = kind === 'welcome'
  return (
    <div className={`shafx-brand-transition ${welcome ? 'shafx-brand-transition--welcome' : 'shafx-brand-transition--goodbye'}`} role="status" aria-live="polite">
      <div className="shafx-brand-transition__grid" />
      <div className="shafx-brand-transition__scan" />
      <div className="shafx-brand-transition__halo shafx-brand-transition__halo--one" />
      <div className="shafx-brand-transition__halo shafx-brand-transition__halo--two" />
      <div className="shafx-brand-transition__mark">
        <ShafxIntroMark />
      </div>
      <div className="shafx-brand-transition__word"><ShafxWordmark /></div>
      <div className="shafx-brand-transition__headline">{welcome ? 'WELCOME TO SHARFX' : 'GOODBYE'}</div>
      <div className="shafx-brand-transition__subline">{welcome ? 'SECURE SESSION ESTABLISHED' : 'SESSION CLOSED • SEE YOU AGAIN'}</div>
      <div className="shafx-brand-transition__progress" />
    </div>
  )
}
