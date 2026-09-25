import React, { useEffect } from 'react'

interface BrandMarkProps {
  size?: number
  className?: string
  title?: string
}

const SHARFX_LOGO_SRC = '/sharfx-logo-v2.webp'

export const ShafxBrandMark: React.FC<BrandMarkProps> = ({ size = 36, className = '', title = 'SHARFX' }) => (
  <img
    src={SHARFX_LOGO_SRC}
    width={size}
    height={size}
    alt={title}
    aria-label={title}
    className={`shafx-brand-image ${className}`}
    decoding="async"
  />
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
  <div className={`shafx-logo-assembly ${className}`} aria-hidden="true">
    <img
      src={SHARFX_LOGO_SRC}
      alt=""
      className="shafx-logo-assembly__piece shafx-logo-assembly__piece--left"
      decoding="async"
      draggable={false}
    />
    <img
      src={SHARFX_LOGO_SRC}
      alt=""
      className="shafx-logo-assembly__piece shafx-logo-assembly__piece--right"
      decoding="async"
      draggable={false}
    />
    <div className="shafx-logo-assembly__flash" />
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
    const duration = 1900
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
