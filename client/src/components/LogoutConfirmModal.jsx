import { LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Modal from './Modal'
import { useAuth } from '../context/AuthContext'

export default function LogoutConfirmModal({ open, onClose }) {
  const { logout } = useAuth()
  const navigate = useNavigate()

  // Clearing localStorage + auth state alone leaves it to ProtectedRoute's
  // reactive redirect to notice isAuthenticated flipped false — forcing the
  // navigation here instead guarantees an immediate redirect rather than
  // depending on that render happening to land the way it should.
  function handleConfirm() {
    logout()
    onClose()
    navigate('/login', { replace: true })
  }

  return (
    <Modal open={open} onClose={onClose} title="Confirm Logout">
      <div className="space-y-4">
        <p className="text-sm text-fog">
          Are you sure you want to log out of your session? Any unsaved changes will remain in your workspace.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-ice/15 px-4 py-2 text-sm text-fog hover:bg-graphite"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      </div>
    </Modal>
  )
}
