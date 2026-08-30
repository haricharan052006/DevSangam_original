import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import Modal from './Modal'
import FormField from './FormField'
import { ErrorBox } from './FormBits'

export default function DeleteFileModal({ file, onClose, onConfirm }) {
  const [confirmText, setConfirmText] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setConfirmText('')
    setError('')
  }, [file])

  if (!file) return null

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (confirmText !== file.fileName) {
      setError('The name you typed does not match.')
      return
    }
    setLoading(true)
    try {
      await onConfirm()
    } catch (err) {
      setError(err.message || 'Failed to delete file')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={Boolean(file)} onClose={onClose} title="Delete file">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-fog">
          This will permanently delete <span className="font-mono text-ice">{file.fileName}</span>. Type the
          file name to confirm.
        </p>
        <FormField
          label="File name"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={file.fileName}
        />
        {error && <ErrorBox message={error} />}
        <button
          type="submit"
          disabled={loading || confirmText !== file.fileName}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 size={16} /> {loading ? 'Deleting...' : 'Delete file'}
        </button>
      </form>
    </Modal>
  )
}
