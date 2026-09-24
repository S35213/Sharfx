import React from 'react'

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
    <path d="M20 61c1-22 18-40 41-45 17-4 35 0 47 11L91 40c-8-7-19-9-29-6-13 3-22 13-24 25-2 11 3 21 12 27 8 5 18 5 26 1 8-4 13-11 14-19 1-5 0-10-3-14l19-13c8 11 11 24 8 37-4 17-15 31-31 38-18 8-39 7-56-3C24 94 19 78 20 61Z" fill="url(#shafx-blue)" filter="url(#shafx-glow)" />
    <path d="M22 91c25-12 49-30 72-53l16-17-5 25 10 11-22-2C70 76 49 91 27 101l-14 6 9-16Z" fill="url(#shafx-orange)" filter="url(#shafx-glow)" />
    <path d="M77 42 99 21l-5 22 14 14-23-2-8-13Z" fill="#18A9FF" opacity=".9" />
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
      <path className="shafx-intro-blue" d="M49 108C49 65 85 32 128 32c22 0 42 7 57 21l-22 21c-9-8-21-12-34-12-21 0-37 16-37 36 0 18 13 30 31 33 20 3 38-8 46-27l22-15c-3 31-19 58-48 71-30 13-68 8-91-12-20-18-31-41-29-60Z" fill="url(#intro-blue)" filter="url(#intro-glow)" />
      <path className="shafx-intro-orange" d="M35 168C76 149 121 119 168 75l25-25-9 31 18 17-34-3c-42 38-84 65-126 80l-21 8 14-15Z" fill="url(#intro-orange)" filter="url(#intro-glow)" />
      <path className="shafx-intro-x" d="M155 67 193 49l-11 31 22 21-35-4-15-26Z" fill="#1DBDFF" opacity=".95" />
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
