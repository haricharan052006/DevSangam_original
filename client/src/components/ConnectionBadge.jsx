const CONFIG = {
  connected: { label: 'CONNECTED', dot: 'bg-emerald-400' },
  reconnecting: { label: 'RECONNECTING', dot: 'bg-amber-400 animate-pulse' },
  offline: { label: 'OFFLINE', dot: 'bg-red-400' },
}

export default function ConnectionBadge({ state }) {
  const cfg = CONFIG[state] || CONFIG.offline
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-ice/15 px-2.5 py-1 label-mono text-fog">
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      STATUS: {cfg.label}
    </span>
  )
}
