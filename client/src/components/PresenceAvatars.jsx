function initials(name) {
  return (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

export default function PresenceAvatars({ peers }) {
  if (!peers.length) return null
  return (
    <div className="flex -space-x-2">
      {peers.map((peer) => (
        <div
          key={peer.id}
          title={peer.name}
          style={{ backgroundColor: peer.color }}
          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-void text-[11px] font-semibold text-white"
        >
          {initials(peer.name)}
        </div>
      ))}
    </div>
  )
}
