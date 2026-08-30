import { useState } from 'react'
import { FilePlus } from 'lucide-react'
import Modal from './Modal'
import FormField from './FormField'
import { ErrorBox, SubmitButton } from './FormBits'
import { LANGUAGE_OPTIONS } from '../lib/languages'

export default function NewFileModal({ open, onClose, onCreate, existingNames }) {
  const [baseName, setBaseName] = useState('')
  const [language, setLanguage] = useState(LANGUAGE_OPTIONS[0].value)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const ext = LANGUAGE_OPTIONS.find((l) => l.value === language)?.ext || 'txt'
  const fullName = baseName.trim() ? `${baseName.trim()}.${ext}` : ''

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const trimmed = baseName.trim()
    if (!trimmed) {
      setError('Please enter a file name.')
      return
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      setError('File name can only contain letters, numbers, hyphens and underscores.')
      return
    }
    if (existingNames.includes(fullName)) {
      setError('A file with that name already exists.')
      return
    }
    setLoading(true)
    try {
      await onCreate({ fileName: fullName, language })
      setBaseName('')
      setLanguage(LANGUAGE_OPTIONS[0].value)
    } catch (err) {
      setError(err.message || 'Failed to create file')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New file">
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-fog">Language</span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full rounded-lg border border-ice/15 bg-graphite px-3 py-2.5 text-sm text-ice outline-none transition focus:border-electric-violet focus:ring-1 focus:ring-electric-violet"
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} (.{opt.ext})
              </option>
            ))}
          </select>
        </label>

        <FormField
          label="File name"
          value={baseName}
          onChange={(e) => setBaseName(e.target.value)}
          placeholder="utils"
        />
        {fullName && (
          <p className="text-xs text-steel">
            Will be created as <span className="font-mono text-fog">{fullName}</span>
          </p>
        )}

        {error && <ErrorBox message={error} />}
        <SubmitButton loading={loading} label="Create file" loadingLabel="Creating..." icon={FilePlus} />
      </form>
    </Modal>
  )
}
