import { useState } from 'react'
import { Keyboard, Palette, Save, SlidersHorizontal, User } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from './Modal'
import FormField from './FormField'
import ToggleSwitch from './ToggleSwitch'
import { ErrorBox, SubmitButton } from './FormBits'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { usePreferences } from '../hooks/usePreferences'
import { CURSOR_COLORS } from '../lib/preferences'
import { LANGUAGE_OPTIONS } from '../lib/languages'

const MAX_NAME_LENGTH = 60
const FONT_SIZES = [12, 14, 16, 18]
const TAB_SIZES = [2, 4]
const KEYBINDINGS = [
  { value: 'standard', label: 'Standard', detail: 'Default Monaco keybindings' },
  { value: 'vim', label: 'Vim', detail: 'Modal editing — Esc/i/dd/yy, gg/G, etc.' },
  { value: 'emacs', label: 'Emacs', detail: 'Ctrl-based chords — C-a/C-e/C-k, etc.' },
]

const TABS = [
  { id: 'general', label: 'General', icon: User },
  { id: 'editor', label: 'Editor', icon: SlidersHorizontal },
  { id: 'keybindings', label: 'Keybindings', icon: Keyboard },
]

function SectionLabel({ children }) {
  return <p className="label-mono mb-3 text-fog">{children}</p>
}

export default function AccountSettingsModal({ open, onClose }) {
  const { user, token, updateUser } = useAuth()
  const { preferences, updatePreferences } = usePreferences()
  const [tab, setTab] = useState('general')
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleClose() {
    setNewName('')
    setError('')
    setTab('general')
    onClose()
  }

  async function handleSaveName(e) {
    e.preventDefault()
    setError('')

    const trimmed = newName.trim()
    if (!trimmed) {
      setError('Please enter a display name.')
      return
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      setError(`Display name must be ${MAX_NAME_LENGTH} characters or fewer.`)
      return
    }
    if (trimmed === user?.name) {
      setError('That is already your current display name.')
      return
    }

    setLoading(true)
    try {
      // updateUser() merges into AuthContext's cached user, which any
      // mounted Yjs awareness effect (Workspace.jsx, useWorkspacePresence)
      // is subscribed to via `user.name` in its own dependency array — so a
      // name change here re-broadcasts to every collaborator in the room
      // the moment this resolves, no reconnect required.
      const data = await api.updateName(token, trimmed)
      updateUser(data.user)
      toast.success('Display name updated successfully.')
      setNewName('')
    } catch (err) {
      const message = err.message || 'Failed to update display name'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  function handlePreferenceChange(patch) {
    updatePreferences(patch)
    toast.success('Preference saved', { id: 'pref-saved', duration: 1200 })
  }

  return (
    <Modal open={open} onClose={handleClose} title="Developer Settings" maxWidth="max-w-xl">
      <div className="-mt-1 mb-5 flex gap-1 border-b border-ice/10">
        {TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 label-mono transition ${
                active ? 'border-electric-violet text-electric-violet' : 'border-transparent text-fog hover:text-ice'
              }`}
            >
              <Icon size={13} /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'general' && (
        <div className="space-y-6">
          <div>
            <SectionLabel>Profile</SectionLabel>
            <div className="mb-4 rounded-lg border border-ice/15 bg-graphite px-3 py-2.5 text-sm">
              <p className="label-mono text-fog">Current display name</p>
              <p className="mt-1 text-ice">{user?.name}</p>
            </div>

            <form onSubmit={handleSaveName} className="space-y-3">
              <FormField
                icon={User}
                label="Your Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Jane Doe"
                autoComplete="name"
              />
              {error && <ErrorBox message={error} />}
              <div className="w-36">
                <SubmitButton loading={loading} label="Save Name" loadingLabel="Saving..." icon={Save} />
              </div>
            </form>
          </div>

          <div>
            <SectionLabel>Cursor Color</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {Object.entries(CURSOR_COLORS).map(([key, { label, hex }]) => (
                <button
                  key={key}
                  type="button"
                  title={label}
                  onClick={() => handlePreferenceChange({ cursorColor: key })}
                  className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition ${
                    preferences.cursorColor === key ? 'border-ice' : 'border-transparent hover:border-ice/40'
                  }`}
                  style={{ backgroundColor: hex }}
                >
                  {preferences.cursorColor === key && <Palette size={14} className="text-white drop-shadow" />}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-fog">How your cursor and selection appear to collaborators.</p>
          </div>

          <div>
            <SectionLabel>Execution Defaults</SectionLabel>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-fog">Default language for new workspaces</span>
              <select
                value={preferences.defaultLanguage}
                onChange={(e) => handlePreferenceChange({ defaultLanguage: e.target.value })}
                className="w-full rounded-lg border border-ice/15 bg-graphite px-3 py-2.5 text-sm text-ice outline-none transition focus:border-electric-violet focus:ring-1 focus:ring-electric-violet"
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-3">
              <ToggleSwitch
                label="Auto-clear console on run"
                description="Reset the terminal the instant you hit Run, instead of on the next output."
                checked={preferences.autoClearConsole}
                onChange={(v) => handlePreferenceChange({ autoClearConsole: v })}
              />
            </div>
          </div>
        </div>
      )}

      {tab === 'editor' && (
        <div className="space-y-6">
          <div>
            <SectionLabel>Font Size</SectionLabel>
            <div className="flex gap-2">
              {FONT_SIZES.map((size) => (
                <button
                  key={size}
                  onClick={() => handlePreferenceChange({ fontSize: size })}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                    preferences.fontSize === size
                      ? 'border-electric-violet bg-electric-violet/20 text-electric-violet'
                      : 'border-ice/15 text-fog hover:bg-graphite'
                  }`}
                >
                  {size}px
                </button>
              ))}
            </div>
          </div>

          <div>
            <SectionLabel>Tab Size</SectionLabel>
            <div className="flex gap-2">
              {TAB_SIZES.map((size) => (
                <button
                  key={size}
                  onClick={() => handlePreferenceChange({ tabSize: size })}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                    preferences.tabSize === size
                      ? 'border-electric-violet bg-electric-violet/20 text-electric-violet'
                      : 'border-ice/15 text-fog hover:bg-graphite'
                  }`}
                >
                  {size} spaces
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <SectionLabel>Display</SectionLabel>
            <ToggleSwitch
              label="Line numbers"
              checked={preferences.lineNumbers}
              onChange={(v) => handlePreferenceChange({ lineNumbers: v })}
            />
            <ToggleSwitch
              label="Minimap"
              checked={preferences.minimap}
              onChange={(v) => handlePreferenceChange({ minimap: v })}
            />
            <ToggleSwitch
              label="Line wrapping"
              checked={preferences.wordWrap}
              onChange={(v) => handlePreferenceChange({ wordWrap: v })}
            />
          </div>
        </div>
      )}

      {tab === 'keybindings' && (
        <div className="space-y-3">
          <SectionLabel>Keybinding Preset</SectionLabel>
          {KEYBINDINGS.map((kb) => (
            <button
              key={kb.value}
              onClick={() => handlePreferenceChange({ keybinding: kb.value })}
              className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition ${
                preferences.keybinding === kb.value
                  ? 'border-electric-violet bg-electric-violet/10'
                  : 'border-ice/15 hover:bg-graphite'
              }`}
            >
              <div>
                <p className={`text-sm font-medium ${preferences.keybinding === kb.value ? 'text-electric-violet' : 'text-ice'}`}>
                  {kb.label}
                </p>
                <p className="mt-0.5 text-xs text-fog">{kb.detail}</p>
              </div>
              <span
                className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                  preferences.keybinding === kb.value ? 'border-electric-violet bg-electric-violet' : 'border-ice/30'
                }`}
              />
            </button>
          ))}
          <p className="text-xs text-fog">
            Vim and Emacs modes attach directly to the Monaco editor in your workspace and take effect immediately —
            no reload needed. If either engine fails to load (e.g. a flaky network fetch of its chunk), you'll see a
            toast and the editor quietly stays on Standard keybindings.
          </p>
        </div>
      )}

      <div className="mt-6 flex justify-end border-t border-ice/10 pt-4">
        <button
          type="button"
          onClick={handleClose}
          className="rounded-lg border border-ice/15 px-4 py-2 text-sm text-fog hover:bg-graphite"
        >
          Done
        </button>
      </div>
    </Modal>
  )
}
