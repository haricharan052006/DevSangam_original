import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Copy, Trash2 } from 'lucide-react'

function LiveEventLine({ event }) {
  if (event.kind === 'stdin') {
    return (
      <div className="text-cyan-400">
        <span className="text-steel">&gt; </span>
        {event.text}
        {event.userName && <span className="ml-2 text-[11px] text-steel">— {event.userName}</span>}
      </div>
    )
  }
  return (
    <pre className={`whitespace-pre-wrap break-words ${event.kind === 'stderr' ? 'text-red-400' : 'text-ice'}`}>
      {event.text}
    </pre>
  )
}

// Plain-text transcript of whatever's currently on screen — used by the
// Copy Console action, so it matches exactly what the user is looking at.
function buildTranscript({ running, liveEvents, result }) {
  if (running) {
    return liveEvents.map((e) => (e.kind === 'stdin' ? `> ${e.text}` : e.text)).join('\n')
  }
  if (result) {
    return [result.stdout, result.stderr].filter(Boolean).join('\n')
  }
  return ''
}

export default function TerminalPanel({ running, result, liveEvents, onClear, onSendStdin, canSendStdin }) {
  // Purely local UI state — each collaborator's own client decides whether
  // their console is collapsed; it's never synced over the room socket, so
  // one person minimizing their view doesn't touch anyone else's.
  const [collapsed, setCollapsed] = useState(false)
  const [stdinDraft, setStdinDraft] = useState('')
  const [consoleCopied, setConsoleCopied] = useState(false)
  const outputRef = useRef(null)

  const hasContent = Boolean(running || result)

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [liveEvents, result, collapsed])

  function submitStdin() {
    const text = stdinDraft.trim()
    if (!text || !running) return
    onSendStdin(text, running.fileId)
    setStdinDraft('')
  }

  function handleInputKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      submitStdin()
    }
  }

  function handleCopyConsole() {
    const text = buildTranscript({ running, liveEvents, result })
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {
      setConsoleCopied(true)
      setTimeout(() => setConsoleCopied(false), 1500)
    })
  }

  return (
    <div className="flex flex-col border-t border-ice/10 bg-void">
      <div className="flex items-center justify-between border-b border-ice/10 px-3 py-1.5">
        <button onClick={() => setCollapsed((c) => !c)} className="flex items-center gap-2 text-fog hover:text-ice">
          <ChevronDown size={14} className={`transition-transform duration-200 ${collapsed ? '-rotate-180' : ''}`} />
          <span className="label-mono">Console</span>
        </button>

        <div className="flex flex-1 items-center gap-1.5 px-3">
          {running && (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 label-mono text-amber-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              RUNNING · {running.runnerName}
            </span>
          )}
          {!running && result && (
            <>
              {result.timedOut ? (
                <span className="rounded-full bg-red-500/20 px-2 py-0.5 label-mono text-red-300">TIMED OUT</span>
              ) : (
                <span className="rounded-full bg-electric-violet/20 px-2 py-0.5 label-mono text-bright-violet">
                  EXEC: {result.durationMs}MS
                </span>
              )}
              {!result.timedOut && (
                <span
                  className={`rounded-full px-2 py-0.5 label-mono ${
                    result.exitCode === 0 ? 'bg-graphite text-fog' : 'bg-red-500/20 text-red-300'
                  }`}
                >
                  EXIT: {result.exitCode ?? '—'}
                </span>
              )}
              {result.mode && result.mode !== 'docker' && (
                <span
                  className="rounded-full bg-graphite px-2 py-0.5 label-mono text-steel"
                  title="Execution sandbox mode"
                >
                  {result.mode}
                </span>
              )}
              {result.runnerName && <span className="text-[11px] text-steel">by {result.runnerName}</span>}
            </>
          )}
        </div>

        <button
          onClick={handleCopyConsole}
          disabled={!hasContent}
          className="flex items-center gap-1 text-xs text-fog hover:text-ice disabled:opacity-40"
        >
          {consoleCopied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />} Copy
        </button>
        <button
          onClick={onClear}
          disabled={!hasContent}
          className="ml-3 flex items-center gap-1 text-xs text-fog hover:text-ice disabled:opacity-40"
        >
          <Trash2 size={12} /> Clear Console
        </button>
      </div>

      {/* Height (not mount/unmount) is what's animated, so the collapse has
          something to transition — a conditionally-rendered block would just
          pop in/out with no transition to play. */}
      <div
        className={`overflow-hidden transition-[max-height] duration-200 ease-in-out ${
          collapsed ? 'max-h-0' : 'max-h-56'
        }`}
      >
        <div ref={outputRef} className="h-56 overflow-y-auto px-3 py-2 font-mono text-xs leading-relaxed">
          {!hasContent && <p className="text-steel">Run your code (Ctrl+Enter) to see output here.</p>}

          {running && liveEvents.map((event) => <LiveEventLine key={event.id} event={event} />)}
          {running && liveEvents.length === 0 && <p className="text-steel">Waiting for output...</p>}

          {!running && result?.stdout && <pre className="whitespace-pre-wrap break-words text-ice">{result.stdout}</pre>}
          {!running && result?.stderr && <pre className="whitespace-pre-wrap break-words text-red-400">{result.stderr}</pre>}

          {/* The interactive prompt lives inside the scrollback itself, at
              the end of it — so it reads as the terminal waiting for you to
              type the next line, not a separate form bolted underneath. */}
          {running && (
            <div className="flex items-center gap-1.5 text-cyan-400">
              <span className="shrink-0">&gt;</span>
              <input
                value={stdinDraft}
                onChange={(e) => setStdinDraft(e.target.value)}
                onKeyDown={handleInputKeyDown}
                disabled={!canSendStdin}
                placeholder={canSendStdin ? 'Type input and press Enter...' : 'Viewer — cannot send input'}
                autoFocus={!collapsed}
                className="min-w-0 flex-1 border-none bg-transparent font-mono text-xs text-cyan-300 placeholder-steel caret-cyan-400 outline-none disabled:cursor-not-allowed"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
