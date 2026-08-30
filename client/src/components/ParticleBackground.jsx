import { useEffect, useRef } from 'react'

const COLORS = ['#8B5CF6', '#A78BFA', '#E0F2FE', '#C084FC']
const MOUSE_RADIUS = 120
const MOUSE_FORCE = 1.4
const DAMPING = 0.92 // bleeds off velocity so a cursor impulse decays instead of oscillating
const SPRING = 0.02 // pulls each particle back toward its wandering origin
const WANDER_AMP = 14 // radius of the slow organic drift around origin
const WANDER_SPEED = 0.0004
const MAX_DPR = 2

function randomBetween(min, max) {
  return min + Math.random() * (max - min)
}

// 1,000-1,500 particles scaled to viewport area, each with its own slowly
// wandering origin, radius, opacity, and color so the field reads as
// organic rather than a uniform grid.
function seedParticles(width, height) {
  const area = width * height
  const count = Math.min(1500, Math.max(1000, Math.round(area / 900)))
  return Array.from({ length: count }, () => {
    const ox = Math.random() * width
    const oy = Math.random() * height
    return {
      ox,
      oy,
      x: ox,
      y: oy,
      vx: 0,
      vy: 0,
      phase: Math.random() * Math.PI * 2,
      speed: WANDER_SPEED * (0.7 + Math.random() * 0.6),
      radius: randomBetween(1.2, 2.5),
      opacity: randomBetween(0.4, 0.85),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }
  })
}

// Full-bleed Canvas2D particle field. Each particle springs back toward a
// slowly-wandering origin (gentle organic drift); moving the pointer within
// MOUSE_RADIUS injects a push+swirl impulse into nearby particles' velocity,
// which then decays (DAMPING) while the spring (SPRING) eases it back onto
// its drift path — a visible scatter that settles rather than a hard snap.
// The frame is fully cleared every tick (no trail accumulation) so the
// field can never visually "freeze" into an opaque overlay.
export default function ParticleBackground({ className = '' }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    const ctx = canvas.getContext('2d')
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let width = 0
    let height = 0
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
    let particles = []
    const mouse = { x: -9999, y: -9999, active: false }
    let rafId = null

    function resize() {
      const rect = canvas.getBoundingClientRect()
      // guard against a 0x0 measurement mid-layout (e.g. during a route
      // transition) leaving the canvas with no backing pixels to draw into
      width = Math.max(1, rect.width || window.innerWidth)
      height = Math.max(1, rect.height || window.innerHeight)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      particles = seedParticles(width, height)
    }

    function step(time) {
      ctx.clearRect(0, 0, width, height)

      for (const p of particles) {
        // the origin itself wanders slowly — organic drift instead of a
        // static grid or a straight-line random walk
        const wx = p.ox + Math.cos(time * p.speed + p.phase) * WANDER_AMP
        const wy = p.oy + Math.sin(time * p.speed * 1.3 + p.phase) * WANDER_AMP
        p.vx += (wx - p.x) * SPRING
        p.vy += (wy - p.y) * SPRING

        // cursor push + swirl: radial repulsion blended with a tangential
        // component so particles visibly scatter and curl away from the
        // pointer rather than just sliding straight back
        if (mouse.active) {
          const dx = p.x - mouse.x
          const dy = p.y - mouse.y
          const dist = Math.hypot(dx, dy)
          if (dist < MOUSE_RADIUS && dist > 0.01) {
            const falloff = (MOUSE_RADIUS - dist) / MOUSE_RADIUS
            const nx = dx / dist
            const ny = dy / dist
            const force = falloff * falloff * MOUSE_FORCE
            p.vx += (nx * 0.7 - ny * 0.7) * force
            p.vy += (ny * 0.7 + nx * 0.7) * force
          }
        }

        p.vx *= DAMPING
        p.vy *= DAMPING
        p.x += p.vx
        p.y += p.vy

        ctx.beginPath()
        ctx.fillStyle = p.color
        ctx.globalAlpha = p.opacity
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      rafId = requestAnimationFrame(step)
    }

    function handlePointerMove(e) {
      // canvas is always a fixed, full-viewport element, so client
      // coordinates map directly onto canvas coordinates
      mouse.x = e.clientX
      mouse.y = e.clientY
      mouse.active = true
    }
    function handlePointerLeave() {
      mouse.active = false
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('pointerleave', handlePointerLeave)

    if (!reduceMotion) {
      rafId = requestAnimationFrame(step)
    } else {
      // one static frame for users who've asked for reduced motion
      step(0)
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      ro.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('pointerleave', handlePointerLeave)
    }
  }, [])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}
