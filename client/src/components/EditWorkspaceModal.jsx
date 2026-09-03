import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import Modal from './Modal'
import FormField from './FormField'
import { ErrorBox, SubmitButton } from './FormBits'

const MAX_NAME_LENGTH = 60

// Re-seeds its fields from `workspace` on every open rather than owning
// name/description as controlled props — mirrors CreateWorkspaceModal's
// self-contained form state, just pre-filled instead of starting blank.
export default function EditWorkspaceModal({ workspace, onClose, onSave }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!workspace) return
    setName(workspace.name)
    setDescription(workspace.description || '')
    setError('')
  }, [workspace])

  if (!workspace) return null

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Workspace name is required.')
      return
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      setError(`Workspace name must be ${MAX_NAME_LENGTH} characters or fewer.`)
      return
    }
    setLoading(true)
    try {
      await onSave({ name: trimmed, description: description.trim() })
    } catch (err) {
      setError(err.message || 'Failed to update workspace')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={Boolean(workspace)} onClose={onClose} title="Edit workspace">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField
          label="Workspace name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My awesome project"
          required
        />

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-fog">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What are you building?"
            rows={3}
            className="w-full resize-none rounded-lg border border-ice/15 bg-graphite px-3 py-2.5 text-sm text-ice placeholder-steel outline-none transition focus:border-electric-violet focus:ring-1 focus:ring-electric-violet"
          />
        </label>

        {error && <ErrorBox message={error} />}
        <SubmitButton loading={loading} label="Save changes" loadingLabel="Saving..." icon={Save} />
      </form>
    </Modal>
  )
}
