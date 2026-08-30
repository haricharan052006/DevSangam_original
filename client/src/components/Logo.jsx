import { useId, useLayoutEffect, useRef, useState } from 'react'

const EASE = 'cubic-bezier(0.65,0,0.35,1)'
const DURATION = '450ms'
const GAP = 4

// Vector mark: two interlocking code-bracket chevrons ("<" / ">") converging
// on a center node, stroked in an Electric Violet -> Ice Blue gradient. Pure
// SVG (no raster asset) so it stays pixel-crisp at any navbar size — replaces
// the old logo-icon.png/logo-full.png raster crops entirely.
function LogoMark({ size }) {
  const rawId = useId().replace(/:/g, '')
  const gradientId = `logo-gradient-${rawId}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className="block shrink-0"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="2" y1="4" x2="30" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#93C5FD" />
        </linearGradient>
      </defs>
      <path
        d="M12.5 6.5 4.5 16l8 9.5M19.5 6.5l8 9.5-8 9.5"
        stroke={`url(#${gradientId})`}
        strokeWidth={3.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="16" r="2.4" fill={`url(#${gradientId})`} />
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
