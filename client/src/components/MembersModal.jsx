import { useState } from 'react'
import { Crown, Eye, LogOut, MicOff, Pencil, ShieldCheck, UserMinus } from 'lucide-react'
import Modal from './Modal'

const ROLE_META = {
  owner: { label: 'Owner', icon: Crown, className: 'bg-amber-500/20 text-amber-300' },
  coOwner: { label: 'Co-Owner', icon: ShieldCheck, className: 'bg-bright-violet/20 text-bright-violet' },
  editor: { label: 'Editor', icon: Pencil, className: 'bg-graphite text-fog' },
  viewer: { label: 'Viewer', icon: Eye, className: 'bg-graphite text-fog' },
}

function RoleBadge({ role }) {
  const meta = ROLE_META[role] || ROLE_META.editor
  const Icon = meta.icon
  return (
    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.className}`}>
      <Icon size={11} />
      {meta.label}
    </span>
  )
}

export default function MembersModal({
  open,
  onClose,
  peers,
  myUserId,
  getRoleFor,
  isModerator,
  mutedUserIds,
  onPromoteCoOwner,
  onDemoteCoOwner,
  onSetRole,
  onKick,
  onMute,
}) {
  const [busyUserId, setBusyUserId] = useState(null)

  async function withBusy(userId, fn) {
    setBusyUserId(userId)
    try {
      await fn()
    } finally {
      setBusyUserId(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Members" maxWidth="max-w-lg">
      <ul className="max-h-96 space-y-2 overflow-y-auto">
        {peers.map((peer) => {
          const role = getRoleFor(peer.id)
          const isSelf = peer.id === myUserId
          const isOwner = role === 'owner'
          const isCoOwner = role === 'coOwner'
          const isMuted = mutedUserIds.has(peer.id)
          const busy = busyUserId === peer.id

          return (
            <li
              key={peer.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ice/10 bg-carbon px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <div
                  style={{ backgroundColor: peer.color }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                >
                  {(peer.name || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm text-ice">
                    {peer.name} {isSelf && <span className="text-steel">(you)</span>}
                  </p>
                </div>
                <RoleBadge role={role} />
                {isMuted && <MicOff size={12} className="text-red-400" title="Muted" />}
              </div>

              {isModerator && !isSelf && !isOwner && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <select
                    value={role === 'viewer' ? 'viewer' : 'editor'}
                    disabled={isCoOwner || busy}
                    onChange={(e) => withBusy(peer.id, () => onSetRole(peer.id, e.target.value))}
                    className="rounded-md border border-ice/15 bg-graphite px-1.5 py-1 text-[11px] text-fog disabled:opacity-50"
                    title="Editor / Viewer access"
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>

                  {isCoOwner ? (
                    <button
                      onClick={() => withBusy(peer.id, () => onDemoteCoOwner())}
                      disabled={busy}
                      className="rounded-md border border-ice/15 px-2 py-1 text-[11px] text-fog hover:bg-graphite disabled:opacity-50"
                    >
                      Demote
                    </button>
                  ) : (
                    <button
                      onClick={() => withBusy(peer.id, () => onPromoteCoOwner(peer.id))}
                      disabled={busy}
                      className="rounded-md border border-ice/15 px-2 py-1 text-[11px] text-fog hover:bg-graphite disabled:opacity-50"
                    >
                      Promote to Co-Owner
                    </button>
                  )}

                  <button
                    onClick={() => onMute(peer.id, !isMuted)}
                    className="rounded-md border border-ice/15 p-1 text-fog hover:bg-graphite"
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    <MicOff size={12} />
                  </button>

                  <button
                    onClick={() => withBusy(peer.id, () => onKick(peer.id))}
                    disabled={busy}
                    className="flex items-center gap-1 rounded-md border border-red-900 px-2 py-1 text-[11px] text-red-400 hover:bg-red-950/50 disabled:opacity-50"
                  >
                    <UserMinus size={12} /> Kick
                  </button>
                </div>
              )}
            </li>
          )
        })}
        {peers.length === 0 && <p className="py-6 text-center text-sm text-steel">No one else is here yet.</p>}
      </ul>
      {!isModerator && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-steel">
          <LogOut size={12} /> Only the owner or co-owner can manage members.
        </p>
      )}
    </Modal>
  )
}
