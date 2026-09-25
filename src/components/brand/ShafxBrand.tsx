import React, { useEffect } from 'react'

interface BrandMarkProps { size?: number; className?: string; title?: string }

const BrandSvg: React.FC<{ size?: number; className?: string; animated?: boolean; title?: string }> = ({ size = 36, className = '', animated = false, title = 'SHARFX' }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={title} className={className} focusable="false">
    <defs>
      <linearGradient id={animated ? 'isblue' : 'bsblue'} x1="15" y1="10" x2="95" y2="112" gradientUnits="userSpaceOnUse">
        <stop stopColor="#72ECFF"/><stop offset=".34" stopColor="#11A8FF"/><stop offset=".72" stopColor="#1265E8"/><stop offset="1" stopColor="#083A8C"/>
      </linearGradient>
      <linearGradient id={animated ? 'isgold' : 'bsgold'} x1="28" y1="108" x2="100" y2="16" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FF7A00"/><stop offset=".5" stopColor="#FFB51A"/><stop offset="1" stopColor="#FFE47A"/>
      </linearGradient>
      <linearGradient id={animated ? 'isring' : 'bsring'} x1="18" y1="18" x2="101" y2="103" gradientUnits="userSpaceOnUse">
        <stop stopColor="#14B4FF"/><stop offset=".52" stopColor="#59E5FF" stopOpacity=".25"/><stop offset="1" stopColor="#FFB018"/>
      </linearGradient>
      <filter id={animated ? 'isshadow' : 'bsshadow'} x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#000" floodOpacity=".55"/>
      </filter>
      <filter id={animated ? 'isglow' : 'bsglow'} x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <circle cx="60" cy="60" r="48" fill="none" stroke={`url(#${animated ? 'isring' : 'bsring'})`} strokeWidth="1.5" opacity=".55" className={animated ? 'shafx-logo-ring' : ''}/>
    <g filter={`url(#${animated ? 'isshadow' : 'bsshadow'})`} className={animated ? 'shafx-logo-s-piece' : ''}>
      <path d="M89 24C76 15 60 14 47 18 31 22 21 33 21 46c0 13 11 20 30 24l16 3c12 2 19 6 17 14-2 10-14 16-28 16-14 0-26-6-36-17L10 98c12 14 29 21 48 21 26 0 45-12 50-31 5-18-7-30-30-35l-17-4c-10-2-15-6-13-11 2-6 10-9 18-9 10 0 18 3 26 10l9-14c-4-1-8-2-12-1Z" fill={`url(#${animated ? 'isblue' : 'bsblue'})`}/>
      <path d="M31 34C41 20 61 16 79 22" fill="none" stroke="#B4F7FF" strokeWidth="2.1" strokeLinecap="round" opacity=".65"/>
      <path d="M20 91C30 105 47 112 64 108" fill="none" stroke="#6DE5FF" strokeWidth="2.5" strokeLinecap="round" opacity=".35"/>
    </g>
    <g filter={`url(#${animated ? 'isglow' : 'bsglow'})`} className={animated ? 'shafx-logo-x-piece' : ''}>
      <path d="M43 31L91 100" fill="none" stroke="#974800" strokeWidth="12" strokeLinecap="round"/>
      <path d="M79 28L35 101" fill="none" stroke={`url(#${animated ? 'isgold' : 'bsgold'})`} strokeWidth="10" strokeLinecap="round"/>
      <path d="M43 31L91 100M79 28L35 101" fill="none" stroke="#FFF0A0" strokeWidth="2" strokeLinecap="round" opacity=".62"/>
    </g>
  </svg>
)

export const ShafxBrandMark: React.FC<BrandMarkProps> = ({ size = 36, className = '', title = 'SHARFX' }) => <BrandSvg size={size} className={className} title={title} />

interface WordmarkProps { className?: string; compact?: boolean }

export const ShafxWordmark: React.FC<WordmarkProps> = ({ className = '', compact = false }) => (
  <span className={['font-black uppercase leading-none tracking-[0.12em]', compact ? 'text-sm' : 'text-4xl sm:text-5xl', className].join(' ')} aria-label="SHARFX">
    <span className="shafx-wordmark-silver">SHAR</span><span className="shafx-wordmark-blue">F</span><span className="shafx-wordmark-gold">X</span>
  </span>
)

export const ShafxIntroMark: React.FC<{ className?: string }> = ({ className = '' }) => <div className={className} aria-hidden="true"><BrandSvg size={220} className="h-full w-full" animated /></div>

export type ShafxBrandTransitionKind = 'welcome' | 'goodbye'
export const SHAFX_BRAND_TRANSITION_EVENT = 'shafx:brand-transition'
export const triggerShafxBrandTransition = (kind: ShafxBrandTransitionKind): void => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<{ kind: ShafxBrandTransitionKind }>(SHAFX_BRAND_TRANSITION_EVENT, { detail: { kind } }))
}

export const ShafxBrandTransition: React.FC<{ kind: ShafxBrandTransitionKind; onDone: () => void }> = ({ kind, onDone }) => {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 1750)
    return () => window.clearTimeout(timer)
  }, [onDone])
  const welcome = kind === 'welcome'
  return (
    <div className={`shafx-brand-transition ${welcome ? 'shafx-brand-transition--welcome' : 'shafx-brand-transition--goodbye'}`} role="status" aria-live="polite">
      <div className="shafx-brand-transition__grid"/><div className="shafx-brand-transition__scan"/>
      <div className="shafx-brand-transition__halo shafx-brand-transition__halo--one"/><div className="shafx-brand-transition__halo shafx-brand-transition__halo--two"/>
      <div className="shafx-brand-transition__mark"><ShafxIntroMark/></div>
      <div className="shafx-brand-transition__word"><ShafxWordmark/></div>
      <div className="shafx-brand-transition__headline">{welcome ? 'WELCOME TO SHARFX' : 'GOODBYE'}</div>
      <div className="shafx-brand-transition__subline">{welcome ? 'SECURE SESSION ESTABLISHED' : 'SESSION CLOSED • SEE YOU AGAIN'}</div>
      <div className="shafx-brand-transition__progress"/>
    </div>
  )
}
