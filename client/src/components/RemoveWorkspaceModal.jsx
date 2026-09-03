import { DoorOpen, Trash2 } from 'lucide-react'
import Modal from './Modal'

// Same confirm shape as LogoutConfirmModal, but the copy and the destructive
// verb branch on whether this user owns the workspace (full delete) or only
// saved it to their dashboard (just unlink it) — see Dashboard.jsx's
// undo-backed removal flow, which this only ever gates entry into.
export default function RemoveWorkspaceModal({ workspace, onClose, onConfirm }) {
  if (!workspace) return null

  const isOwner = workspace.role === 'owner'

  return (
    <Modal open={Boolean(workspace)} onClose={onClose} title={isOwner ? 'Delete workspace' : 'Remove from dashboard'}>
      <div className="space-y-4">
        <p className="text-sm text-fog">
          {isOwner
            ? 'Are you sure you want to delete this workspace? This will permanently remove all files and cannot be undone.'
            : 'Remove this workspace from your dashboard? You can rejoin later using the room code if permitted.'}
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-ice/15 px-4 py-2 text-sm text-fog hover:bg-graphite"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
          >
            {isOwner ? <Trash2 size={16} /> : <DoorOpen size={16} />}
            {isOwner ? 'Delete workspace' : 'Remove'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
