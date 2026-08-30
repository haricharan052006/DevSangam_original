import { X } from 'lucide-react'

export default function Modal({ open, onClose, title, children, maxWidth = 'max-w-md' }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className={`w-full ${maxWidth} rounded-xl border border-ice/15 bg-carbon p-6 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ice">{title}</h2>
          <button onClick={onClose} className="text-steel hover:text-ice">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
