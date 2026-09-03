import { useId, useLayoutEffect, useRef, useState } from 'react'

const EASE = 'cubic-bezier(0.65,0,0.35,1)'
const DURATION = '450ms'
const GAP = 4

// Brand colors the mark draws from directly (not Tailwind classes — this is
// raw SVG, stroked/filled outside the DOM's cascade), matching the design
// tokens in index.css exactly: electric-violet, deep-violet, and ice, plus
// the cyan accent the app's own live-cursor palette (VoiceBar /
// remoteCursors.js) already uses for a second participant's presence.
const VIOLET = '#8B5CF6'
const DEEP_VIOLET = '#7C3AED'
const CYAN = '#38BDF8'
const ICE = '#D8EAFF'

// The mark's gradient id is unique per mounted instance (via useId) — SVG
// gradient/filter ids are global to the document, so two <Logo>s on the same
// page (e.g. the animated navbar copy and a static one) would otherwise
// silently share/clobber a hardcoded id.
function useMarkGradient() {
  const rawId = useId().replace(/:/g, '')
  const id = `logo-gradient-${rawId}`
  const defs = (
    <linearGradient id={id} x1="2" y1="4" x2="30" y2="28" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stopColor={VIOLET} />
      <stop offset="100%" stopColor={DEEP_VIOLET} />
    </linearGradient>
  )
  return { id, defs }
}

// Soft halo behind the prompt's epicenter — feGaussianBlur duplicated under
// the crisp source via feMerge, rather than replacing it, so the glow bleeds
// out from behind a still pin-sharp dot.
function useGlowFilter(stdDeviation = 1.2) {
  const rawId = useId().replace(/:/g, '')
  const id = `logo-glow-${rawId}`
  const defs = (
    <filter id={id} x="-75%" y="-75%" width="250%" height="250%">
      <feGaussianBlur stdDeviation={stdDeviation} result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  )
  return { id, defs }
}

// "Resonant Terminal" — DevSangam's permanent mark. A prompt chevron (`>`)
// whose tip sits at the epicenter of three concentric wave arcs, fading in
// opacity with distance like dissipating audio; the outermost arc is capped
// with a small pinch-tick so its curve reads as a closing `}`. One shape
// carrying both of the app's signature capabilities — live code editing and
// spatial voice collaboration — rather than two separate glyphs bolted
// together. Pure SVG (no raster asset) so it stays pixel-crisp at any
// navbar size.
function LogoMark({ size }) {
  const { id, defs: gradientDefs } = useMarkGradient()
  const { id: glowId, defs: glowDefs } = useGlowFilter()
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className="block shrink-0" aria-hidden="true">
      <defs>
        {gradientDefs}
        {glowDefs}
      </defs>
      <circle cx="12" cy="16" r="1.8" fill={VIOLET} opacity="0.55" filter={`url(#${glowId})`} />
      <path d="M12 6A10 10 0 0 1 12 26" stroke={ICE} strokeWidth={2} strokeLinecap="round" opacity="0.45" />
      <path d="M12 9A7 7 0 0 1 12 23" stroke={`url(#${id})`} strokeWidth={2} strokeLinecap="round" opacity="0.75" />
      <path d="M12 12A4 4 0 0 1 12 20" stroke={CYAN} strokeWidth={2} strokeLinecap="round" />
      <path d="M21 14.4 23.2 16 21 17.6" stroke={ICE} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
      <path d="M6 11 12 16 6 21" stroke={VIOLET} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// The Atlantic-style scroll transform: at the top the two words sit inline
// as "DevSangam"; past the scroll threshold "Sangam" translates below "Dev"
// into a stacked 2-line lockup. This needs the words' rendered pixel widths
// to position them, which only exists to serve Landing.jsx's navbar — so it
// stays split out from the plain `Logo` below rather than adding
// measurement/absolute-positioning risk to every other call site (Dashboard,
// Workspace, AuthCard, footer) that never animates and gains nothing from it.
function AnimatedWordmark({ scrolled }) {
  const devRef = useRef(null)
  const sangamRef = useRef(null)
  // Seeded with a rough character-count estimate, not {dev:0, sangam:0} —
  // both spans below are position:absolute, so an unmeasured 0-width
  // container has nothing to shrink-to-fit around and collapses to ~0px
  // with overflow-hidden clipping the wordmark to a sliver of "D" for one
  // frame, before useLayoutEffect's real measurement lands. The estimate
  // just has to be close enough to avoid that collapse; the effect below
  // still corrects it to the exact rendered width immediately.
  const [sizes, setSizes] = useState({ dev: 28, sangam: 56 })

  useLayoutEffect(() => {
    function measure() {
      setSizes({
        dev: devRef.current?.getBoundingClientRect().width || 0,
        sangam: sangamRef.current?.getBoundingClientRect().width || 0,
      })
    }
    measure()
    document.fonts?.ready?.then(measure)
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const inlineWidth = sizes.dev + GAP + sizes.sangam
  const stackedWidth = Math.max(sizes.dev, sizes.sangam)

  return (
    <span
      className="relative block overflow-hidden font-display text-base font-medium leading-[1.15] text-ice"
      style={{
        height: scrolled ? '2.3em' : '1.15em',
        width: (scrolled ? stackedWidth : inlineWidth) || 'auto',
        transition: `height ${DURATION} ${EASE}, width ${DURATION} ${EASE}`,
      }}
    >
      <span ref={devRef} className="absolute left-0 top-0 tracking-tight">
        Dev
      </span>
      <span
        ref={sangamRef}
        className="absolute left-0 top-0 tracking-tight"
        style={{
          transform: scrolled ? 'translate(0, 1.15em)' : `translate(${sizes.dev + GAP}px, 0)`,
          transition: `transform ${DURATION} ${EASE}`,
        }}
      >
        Sangam
      </span>
    </span>
  )
}

// `animated` opts into the scroll-stacking transform above (Landing.jsx's
// navbar only, paired with `scrolled`). Every other caller renders the
// wordmark as plain static text — no measurement, no absolute positioning,
// nothing that can collapse or race on first paint.
export default function Logo({ iconSize = 26, className = '', scrolled = false, animated = false }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark size={iconSize} />
      {animated ? (
        <AnimatedWordmark scrolled={scrolled} />
      ) : (
        <span className="font-display text-base font-medium leading-none tracking-tight text-ice">DevSangam</span>
      )}
    </div>
  )
}
