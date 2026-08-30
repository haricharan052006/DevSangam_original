import { useCallback, useEffect, useMemo, useState } from 'react'

export function useGovernance(roomSocket, workspaceData, myUserId, callbacks = {}) {
  const { onKicked, onNotice } = callbacks

  const [coOwnerId, setCoOwnerId] = useState(null)
  const [roles, setRoles] = useState({})
  const [presentationMode, setPresentationMode] = useState(false)
  const [mutedUserIds, setMutedUserIds] = useState(new Set())

  // re-bootstrap whenever a fresh workspace payload loads (new room, or a
  // manual refetch) — live updates after that flow entirely through the
  // socket subscription below
  useEffect(() => {
    if (!workspaceData?.workspace) return
    setCoOwnerId(workspaceData.workspace.coOwnerId ?? null)
    setRoles(workspaceData.roles || {})
    setPresentationMode(Boolean(workspaceData.presentationMode))
    setMutedUserIds(new Set())
  }, [workspaceData?.workspace?.id])

  useEffect(() => {
    if (!roomSocket) return undefined
    return roomSocket.subscribe((msg) => {
      switch (msg.type) {
        case 'coowner:updated':
          setCoOwnerId(msg.coOwnerId)
          onNotice?.('coowner', msg)
          break
        case 'role:updated':
          setRoles((prev) => ({ ...prev, [msg.targetUserId]: msg.role }))
          onNotice?.('role', msg)
          break
        case 'presentation:updated':
          setPresentationMode(msg.enabled)
          onNotice?.('presentation', msg)
          break
        case 'member:muted':
          setMutedUserIds((prev) => {
            const next = new Set(prev)
            if (msg.muted) next.add(msg.targetUserId)
            else next.delete(msg.targetUserId)
            return next
          })
          onNotice?.('muted', msg)
          break
        case 'member:mute-all':
          setMutedUserIds((prev) => new Set([...prev, ...msg.mutedUserIds]))
          onNotice?.('mute-all', msg)
          break
        case 'member:unmute-all':
          setMutedUserIds(new Set())
          onNotice?.('unmute-all', msg)
          break
        case 'member:kicked':
          onNotice?.('kicked', msg)
          if (msg.targetUserId === myUserId) onKicked?.()
          break
        case 'member:joined':
          onNotice?.('joined', msg)
          break
        case 'member:left':
          onNotice?.('left', msg)
          break
        case 'error':
          onNotice?.('error', msg)
          break
        default:
          break
      }
    })
  }, [roomSocket, myUserId, onKicked, onNotice])

  const ownerId = workspaceData?.workspace?.ownerId ?? null

  const myRole = useMemo(() => {
    if (myUserId == null) return 'editor'
    if (ownerId === myUserId) return 'owner'
    if (coOwnerId === myUserId) return 'coOwner'
    return roles[myUserId] || 'editor'
  }, [ownerId, coOwnerId, roles, myUserId])

  const isModerator = myRole === 'owner' || myRole === 'coOwner'
  const canEdit = isModerator || (myRole === 'editor' && !presentationMode)

  const getRoleFor = useCallback(
    (userId) => {
      if (userId === ownerId) return 'owner'
      if (userId === coOwnerId) return 'coOwner'
      return roles[userId] || 'editor'
    },
    [ownerId, coOwnerId, roles]
  )

  const setMemberRole = useCallback(
    (targetUserId, role) => roomSocket?.send({ type: 'governance:set-role', targetUserId, role }),
    [roomSocket]
  )
  const kickMember = useCallback(
    (targetUserId) => roomSocket?.send({ type: 'governance:kick', targetUserId }),
    [roomSocket]
  )
  const muteMember = useCallback(
    (targetUserId, muted = true) => roomSocket?.send({ type: 'governance:mute', targetUserId, muted }),
    [roomSocket]
  )
  const muteAll = useCallback(() => roomSocket?.send({ type: 'governance:mute-all' }), [roomSocket])
  const unmuteAll = useCallback(() => roomSocket?.send({ type: 'governance:unmute-all' }), [roomSocket])
  const togglePresentation = useCallback(
    (enabled) => roomSocket?.send({ type: 'governance:toggle-presentation', enabled }),
    [roomSocket]
  )

  return {
    myRole,
    isModerator,
    canEdit,
    ownerId,
    coOwnerId,
    roles,
    presentationMode,
    mutedUserIds,
    getRoleFor,
    setMemberRole,
    kickMember,
    muteMember,
    muteAll,
    unmuteAll,
    togglePresentation,
  }
}
