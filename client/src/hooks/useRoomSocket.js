import { useEffect, useRef, useState, useCallback } from 'react'
import { EXEC_WS_URL } from '../config/api'

// The one shared ephemeral event-bus connection per workspace — execution
// results, governance commands, and WebRTC signaling all ride this single
// socket via pub/sub, rather than each feature opening its own connection.
export function useRoomSocket(roomCode, token) {
  const wsRef = useRef(null)
  const listenersRef = useRef(new Set())
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!roomCode || !token) return undefined

    const url = `${EXEC_WS_URL}/${encodeURIComponent(roomCode)}?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)
    ws.onmessage = (event) => {
      let msg
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }
      listenersRef.current.forEach((fn) => fn(msg))
    }

    return () => {
      ws.close()
      wsRef.current = null
      setConnected(false)
    }
  }, [roomCode, token])

  const send = useCallback((payload) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload))
    }
  }, [])

  const subscribe = useCallback((fn) => {
    listenersRef.current.add(fn)
    return () => listenersRef.current.delete(fn)
  }, [])

  return { connected, send, subscribe }
}
