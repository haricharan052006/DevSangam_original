import { useCallback, useEffect, useRef, useState } from 'react'

export function useExecution(roomSocket) {
  const [running, setRunning] = useState(null) // { fileId, runnerName, startedAt } | null
  const [result, setResult] = useState(null) // last code:output payload | null
  const [liveEvents, setLiveEvents] = useState([]) // [{ id, kind: 'stdout'|'stderr'|'stdin', text, userName? }]
  const eventIdRef = useRef(0)

  useEffect(() => {
    if (!roomSocket) return undefined
    return roomSocket.subscribe((msg) => {
      if (msg.type === 'code:running') {
        setRunning({ fileId: msg.fileId, runnerId: msg.runnerId, runnerName: msg.runnerName, startedAt: msg.startedAt })
        setLiveEvents([])
      } else if (msg.type === 'code:chunk') {
        // Merge into the previous entry when it's the same stream, so a
        // burst of small pipe reads renders as one continuous block instead
        // of several back-to-back <pre> elements with gaps between them.
        setLiveEvents((prev) => {
          const last = prev[prev.length - 1]
          if (last && last.kind === msg.stream) {
            return [...prev.slice(0, -1), { ...last, text: last.text + msg.text }]
          }
          return [...prev, { id: eventIdRef.current++, kind: msg.stream, text: msg.text }]
        })
      } else if (msg.type === 'code:stdin-echo') {
        setLiveEvents((prev) => [
          ...prev,
          { id: eventIdRef.current++, kind: 'stdin', text: msg.text, userName: msg.userName },
        ])
      } else if (msg.type === 'code:output') {
        setRunning(null)
        setResult(msg)
      }
    })
  }, [roomSocket])

  const runCode = useCallback((payload) => roomSocket?.send({ type: 'code:run', ...payload }), [roomSocket])
  const sendStdin = useCallback(
    (text, fileId) => roomSocket?.send({ type: 'stdin', text, fileId }),
    [roomSocket]
  )
  const clearResult = useCallback(() => {
    setResult(null)
    setLiveEvents([])
  }, [])

  return { running, result, liveEvents, runCode, sendStdin, clearResult }
}
