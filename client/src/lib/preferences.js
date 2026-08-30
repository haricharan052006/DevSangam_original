// Editor + execution preferences — persisted to localStorage and shared
// across every mounted consumer via a tiny in-tab pub/sub, so saving a
// change in AccountSettingsModal (rendered inside Workspace.jsx) is picked
// up by the Monaco editor it's a sibling of in the same render pass, no
// context provider or prop-drilling needed.
const STORAGE_KEY = 'ds_editor_preferences'

export const CURSOR_COLORS = {
  violet: { label: 'Electric Violet', hex: '#8b5cf6' },
  cyan: { label: 'Cyan', hex: '#22d3ee' },
  emerald: { label: 'Emerald', hex: '#34d399' },
  amber: { label: 'Amber', hex: '#fbbf24' },
  rose: { label: 'Rose', hex: '#f472b6' },
}

export const DEFAULT_PREFERENCES = {
  fontSize: 14,
  tabSize: 4,
  keybinding: 'standard', // 'standard' | 'vim' | 'emacs'
  minimap: true,
  lineNumbers: true,
  wordWrap: false,
  cursorColor: 'violet',
  defaultLanguage: 'python',
  autoClearConsole: false,
}

const listeners = new Set()

export function loadPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PREFERENCES }
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

export function savePreferences(patch) {
  const next = { ...loadPreferences(), ...patch }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // localStorage unavailable (private mode, quota) — preference just
    // won't survive a refresh; still apply it for the rest of this session.
  }
  listeners.forEach((fn) => fn(next))
  return next
}

export function subscribePreferences(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
