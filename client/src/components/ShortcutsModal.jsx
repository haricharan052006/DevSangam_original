import Modal from './Modal'

const SHORTCUTS = [
  { keys: ['Ctrl', 'Enter'], macKeys: ['Cmd', 'Enter'], label: 'Run the active file' },
  { keys: ['Ctrl', 'S'], macKeys: ['Cmd', 'S'], label: 'Save (auto-synced; shown for muscle memory)' },
  { keys: ['Ctrl', 'F'], macKeys: ['Cmd', 'F'], label: 'Find in the current file' },
  { keys: ['Ctrl', '/'], macKeys: ['Cmd', '/'], label: 'Toggle line comment' },
]

const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent || '')

function KeyCap({ children }) {
  return (
    <kbd className="rounded border border-ice/15 bg-graphite px-1.5 py-0.5 font-mono text-[11px] text-fog">
      {children}
    </kbd>
  )
}

export default function ShortcutsModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts">
      <ul className="space-y-3">
        {SHORTCUTS.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-4">
            <span className="text-sm text-fog">{s.label}</span>
            <span className="flex items-center gap-1">
              {(IS_MAC ? s.macKeys : s.keys).map((k, i) => (
                <span key={k} className="flex items-center gap-1">
                  {i > 0 && <span className="text-steel">+</span>}
                  <KeyCap>{k}</KeyCap>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
