import { useState } from 'react'
import { FolderPlus } from 'lucide-react'
import Modal from './Modal'
import FormField from './FormField'
import { ErrorBox, SubmitButton } from './FormBits'
import { LANGUAGE_OPTIONS } from '../lib/languages'
import { usePreferences } from '../hooks/usePreferences'

export default function CreateWorkspaceModal({ open, onClose, onCreate }) {
  const { preferences } = usePreferences()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [language, setLanguage] = useState(preferences.defaultLanguage)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!name.trim()) {
      setError('Workspace name is required.')
      return
    }
    setLoading(true)
    try {
      await onCreate({ name: name.trim(), description: description.trim(), language })
      setName('')
      setDescription('')
      setLanguage(preferences.defaultLanguage)
    } catch (err) {
      setError(err.message || 'Failed to create workspace')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create workspace">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField
          label="Workspace name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My awesome project"
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

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-fog">Primary language template</span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full rounded-lg border border-ice/15 bg-graphite px-3 py-2.5 text-sm text-ice outline-none transition focus:border-electric-violet focus:ring-1 focus:ring-electric-violet"
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {error && <ErrorBox message={error} />}
        <SubmitButton loading={loading} label="Create workspace" loadingLabel="Creating..." icon={FolderPlus} />
      </form>
    </Modal>
  )
}
