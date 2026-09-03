import { useEffect, useState } from 'react'
import { Undo2 } from 'lucide-react'

// Ticks down visually in lockstep with the caller's real setTimeout — this
// component doesn't own the deletion timer itself (Dashboard.jsx does, so it
// can survive the toast being dismissed for unrelated reasons); it just
// renders a countdown against the same `durationMs` window.
export default function UndoToast({ message, durationMs, onUndo }) {
  const [remainingMs, setRemainingMs] = useState(durationMs)

  useEffect(() => {
    const startedAt = Date.now()
    const interval = setInterval(() => {
      setRemainingMs(Math.max(0, durationMs - (Date.now() - startedAt)))
    }, 100)
    return () => clearInterval(interval)
  }, [durationMs])

  return (
    <div className="flex items-center gap-3 rounded-lg border border-ice/15 bg-carbon px-4 py-3 shadow-xl">
      <span className="text-sm text-ice">{message}</span>
      <button
        onClick={onUndo}
        className="flex shrink-0 items-center gap-1.5 rounded-md border border-electric-violet/50 px-2.5 py-1 text-xs font-medium text-electric-violet hover:bg-electric-violet/10"
      >
        <Undo2 size={12} /> Undo
      </button>
      <span className="label-mono w-5 shrink-0 text-right text-steel">{Math.ceil(remainingMs / 1000)}s</span>
    </div>
  )
}
