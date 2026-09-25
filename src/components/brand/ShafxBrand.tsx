import React, { useEffect } from 'react'

interface BrandMarkProps {
  size?: number
  className?: string
  title?: string
}

const BrandDefs: React.FC<{ prefix: string }> = ({ prefix }) => (
  <defs>
    <linearGradient id={`${prefix}-blue`} x1="28" y1="8" x2="88" y2="112" gradientUnits="userSpaceOnUse">
      <stop offset="0" stopColor="#2AD7FF" />
      <stop offset=".42" stopColor="#087DFF" />
      <stop offset="1" stopColor="#0345A7" />
    </linearGradient>
    <linearGradient id={`${prefix}-blue-edge`} x1="26" y1="20" x2="94" y2="105" gradientUnits="userSpaceOnUse">
      <stop stopColor="#7BE8FF" />
      <stop offset=".45" stopColor="#159DFF" />
      <stop offset="1" stopColor="#0B4CB5" />
    </linearGradient>
    <linearGradient id={`${prefix}-gold`} x1="38" y1="96" x2="100" y2="18" gradientUnits="userSpaceOnUse">
      <stop stopColor="#FF8A00" />
      <stop offset=".5" stopColor="#FFB51B" />
      <stop offset="1" stopColor="#FFE27A" />
    </linearGradient>
    <linearGradient id={`${prefix}-gold-edge`} x1="44" y1="100" x2="96" y2="16" gradientUnits="userSpaceOnUse">
      <stop stopColor="#A84400" />
      <stop offset=".45" stopColor="#FF8C00" />
      <stop offset="1" stopColor="#FFF0A0" />
    </linearGradient>
    <radialGradient id={`${prefix}-ring`} cx="50%" cy="50%" r="50%">
      <stop offset=".76" stopColor="#0B1728" stopOpacity="0" />
      <stop offset=".88" stopColor="#1A9DFF" stopOpacity=".75" />
      <stop offset=".94" stopColor="#FFAE19" stopOpacity=".7" />
      <stop offset="1" stopColor="#0B1728" stopOpacity="0" />
    </radialGradient>
    <filter id={`${prefix}-glow`} x="-35%" y="-35%" width="170%" height="170%">
      <feGaussianBlur stdDeviation="2.1" result="blur" />
      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
    <filter id={`${prefix}-shadow`} x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="3" stdDeviation="2.8" floodColor="#000000" floodOpacity=".55" />
    </filter>
  </defs>
)

const LogoGeometry: React.FC<{ prefix: string; animated?: boolean }> = ({ prefix, animated = false }) => (
  <>
    <circle cx="60" cy="60" r="49" fill={`url(#${prefix}-ring)`} opacity=".55" className={animated ? 'shafx-logo-ring' : undefined} />
    <circle cx="60" cy="60" r="46" fill="none" stroke="#168FFF" strokeOpacity=".20" strokeWidth="1.2" className={animated ? 'shafx-logo-ring-outer' : undefined} />
    <g className={animated ? 'shafx-logo-s' : undefined} filter={`url(#${prefix}-shadow)`}>
      <path
        d="M83 20C70 10 51 11 38 19 24 28 21 43 30 53c6 7 16 10 29 12 13 2 19 6 17 13-3 9-15 13-28 11-11-1-20-6-27-14L10 90c10 13 26 20 44 20 25 0 45-12 51-31 5-18-7-30-30-35-14-3-20-6-18-13 2-7 11-11 20-10 8 1 16 4 22 9Z"
        fill={`url(#${prefix}-blue)`}
      />
      <path d="M31 30C44 19 63 17 79 23" fill="none" stroke="#8EEBFF" strokeWidth="2.2" strokeLinecap="round" opacity=".7" />
      <path d="M21 86C30 99 47 106 62 103" fill="none" stroke={`url(#${prefix}-blue-edge)`} strokeWidth="3" strokeLinecap="round" opacity=".8" />
    </g>
    <g className={animated ? 'shafx-logo-x' : undefined} filter={`url(#${prefix}-shadow)`}>
      <path d="M41 28 88 101" fill="none" stroke={`url(#${prefix}-gold-edge)`} strokeWidth="11" strokeLinecap="round" />
      <path d="M79 27 37 101" fill="none" stroke={`url(#${prefix}-gold)`} strokeWidth="11" strokeLinecap="round" />
      <path d="M41 28 88 101M79 27 37 101" fill="none" stroke="#FFE99A" strokeWidth="2.1" strokeLinecap="round" opacity=".58" />
    </g>
    <path className={animated ? 'shafx-logo-lock' : undefined} d="M36 30 84 99" fill="none" stroke="#FFF0A8" strokeWidth="1.8" strokeLinecap="round" opacity=".55" />
  </>
)

export const ShafxBrandMark: React.FC<BrandMarkProps> = ({ size = 36, className = '', title = 'SHARFX' }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={title} className={className}>
    <BrandDefs prefix="brand" />
    <LogoGeometry prefix="brand" />
  </svg>
)

interface WordmarkProps { className?: string; compact?: boolean }

export const ShafxWordmark: React.FC<WordmarkProps> = ({ className = '', compact = false }) => (
  <span
    className={['font-black uppercase leading-none tracking-[0.12em]', compact ? 'text-sm' : 'text-4xl sm:text-5xl', className].join(' ')}
    aria-label="SHARFX"
  >
    <span className="shafx-wordmark-silver">SHAR</span><span className="shafx-wordmark-blue">F</span><span className="shafx-wordmark-gold">X</span>
  </span>
)

export const ShafxIntroMark: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={className} aria-hidden="true">
    <svg viewBox="0 0 120 120" className="h-full w-full overflow-visible">
      <BrandDefs prefix="intro" />
      <LogoGeometry prefix="intro" animated />
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
