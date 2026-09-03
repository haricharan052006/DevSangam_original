export default function ToggleSwitch({ checked, onChange, label, description }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div>
        <p className="text-sm text-ice">{label}</p>
        {description && <p className="text-xs text-fog">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        // Track is a real flex container with real padding (p-0.5), not an
        // absolutely-positioned thumb faking an inset via a hand-picked
        // translate value — the thumb's resting position (left edge, flush
        // against the padding) already IS the "OFF" position, so
        // translate-x-0 leaves it there and translate-x-5 (20px) shifts it
        // by exactly the thumb's own width. That's what keeps it flush
        // against the *inner* right edge (still inside the padding) in the
        // ON state instead of overhanging the track's outer edge.
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          checked ? 'bg-electric-violet' : 'bg-graphite'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}
