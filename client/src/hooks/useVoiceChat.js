import { useCallback, useEffect, useRef, useState } from 'react'

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]
const SPEAKING_THRESHOLD = 12

export function useVoiceChat(roomSocket, myUserId) {
  const [joined, setJoined] = useState(false)
  const [selfMuted, setSelfMuted] = useState(false)
  const [adminMuted, setAdminMuted] = useState(false)
  const [peerIds, setPeerIds] = useState([])
  const [speakingUserIds, setSpeakingUserIds] = useState(new Set())
  const [micError, setMicError] = useState('')

  const localStreamRef = useRef(null)
  const peersRef = useRef(new Map()) // userId -> RTCPeerConnection
  const audioElsRef = useRef(new Map()) // userId -> HTMLAudioElement
  const analysersRef = useRef(new Map()) // userId -> { ctx, raf }
  const pendingCandidatesRef = useRef(new Map()) // userId -> RTCIceCandidateInit[]
  const selfMutedRef = useRef(selfMuted)
  const adminMutedRef = useRef(adminMuted)

  useEffect(() => {
    selfMutedRef.current = selfMuted
    adminMutedRef.current = adminMuted
    const stream = localStreamRef.current
    if (!stream) return
    const enabled = !selfMuted && !adminMuted
    stream.getAudioTracks().forEach((t) => {
      t.enabled = enabled
    })
  }, [selfMuted, adminMuted])

  const setupSpeakingDetector = useCallback((userId, stream) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      source.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)

      function tick() {
        analyser.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        setSpeakingUserIds((prev) => {
          const isSpeaking = avg > SPEAKING_THRESHOLD
          const already = prev.has(userId)
          if (isSpeaking === already) return prev
          const next = new Set(prev)
          if (isSpeaking) next.add(userId)
          else next.delete(userId)
          return next
        })
        const raf = requestAnimationFrame(tick)
        analysersRef.current.set(userId, { ctx, raf })
      }
      tick()
    } catch {
      // speaking indicator is a nicety — AudioContext being unavailable isn't fatal
    }
  }, [])

  const createPeerConnection = useCallback(
    (targetUserId) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current))
      }

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          roomSocket.send({ type: 'voice:signal', targetUserId, signal: { candidate: e.candidate } })
        }
      }

      pc.ontrack = (e) => {
        let audioEl = audioElsRef.current.get(targetUserId)
        if (!audioEl) {
          audioEl = new Audio()
          audioEl.autoplay = true
          audioElsRef.current.set(targetUserId, audioEl)
        }
        audioEl.srcObject = e.streams[0]
        setupSpeakingDetector(targetUserId, e.streams[0])
      }

      peersRef.current.set(targetUserId, pc)
      return pc
    },
    [roomSocket, setupSpeakingDetector]
  )

  const teardownPeer = useCallback((userId) => {
    peersRef.current.get(userId)?.close()
    peersRef.current.delete(userId)

    const audioEl = audioElsRef.current.get(userId)
    if (audioEl) {
      audioEl.srcObject = null
      audioElsRef.current.delete(userId)
    }

    const analyserEntry = analysersRef.current.get(userId)
    if (analyserEntry) {
      cancelAnimationFrame(analyserEntry.raf)
      analyserEntry.ctx.close().catch(() => {})
      analysersRef.current.delete(userId)
    }

    pendingCandidatesRef.current.delete(userId)
    setSpeakingUserIds((prev) => {
      if (!prev.has(userId)) return prev
      const next = new Set(prev)
      next.delete(userId)
      return next
    })
    setPeerIds((prev) => prev.filter((id) => id !== userId))
  }, [])

  const connectToPeer = useCallback(
    async (targetUserId) => {
      const pc = createPeerConnection(targetUserId)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      roomSocket.send({ type: 'voice:signal', targetUserId, signal: { sdp: pc.localDescription } })
    },
    [createPeerConnection, roomSocket]
  )

  const handleSignal = useCallback(
    async (fromUserId, signal) => {
      let pc = peersRef.current.get(fromUserId)
      if (!pc) pc = createPeerConnection(fromUserId)

      if (signal.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
        const pending = pendingCandidatesRef.current.get(fromUserId) || []
        for (const candidate of pending) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate))
          } catch {
            // stale/invalid candidate — safe to ignore
          }
        }
        pendingCandidatesRef.current.delete(fromUserId)

        if (signal.sdp.type === 'offer') {
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          roomSocket.send({ type: 'voice:signal', targetUserId: fromUserId, signal: { sdp: pc.localDescription } })
        }
      } else if (signal.candidate) {
        // ICE candidates can arrive before the SDP exchange completes since
        // both travel over the same async message stream — queue until the
        // remote description is actually set, or addIceCandidate throws.
        if (pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate))
          } catch {
            // ignore
          }
        } else {
          if (!pendingCandidatesRef.current.has(fromUserId)) pendingCandidatesRef.current.set(fromUserId, [])
          pendingCandidatesRef.current.get(fromUserId).push(signal.candidate)
        }
      }
    },
    [createPeerConnection, roomSocket]
  )

  useEffect(() => {
    if (!roomSocket) return undefined
    return roomSocket.subscribe((msg) => {
      switch (msg.type) {
        case 'voice:roster':
          msg.peers.forEach((peerId) => {
            setPeerIds((prev) => (prev.includes(peerId) ? prev : [...prev, peerId]))
            connectToPeer(peerId)
          })
          break
        case 'voice:peer-joined':
          setPeerIds((prev) => (prev.includes(msg.userId) ? prev : [...prev, msg.userId]))
          break
        case 'voice:peer-left':
          teardownPeer(msg.userId)
          break
        case 'voice:signal':
          handleSignal(msg.fromUserId, msg.signal)
          break
        case 'member:muted':
          if (msg.targetUserId === myUserId) setAdminMuted(msg.muted)
          break
        case 'member:mute-all':
          if (msg.mutedUserIds.includes(myUserId)) setAdminMuted(true)
          break
        case 'member:unmute-all':
          setAdminMuted(false)
          break
        default:
          break
      }
    })
  }, [roomSocket, myUserId, connectToPeer, teardownPeer, handleSignal])

  const joinVoice = useCallback(async () => {
    setMicError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = stream
      stream.getAudioTracks().forEach((t) => {
        t.enabled = !selfMutedRef.current && !adminMutedRef.current
      })
      roomSocket?.send({ type: 'voice:join' })
      setJoined(true)
    } catch {
      setMicError('Microphone access denied or unavailable')
    }
  }, [roomSocket])

  const leaveVoice = useCallback(() => {
    roomSocket?.send({ type: 'voice:leave' })
    Array.from(peersRef.current.keys()).forEach(teardownPeer)
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
    setJoined(false)
    setPeerIds([])
  }, [roomSocket, teardownPeer])

  const toggleSelfMute = useCallback(() => setSelfMuted((m) => !m), [])

  useEffect(
    () => () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop())
      peersRef.current.forEach((pc) => pc.close())
      analysersRef.current.forEach(({ ctx, raf }) => {
        cancelAnimationFrame(raf)
        ctx.close().catch(() => {})
      })
    },
    []
  )

  return {
    joined,
    selfMuted,
    adminMuted,
    micEnabled: !selfMuted && !adminMuted,
    peerIds,
    speakingUserIds,
    micError,
    joinVoice,
    leaveVoice,
    toggleSelfMute,
  }
}
