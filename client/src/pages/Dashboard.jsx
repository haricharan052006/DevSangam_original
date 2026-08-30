import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Copy, DoorOpen, LogOut, Plus, Search, Settings } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { getLanguageMeta } from '../lib/languages'
import { formatDateOnly } from '../lib/formatDate'
import CreateWorkspaceModal from '../components/CreateWorkspaceModal'
import LogoutConfirmModal from '../components/LogoutConfirmModal'
import AccountSettingsModal from '../components/AccountSettingsModal'
import Logo from '../components/Logo'

export default function Dashboard() {
  const { user, token } = useAuth()
  const navigate = useNavigate()

  const [workspaces, setWorkspaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [copiedCode, setCopiedCode] = useState('')
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [showAccountSettings, setShowAccountSettings] = useState(false)

  useEffect(() => {
    loadWorkspaces()
  }, [])

  async function loadWorkspaces() {
    setLoading(true)
    setError('')
    try {
      const data = await api.listWorkspaces(token)
      setWorkspaces(data.workspaces)
    } catch (err) {
      setError(err.message || 'Failed to load workspaces')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(payload) {
    const data = await api.createWorkspace(token, payload)
    setShowCreateModal(false)
    navigate(`/workspace/${data.workspace.roomCode}`)
  }

  function handleJoin(e) {
    e.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (!code) return
    navigate(`/workspace/${code}`)
  }

  function handleCopy(code) {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code)
      setTimeout(() => setCopiedCode(''), 1500)
    })
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return workspaces
    return workspaces.filter((ws) => {
      const nameMatch = ws.name.toLowerCase().includes(term)
      const langMatch = (ws.languages || []).some((lang) => lang.toLowerCase().includes(term))
      return nameMatch || langMatch
    })
  }, [workspaces, search])

  return (
    <div className="min-h-screen bg-void text-ice">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-ice/10 px-6 py-4">
        <div>
          <Logo iconSize={24} />
          <p className="mt-1 text-sm text-fog">Welcome back, {user?.name}!</p>
        </div>

        <div className="hidden items-center gap-1.5 rounded-full border border-[#8B5CF6]/30 bg-[#18181b]/80 px-3 py-1 font-mono text-xs tracking-wide text-[#a1a1aa] md:flex">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8B5CF6]" />
          Refresh if you encounter a glitch
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAccountSettings(true)}
            title="Account settings"
            className="flex items-center gap-2 rounded-lg border border-ice/15 px-3 py-1.5 text-sm text-fog hover:bg-graphite"
          >
            <Settings size={16} /> Account
          </button>
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="flex items-center gap-2 rounded-lg border border-ice/15 px-3 py-1.5 text-sm text-fog hover:bg-graphite"
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-steel" size={18} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workspaces by name or language..."
              className="w-full rounded-lg border border-ice/15 bg-carbon py-2.5 pl-10 pr-3 text-sm text-ice placeholder-steel outline-none transition focus:border-electric-violet focus:ring-1 focus:ring-electric-violet"
            />
          </div>

          <form onSubmit={handleJoin} className="flex items-center gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="DS-89X2-2026"
              className="w-40 rounded-lg border border-ice/15 bg-carbon px-3 py-2.5 text-sm uppercase text-ice placeholder-steel outline-none transition focus:border-electric-violet focus:ring-1 focus:ring-electric-violet"
            />
            <button
              type="submit"
              className="flex items-center gap-2 rounded-lg border border-ice/15 px-3 py-2.5 text-sm text-fog hover:bg-graphite"
            >
              <DoorOpen size={16} /> Join
            </button>
          </form>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 rounded-lg border border-signal-orange px-4 py-2.5 label-mono text-signal-orange transition hover:bg-signal-orange/10"
          >
            <Plus size={16} /> Create workspace
          </button>
        </div>

        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
        {loading && <p className="text-sm text-fog">Loading workspaces...</p>}

        {!loading && filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-ice/10 p-12 text-center text-fog">
            {workspaces.length === 0
              ? 'No workspaces yet — create one to get started.'
              : 'No workspaces match your search.'}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((ws) => (
            <div
              key={ws.id}
              onClick={() => navigate(`/workspace/${ws.roomCode}`)}
              className="cursor-pointer rounded-xl border border-ice/10 bg-carbon p-5 transition hover:border-electric-violet/40"
            >
              <h3 className="font-semibold text-ice">{ws.name}</h3>
              {ws.description && <p className="mt-1 line-clamp-2 text-sm text-fog">{ws.description}</p>}

              <div className="mt-3 flex flex-wrap gap-1.5">
                {(ws.languages || []).map((lang) => {
                  const meta = getLanguageMeta(lang)
                  return (
                    <span key={lang} className={`rounded-full px-2 py-0.5 text-xs font-medium text-white ${meta.badge}`}>
                      {meta.label}
                    </span>
                  )
                })}
              </div>

              <div className="mt-4 flex items-center justify-between text-xs text-steel">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCopy(ws.roomCode)
                  }}
                  className="flex items-center gap-1 rounded-md border border-ice/15 px-2 py-1 font-mono text-fog hover:bg-graphite"
                >
                  {copiedCode === ws.roomCode ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  {ws.roomCode}
                </button>
                <span className="label-mono">{formatDateOnly(ws.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      </main>

      <CreateWorkspaceModal open={showCreateModal} onClose={() => setShowCreateModal(false)} onCreate={handleCreate} />
      <LogoutConfirmModal open={showLogoutConfirm} onClose={() => setShowLogoutConfirm(false)} />
      <AccountSettingsModal open={showAccountSettings} onClose={() => setShowAccountSettings(false)} />
    </div>
  )
}
