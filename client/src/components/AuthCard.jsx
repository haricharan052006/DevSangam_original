import { Link } from 'react-router-dom'
import Logo from './Logo'

export default function AuthCard({ title, subtitle, children, footer }) {
  return (
    <div className="relative z-10 flex min-h-screen items-center justify-center bg-transparent px-4 py-12 text-ice">
      {/* relative z-10 + bg-transparent, not a solid void/black fill — this
          page is mounted under App.jsx's PublicLayout, which renders the
          shared ParticleBackground canvas as a fixed z-0 sibling behind it.
          The card panel below is translucent glass rather than opaque, so
          the particle field keeps drifting and reacting visibly behind it. */}
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <Link to="/">
            <Logo iconSize={32} />
          </Link>
          <p className="text-sm text-fog">{subtitle}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#121517]/80 p-6 backdrop-blur-md sm:p-8">
          <h1 className="mb-6 text-xl font-semibold text-ice">{title}</h1>
          {children}
        </div>
        {footer && <div className="mt-6 text-center text-sm text-fog">{footer}</div>}
      </div>
    </div>
  )
}
