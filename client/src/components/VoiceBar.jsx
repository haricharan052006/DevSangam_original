import { Mic, MicOff, PhoneOff, Radio, Volume2 } from 'lucide-react'

function initials(name) {
  return (name || '?')[0]?.toUpperCase() || '?'
}

export default function VoiceBar({ voice, peers, myUserId, myColor, isModerator, onMuteAll, onUnmuteAll }) {
  const participants = [myUserId, ...voice.peerIds].filter((id, i, arr) => arr.indexOf(id) === i)

  function peerInfo(userId) {
    if (userId === myUserId) return { name: 'You', color: myColor }
    const peer = peers.find((p) => p.id === userId)
    return { name: peer?.name || 'Someone', color: peer?.color || '#64748b' }
  }

  if (!voice.joined) {
    return (
      <button
        onClick={voice.joinVoice}
        className="flex items-center gap-2 rounded-lg border border-ice/15 px-3 py-1.5 text-sm text-fog hover:bg-graphite"
        title="Join voice channel"
      >
        <Radio size={16} /> Join Voice
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-ice/15 bg-carbon px-2 py-1">
      <div className="flex -space-x-1.5">
        {participants.map((userId) => {
          const info = peerInfo(userId)
          const speaking = voice.speakingUserIds.has(userId)
          return (
            <div
              key={userId}
              style={{ backgroundColor: info.color }}
              className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] font-semibold text-white transition ${
                speaking ? 'border-emerald-400' : 'border-void'
              }`}
              title={info.name}
            >
              {initials(info.name)}
            </div>
          )
        })}
      </div>

      {voice.micError && <span className="text-[11px] text-red-400">{voice.micError}</span>}

      <button
        onClick={voice.toggleSelfMute}
        disabled={voice.adminMuted}
        title={voice.adminMuted ? 'Muted by host' : voice.selfMuted ? 'Unmute' : 'Mute'}
        className={`rounded-md p-1.5 ${
          voice.micEnabled ? 'text-fog hover:bg-graphite' : 'text-red-400'
        } disabled:cursor-not-allowed`}
      >
        {voice.micEnabled ? <Mic size={15} /> : <MicOff size={15} />}
      </button>

      {isModerator && (
        <>
          <button
            onClick={onMuteAll}
            title="Mute all members"
            className="rounded-md p-1.5 text-fog hover:bg-graphite hover:text-ice"
          >
            <MicOff size={15} />
          </button>
          <button
            onClick={onUnmuteAll}
            title="Unmute all members"
            className="rounded-md p-1.5 text-fog hover:bg-graphite hover:text-ice"
          >
            <Volume2 size={15} />
          </button>
        </>
      )}

      <button
        onClick={voice.leaveVoice}
        title="Leave voice"
        className="rounded-md p-1.5 text-red-400 hover:bg-red-950/50"
      >
        <PhoneOff size={15} />
      </button>
    </div>
  )
}
