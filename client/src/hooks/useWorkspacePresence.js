import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { getUserColor } from '../lib/collab'
import { YJS_WS_URL } from '../config/api'

// Owns the one shared Yjs connection per workspace room, used for both
// presence/awareness (who's here) and the live-synced file list (sidebar
// updates across tabs without a refresh) — one connection, two concerns,
// instead of a separate Socket.io stack duplicating what this already does.
export function useWorkspacePresence(roomCode, token, user, cursorColor) {
  const [peers, setPeers] = useState([])
  const [files, setFiles] = useState([])
  const [filesSynced, setFilesSynced] = useState(false)
  const [status, setStatus] = useState('connecting')
  const [online, setOnline] = useState(navigator.onLine)
  const providerRef = useRef(null)

  useEffect(() => {
    if (!roomCode || !token || !user) return undefined

    setFilesSynced(false)

    const doc = new Y.Doc()
    const provider = new WebsocketProvider(YJS_WS_URL, `${roomCode}::presence`, doc, { params: { token } })
    providerRef.current = provider

    provider.awareness.setLocalStateField('user', {
      id: user.id,
      name: user.name,
      color: cursorColor || getUserColor(user.id),
    })

    // Keyed by file id (not a Y.Array) so re-seeding after a server restart is
    // an idempotent .set() merge instead of a positional insert that would
    // permanently duplicate every file in a long-lived client's history.
    const yFiles = doc.getMap('files')

    function updatePeers() {
      const seen = new Map()
      provider.awareness.getStates().forEach((state) => {
        if (state?.user) seen.set(state.user.id, state.user)
      })
      setPeers(Array.from(seen.values()))
    }

    function updateFiles() {
      setFiles(Array.from(yFiles.values()).sort((a, b) => a.id - b.id))
    }

    function updateStatus({ status: nextStatus }) {
      setStatus(nextStatus)
    }

    function handleSync(isSynced) {
      if (isSynced) {
        updateFiles()
        setFilesSynced(true)
      }
    }

    function handleOnline() {
      setOnline(true)
    }
    function handleOffline() {
      setOnline(false)
    }

    provider.awareness.on('change', updatePeers)
    yFiles.observe(updateFiles)
    provider.on('status', updateStatus)
    provider.on('sync', handleSync)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    updatePeers()

    return () => {
      provider.awareness.off('change', updatePeers)
      yFiles.unobserve(updateFiles)
      provider.off('status', updateStatus)
      provider.off('sync', handleSync)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      provider.destroy()
      doc.destroy()
      providerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, token, user?.id])

  // Re-broadcasts just the awareness field (no reconnect) when the display
  // name or chosen cursor color changes while already connected — e.g. from
  // Account Settings — so every collaborator sees it update live.
  useEffect(() => {
    if (!providerRef.current || !user) return
    providerRef.current.awareness.setLocalStateField('user', {
      id: user.id,
      name: user.name,
      color: cursorColor || getUserColor(user.id),
    })
  }, [user?.name, cursorColor, user?.id])

  const connectionState = !online ? 'offline' : status === 'connected' ? 'connected' : 'reconnecting'

  return { peers, files, filesSynced, connectionState }
}
