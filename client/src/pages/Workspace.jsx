import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import Editor from '@monaco-editor/react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import toast from 'react-hot-toast'
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  BookmarkPlus,
  Check,
  Copy,
  Download,
  Keyboard,
  Loader2,
  LogOut,
  Moon,
  Pencil,
  Play,
  Presentation,
  RotateCw,
  Settings,
  Sparkles,
  Sun,
  Users,
  X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { getLanguageMeta } from '../lib/languages'
import { formatLocalDateTime } from '../lib/formatDate'
import { getUserColor } from '../lib/collab'
import { CURSOR_COLORS } from '../lib/preferences'
import { usePreferences } from '../hooks/usePreferences'
import { YJS_WS_URL } from '../config/api'
import { decodeRemoteIndex, selectionClassName } from '../lib/remoteCursors'
import { bindYTextToModel, claimRoomBinding } from '../lib/yBinding'
import { useWorkspacePresence } from '../hooks/useWorkspacePresence'
import { useRoomSocket } from '../hooks/useRoomSocket'
import { useExecution } from '../hooks/useExecution'
import { useGovernance } from '../hooks/useGovernance'
import { useVoiceChat } from '../hooks/useVoiceChat'
import { useAiAssistant } from '../hooks/useAiAssistant'
import FileSidebar from '../components/FileSidebar'
import NewFileModal from '../components/NewFileModal'
import DeleteFileModal from '../components/DeleteFileModal'
import ConnectionBadge from '../components/ConnectionBadge'
import PresenceAvatars from '../components/PresenceAvatars'
import TerminalPanel from '../components/TerminalPanel'
import MembersModal from '../components/MembersModal'
import VoiceBar from '../components/VoiceBar'
import ShortcutsModal from '../components/ShortcutsModal'
import AIAssistantPanel from '../components/AIAssistantPanel'
import LogoutConfirmModal from '../components/LogoutConfirmModal'
import Logo from '../components/Logo'
import AccountSettingsModal from '../components/AccountSettingsModal'

export default function Workspace() {
  const { code } = useParams()
  const { token, user } = useAuth()
  const navigate = useNavigate()
  const { preferences } = usePreferences()
  const myCursorColor = CURSOR_COLORS[preferences.cursorColor]?.hex || getUserColor(user?.id)

  const [workspace, setWorkspace] = useState(null)
  const [workspaceMeta, setWorkspaceMeta] = useState(null) // full bootstrap payload for governance
  const [files, setFiles] = useState([])
  const [openFileIds, setOpenFileIds] = useState([])
  const [activeFileId, setActiveFileId] = useState(null)
  const [theme, setTheme] = useState('devsangam-dark')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notFound, setNotFound] = useState(false) // true only for a real 404 — see the bootstrap effect
  const [reloadKey, setReloadKey] = useState(0) // bumped by "Try again" to re-run the bootstrap fetch
  const [showNewFileModal, setShowNewFileModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [copied, setCopied] = useState(false)
  const [editorCopied, setEditorCopied] = useState(false)
  const [editorReady, setEditorReady] = useState(false)
  const [showMembersModal, setShowMembersModal] = useState(false)
  const [showShortcutsModal, setShowShortcutsModal] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [showAccountSettings, setShowAccountSettings] = useState(false)
  const [saved, setSaved] = useState(false) // this user already has the workspace saved to their dashboard
  const [savingWorkspace, setSavingWorkspace] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [savingTitle, setSavingTitle] = useState(false)

  const editorRef = useRef(null)
  const monacoRef = useRef(null)
  const modelsRef = useRef(new Map()) // fileId -> ITextModel
  const collabRef = useRef(null) // current per-file { provider, ydoc, ytext, binding, model }
  const widgetsRef = useRef(new Map()) // clientId -> { widget, domNode, pos }
  const decorationIdsRef = useRef([])
  const myCursorColorRef = useRef(myCursorColor) // kept fresh below; read by the per-file effect at connect time
  const vimStatusRef = useRef(null) // DOM node monaco-vim renders its status bar into
  const peersRef = useRef([])
  const prevRunningRef = useRef(null)

  const { peers, connectionState, files: syncedFiles, filesSynced } = useWorkspacePresence(
    workspace?.roomCode,
    token,
    user,
    myCursorColor
  )

  useEffect(() => {
    peersRef.current = peers
  }, [peers])

  function resolveName(userId) {
    if (userId === user?.id) return 'You'
    return peersRef.current.find((p) => p.id === userId)?.name || 'Someone'
  }

  const handleKicked = useCallback(() => {
    toast.error('You were removed from this room')
    navigate('/dashboard')
  }, [navigate])

  const handleGovernanceNotice = useCallback(
    (kind, msg) => {
      switch (kind) {
        case 'joined':
          toast(`${resolveName(msg.userId)} joined the room`)
          break
        case 'left':
          toast(`${resolveName(msg.userId)} left the room`)
          break
        case 'coowner':
          toast(msg.coOwnerId ? `${resolveName(msg.coOwnerId)} is now Co-Owner` : 'Co-Owner removed')
          break
        case 'role':
          toast(`${resolveName(msg.targetUserId)} is now ${msg.role === 'viewer' ? 'a Viewer' : 'an Editor'}`)
          break
        case 'presentation':
          toast(msg.enabled ? 'Presentation Mode enabled' : 'Presentation Mode disabled')
          break
        case 'muted':
          if (msg.targetUserId === user?.id) {
            toast.error(msg.muted ? 'You were muted by the host' : 'You were unmuted by the host')
          } else {
            toast(`${resolveName(msg.targetUserId)} was ${msg.muted ? 'muted' : 'unmuted'}`)
          }
          break
        case 'mute-all':
          toast.error(
            msg.mutedUserIds.includes(user?.id) ? 'You were muted by the host (Mute All)' : 'Host muted all members'
          )
          break
        case 'unmute-all':
          toast('Host unmuted all members')
          break
        case 'kicked':
          if (msg.targetUserId !== user?.id) toast(`${resolveName(msg.targetUserId)} was removed from the room`)
          break
        case 'error':
          toast.error(msg.message)
          break
        default:
          break
      }
    },
    [user?.id]
  )

  const roomSocket = useRoomSocket(workspace?.roomCode, token)
  const {
    running: execRunning,
    result: execResult,
    liveEvents: execLiveEvents,
    runCode: sendRunCode,
    sendStdin,
    clearResult: clearExecResult,
  } = useExecution(roomSocket)
  const governance = useGovernance(roomSocket, workspaceMeta, user?.id, {
    onKicked: handleKicked,
    onNotice: handleGovernanceNotice,
  })
  const voice = useVoiceChat(roomSocket, user?.id)
  const ai = useAiAssistant(token)
  const runCodeRef = useRef(() => {})

  // Live rename/delete pushed from PATCH/DELETE /api/workspaces/:roomCode
  // (server/routes/workspaces.js), which broadcast over this same /exec
  // socket rather than requiring every connected tab to poll or refetch.
  useEffect(() => {
    if (!roomSocket) return undefined
    return roomSocket.subscribe((msg) => {
      if (msg.type === 'workspace:updated') {
        setWorkspace((prev) => (prev ? { ...prev, ...msg.workspace } : msg.workspace))
        if (msg.byUserId !== user?.id) toast(`Workspace renamed to "${msg.workspace.name}"`)
      } else if (msg.type === 'workspace:deleted') {
        if (msg.byUserId !== user?.id) toast.error('This workspace was deleted by the owner')
        navigate('/dashboard')
      }
    })
  }, [roomSocket, user?.id, navigate])

  // Bootstrap fetch. Guarded on `token` for the same reason useRoomSocket and
  // useWorkspacePresence are: nothing here should ever go out unauthenticated
  // and eat a 401 that isn't really about this workspace.
  useEffect(() => {
    if (!code || !token) return undefined

    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      setNotFound(false)
      try {
        const data = await api.getWorkspace(token, code)
        if (cancelled) return
        setWorkspace(data.workspace)
        setWorkspaceMeta(data)
        setFiles(data.files)
        setSaved(Boolean(data.isSaved))
        if (data.files.length > 0) {
          setOpenFileIds([data.files[0].id])
          setActiveFileId(data.files[0].id)
        }
      } catch (err) {
        if (cancelled) return
        // Only a 404 means the room code is genuinely wrong. Everything else
        // — offline, a 500, a cold-starting server, an expired session — is
        // transient, and used to land on the same dead-end "Workspace not
        // found" screen, which read as the workspace having vanished. Those
        // now keep their real message and offer a retry instead.
        setNotFound(err.status === 404)
        setError(err.message || 'Workspace not found')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [code, token, reloadKey])

  // live file list — the shared Y.Array (via useWorkspacePresence) is the
  // real-time source of truth once synced, so every connected tab (including
  // this one, for its own optimistic local edits) converges on it; a file
  // removed by another client gets its open tab/model cleaned up here too
  useEffect(() => {
    if (!filesSynced) return

    setFiles(syncedFiles)

    const validIds = new Set(syncedFiles.map((f) => f.id))
    modelsRef.current.forEach((model, fileId) => {
      if (!validIds.has(fileId)) {
        model.dispose()
        modelsRef.current.delete(fileId)
      }
    })

    setOpenFileIds((prev) => prev.filter((id) => validIds.has(id)))
    setActiveFileId((prev) => {
      if (prev != null && validIds.has(prev)) return prev
      return syncedFiles[0]?.id ?? null
    })
  }, [syncedFiles, filesSynced])

  const activeFile = useMemo(() => files.find((f) => f.id === activeFileId) || null, [files, activeFileId])

  // dispose all cached Monaco models on unmount
  useEffect(
    () => () => {
      modelsRef.current.forEach((model) => model.dispose())
      modelsRef.current.clear()
    },
    []
  )

  // bind the active file to a per-file Yjs doc + Monaco model whenever it changes
  useEffect(() => {
    if (!editorReady || !activeFile || !workspace || !token) return undefined

    const editor = editorRef.current
    const monacoInstance = monacoRef.current
    if (!editor || !monacoInstance) return undefined

    let model = modelsRef.current.get(activeFile.id)
    if (!model) {
      model = monacoInstance.editor.createModel('', getLanguageMeta(activeFile.language).monaco)
      modelsRef.current.set(activeFile.id, model)
    }
    editor.setModel(model)

    const ydoc = new Y.Doc()
    const roomName = `${workspace.roomCode}::${activeFile.id}`
    const provider = new WebsocketProvider(YJS_WS_URL, roomName, ydoc, { params: { token } })
    const ytext = ydoc.getText('content')
    const unbindText = bindYTextToModel(ytext, model, ydoc, monacoInstance)

    provider.awareness.setLocalStateField('user', {
      id: user.id,
      name: user.name,
      color: myCursorColorRef.current,
    })

    const collab = { provider, ydoc, ytext, model }
    collabRef.current = collab

    function publishLocalSelection() {
      if (editor.getModel() !== model) return
      const sel = editor.getSelection()
      if (!sel) return
      let anchorIdx = model.getOffsetAt(sel.getStartPosition())
      let headIdx = model.getOffsetAt(sel.getEndPosition())
      if (sel.getDirection() === monacoInstance.SelectionDirection.RTL) {
        ;[anchorIdx, headIdx] = [headIdx, anchorIdx]
      }
      provider.awareness.setLocalStateField('selection', {
        anchor: Y.createRelativePositionFromTypeIndex(ytext, anchorIdx),
        head: Y.createRelativePositionFromTypeIndex(ytext, headIdx),
      })
    }

    function renderRemoteCursors() {
      if (collabRef.current !== collab) return

      const activeClientIds = new Set()
      const decorations = []

      provider.awareness.getStates().forEach((state, clientId) => {
        if (clientId === provider.awareness.clientID) return
        if (!state?.user || !state?.selection) return

        const anchorIdx = decodeRemoteIndex(state.selection.anchor, ydoc, ytext)
        const headIdx = decodeRemoteIndex(state.selection.head, ydoc, ytext)
        if (anchorIdx == null || headIdx == null) return

        activeClientIds.add(clientId)
        const startIdx = Math.min(anchorIdx, headIdx)
        const endIdx = Math.max(anchorIdx, headIdx)
        const headPos = model.getPositionAt(headIdx)

        if (startIdx !== endIdx) {
          const startPos = model.getPositionAt(startIdx)
          const endPos = model.getPositionAt(endIdx)
          decorations.push({
            range: new monacoInstance.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
            options: { className: selectionClassName(state.user.color) },
          })
        }

        let entry = widgetsRef.current.get(clientId)
        if (!entry) {
          const domNode = document.createElement('div')
          domNode.className = 'yjs-cursor-label'
          const pos = { lineNumber: headPos.lineNumber, column: headPos.column }
          const widget = {
            getId: () => `remote-cursor-${clientId}`,
            getDomNode: () => domNode,
            getPosition: () => ({
              position: pos,
              preference: [
                monacoInstance.editor.ContentWidgetPositionPreference.ABOVE,
                monacoInstance.editor.ContentWidgetPositionPreference.BELOW,
              ],
            }),
          }
          entry = { widget, domNode, pos }
          widgetsRef.current.set(clientId, entry)
          editor.addContentWidget(widget)
        }
        entry.domNode.textContent = `${state.user.name} (Line ${headPos.lineNumber})`
        entry.domNode.style.background = state.user.color
        entry.pos.lineNumber = headPos.lineNumber
        entry.pos.column = headPos.column
        editor.layoutContentWidget(entry.widget)
      })

      widgetsRef.current.forEach((entry, clientId) => {
        if (!activeClientIds.has(clientId)) {
          editor.removeContentWidget(entry.widget)
          widgetsRef.current.delete(clientId)
        }
      })

      decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, decorations)
    }

    const cursorSub = editor.onDidChangeCursorSelection(publishLocalSelection)
    provider.awareness.on('change', renderRemoteCursors)
    ytext.observe(renderRemoteCursors)
    publishLocalSelection()

    const release = claimRoomBinding(roomName, () => {
      cursorSub.dispose()
      provider.awareness.off('change', renderRemoteCursors)
      ytext.unobserve(renderRemoteCursors)
      widgetsRef.current.forEach((entry) => editor.removeContentWidget(entry.widget))
      widgetsRef.current.clear()
      decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, [])
      unbindText()
      provider.destroy()
      ydoc.destroy()
      if (collabRef.current === collab) collabRef.current = null
    })

    return release
  }, [activeFile?.id, activeFile?.language, editorReady, workspace?.roomCode, token, user?.id])

  // Registered once, before the editor mounts, so 'devsangam-dark' exists
  // as soon as the <Editor theme="devsangam-dark" /> prop asks Monaco for it.
  function handleEditorBeforeMount(monacoInstance) {
    monacoInstance.editor.defineTheme('devsangam-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6c757f', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'a855f7' },
        { token: 'string', foreground: 'd8eaff' },
        { token: 'number', foreground: '8b5cf6' },
      ],
      colors: {
        'editor.background': '#0d0d0f',
        'editor.foreground': '#d8eaff',
        'editor.lineHighlightBackground': '#232529',
        'editor.lineHighlightBorder': '#00000000',
        'editorCursor.foreground': '#a855f7',
        'editor.selectionBackground': '#8b5cf655',
        'editor.inactiveSelectionBackground': '#8b5cf633',
        'editorLineNumber.foreground': '#41464c',
        'editorLineNumber.activeForeground': '#d8eaff',
        'editorGutter.background': '#0d0d0f',
        'editorWidget.background': '#232529',
        'editorWidget.border': '#41464c',
        'editorSuggestWidget.background': '#232529',
        'editorSuggestWidget.selectedBackground': '#8b5cf633',
        'scrollbarSlider.background': '#41464c55',
        'scrollbarSlider.hoverBackground': '#565e6688',
      },
    })
  }

  function handleEditorMount(editor, monacoInstance) {
    editorRef.current = editor
    monacoRef.current = monacoInstance
    setEditorReady(true)
    // runCodeRef is always up to date (updated every render below), so this
    // command — registered once, here, at mount — never closes over stale
    // activeFile/execRunning state.
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter, () => runCodeRef.current())
  }

  // Attaches/detaches Vim or Emacs emulation directly on the live Monaco
  // instance as the keybinding preference changes — both packages patch the
  // editor's own key handling rather than replacing it, so switching back
  // to 'standard' just disposes whichever mode is currently attached.
  // (Requires monaco-editor pinned to 0.45.x in package.json: the default
  // CDN-loaded editor stays on the latest release for everyone, but these
  // two packages import internal monaco-editor modules directly at bundle
  // time, and a newer monaco-editor's package.json "exports" map doesn't
  // resolve their deep import path — 0.45.x predates that map entirely.)
  useEffect(() => {
    if (!editorReady || !editorRef.current) return undefined
    let disposed = false
    let dispose = null

    async function attach() {
      try {
        if (preferences.keybinding === 'vim') {
          const { initVimMode } = await import('monaco-vim')
          if (disposed) return
          const vim = initVimMode(editorRef.current, vimStatusRef.current)
          dispose = () => vim.dispose()
        } else if (preferences.keybinding === 'emacs') {
          const { EmacsExtension } = await import('monaco-emacs')
          if (disposed) return
          const emacs = new EmacsExtension(editorRef.current)
          emacs.start()
          dispose = () => emacs.dispose()
        }
      } catch (err) {
        console.error(`[workspace] failed to load ${preferences.keybinding} keybindings:`, err)
        toast.error(`Could not load ${preferences.keybinding} keybindings — falling back to standard.`)
      }
    }

    attach()
    return () => {
      disposed = true
      dispose?.()
    }
  }, [editorReady, preferences.keybinding])

  function handleRunCode() {
    if (!activeFile || execRunning || !governance.canEdit) return
    if (preferences.autoClearConsole) clearExecResult()
    const content = collabRef.current?.ytext ? collabRef.current.ytext.toString() : ''
    sendRunCode({ fileId: activeFile.id, language: activeFile.language, code: content, stdin: '' })
  }

  function handleAiAction(action) {
    if (!activeFile) return
    const code = collabRef.current?.ytext ? collabRef.current.ytext.toString() : ''
    let selection = ''
    if (editorRef.current) {
      const sel = editorRef.current.getSelection()
      const model = editorRef.current.getModel()
      if (sel && model && !sel.isEmpty()) {
        selection = model.getValueInRange(sel)
      }
    }
    ai.runAction(action, { code, language: activeFile.language, selection })
  }

  // Routed through the Monaco model (not a direct DB write) so the change
  // flows through the same Yjs binding as a normal keystroke — every
  // connected tab, this one included, picks it up via the existing
  // onDidChangeContent -> ytext sync path, no separate broadcast needed.
  function handleApplyAiCode(code) {
    if (!governance.canEdit) {
      toast.error('You do not have permission to edit this file')
      return
    }
    if (!collabRef.current?.model) return
    collabRef.current.model.setValue(code)
    toast.success('Applied AI suggestion to the editor')
  }

  useEffect(() => {
    runCodeRef.current = handleRunCode
  })

  useEffect(() => {
    myCursorColorRef.current = myCursorColor
  })

  // Re-broadcasts the per-file cursor awareness (no reconnect) when the
  // display name or chosen cursor color changes while a file is open — the
  // mirror of the same live update in useWorkspacePresence, but for the
  // per-file collab provider that drives remote cursor labels/selections.
  useEffect(() => {
    if (!collabRef.current || !user) return
    collabRef.current.provider.awareness.setLocalStateField('user', {
      id: user.id,
      name: user.name,
      color: myCursorColor,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.name, myCursorColor, activeFile?.id])

  // lock/unlock the editor whenever role or presentation mode changes —
  // programmatic edits from the Yjs binding still apply while readOnly is
  // set, since that option only blocks direct user keystrokes
  useEffect(() => {
    if (!editorReady || !editorRef.current) return
    editorRef.current.updateOptions({ readOnly: !governance.canEdit })
  }, [governance.canEdit, editorReady])

  // toast when someone else starts a run ("X ran main.py")
  useEffect(() => {
    if (execRunning && !prevRunningRef.current && execRunning.runnerId !== user?.id) {
      const file = files.find((f) => f.id === execRunning.fileId)
      toast(`${execRunning.runnerName} ran ${file?.fileName || 'a file'}`)
    }
    prevRunningRef.current = execRunning
  }, [execRunning, user?.id, files])

  // global Ctrl/Cmd+Enter, for when focus isn't inside the editor — the
  // Monaco command above covers focus inside it; handleRunCode's own
  // `execRunning` guard makes firing both on the same keypress harmless
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        runCodeRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function openFile(fileId) {
    setOpenFileIds((prev) => (prev.includes(fileId) ? prev : [...prev, fileId]))
    setActiveFileId(fileId)
  }

  function closeTab(fileId, e) {
    e.stopPropagation()
    setOpenFileIds((prev) => {
      const next = prev.filter((id) => id !== fileId)
      if (activeFileId === fileId) {
        setActiveFileId(next.length > 0 ? next[next.length - 1] : null)
      }
      return next
    })
  }

  // No optimistic local setFiles here — the server broadcasts file:created /
  // file:deleted over the same presence connection before the HTTP response
  // even returns, so an optimistic append here would race the sync effect's
  // reconciliation and double-apply (that race was exactly the bug: the
  // broadcast lands first, syncedFiles already has the new file, then this
  // handler's own [...prev, data.file] appended it a second time). The
  // Y.Map-backed sync effect is the single source of truth for `files` for
  // every client, creator included — this just triggers the write.
  async function handleCreateFile({ fileName, language }) {
    const data = await api.addFile(token, code, { fileName, language })
    openFile(data.file.id)
    setShowNewFileModal(false)
  }

  async function handleDeleteFile() {
    if (!deleteTarget) return
    await api.deleteFile(token, code, deleteTarget.id)
    setDeleteTarget(null)
  }

  async function handlePromoteCoOwner(targetUserId) {
    await api.setCoOwner(token, code, targetUserId)
  }

  async function handleDemoteCoOwner() {
    await api.setCoOwner(token, code, null)
  }

  function handleCopyCode() {
    navigator.clipboard.writeText(workspace.roomCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  async function handleSaveToDashboard() {
    setSavingWorkspace(true)
    try {
      await api.saveWorkspace(token, code)
      setSaved(true)
      toast.success('Workspace added to dashboard')
    } catch (err) {
      toast.error(err.message || 'Failed to save workspace')
    } finally {
      setSavingWorkspace(false)
    }
  }

  function handleStartEditTitle() {
    setTitleDraft(workspace.name)
    setEditingTitle(true)
  }

  function handleCancelEditTitle() {
    setEditingTitle(false)
  }

  // Only `name` goes in the request body — the backend PATCH treats a
  // missing `description` as "leave it alone" (see server/routes/workspaces.js),
  // so this inline rename can't accidentally wipe the description set via
  // Dashboard's fuller Edit Workspace modal.
  async function handleSaveTitle() {
    const trimmed = titleDraft.trim()
    if (!trimmed) {
      toast.error('Workspace name is required')
      return
    }
    if (trimmed === workspace.name) {
      setEditingTitle(false)
      return
    }
    setSavingTitle(true)
    try {
      const data = await api.updateWorkspace(token, code, { name: trimmed })
      setWorkspace(data.workspace)
      setEditingTitle(false)
      toast.success('Workspace renamed')
    } catch (err) {
      toast.error(err.message || 'Failed to rename workspace')
    } finally {
      setSavingTitle(false)
    }
  }

  function handleCopyEditorContent() {
    if (!activeFile) return
    const content = collabRef.current?.ytext ? collabRef.current.ytext.toString() : ''
    navigator.clipboard.writeText(content).then(() => {
      setEditorCopied(true)
      setTimeout(() => setEditorCopied(false), 1500)
    })
  }

  async function handleExport() {
    const latest = await api.getWorkspace(token, code)
    const zip = new JSZip()
    latest.files.forEach((f) => {
      const isActive = collabRef.current && f.id === activeFile?.id
      const content = isActive ? collabRef.current.ytext.toString() : f.content ?? ''
      zip.file(f.fileName, content)
    })
    const blob = await zip.generateAsync({ type: 'blob' })
    const baseName = (workspace?.name || workspace?.roomCode || 'workspace').replace(/\s+/g, '_')
    saveAs(blob, `${baseName}.zip`)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-void text-fog">
        Loading workspace...
      </div>
    )
  }

  if (error || !workspace) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-void text-ice">
        <p className="text-red-400">{error || 'Workspace not found'}</p>
        <div className="flex items-center gap-2">
          {!notFound && (
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              className="flex items-center gap-2 rounded-lg border border-ice/15 px-3 py-1.5 text-sm text-fog hover:bg-graphite"
            >
              <RotateCw size={16} /> Try again
            </button>
          )}
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 rounded-lg border border-ice/15 px-3 py-1.5 text-sm text-fog hover:bg-graphite"
          >
            <ArrowLeft size={16} /> Back to dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-void text-ice">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ice/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link to="/" className="hidden shrink-0 sm:block">
            <Logo iconSize={22} />
          </Link>
          <button onClick={() => navigate('/dashboard')} className="text-fog hover:text-ice">
            <ArrowLeft size={20} />
          </button>
          <div>
            {editingTitle ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTitle()
                    if (e.key === 'Escape') handleCancelEditTitle()
                  }}
                  maxLength={60}
                  disabled={savingTitle}
                  className="rounded-md border border-electric-violet/50 bg-graphite px-2 py-1 text-sm font-semibold text-ice outline-none focus:ring-1 focus:ring-electric-violet disabled:opacity-60"
                />
                <button
                  onClick={handleSaveTitle}
                  disabled={savingTitle}
                  title="Save"
                  className="rounded-md border border-ice/15 p-1 text-emerald-400 hover:bg-graphite disabled:opacity-50"
                >
                  <Check size={14} />
                </button>
                <button
                  onClick={handleCancelEditTitle}
                  disabled={savingTitle}
                  title="Cancel"
                  className="rounded-md border border-ice/15 p-1 text-fog hover:bg-graphite disabled:opacity-50"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <h1 className="font-semibold">{workspace.name}</h1>
                {governance.isModerator && (
                  <button
                    onClick={handleStartEditTitle}
                    title="Rename workspace"
                    className="rounded-md p-1 text-steel hover:bg-graphite hover:text-ice"
                  >
                    <Pencil size={13} />
                  </button>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <button
                onClick={handleCopyCode}
                className="label-mono flex items-center gap-1 text-electric-violet hover:text-bright-violet"
              >
                {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                {workspace.roomCode}
              </button>
              <span className="label-mono text-steel" title={workspace.createdAt}>
                Created {formatLocalDateTime(workspace.createdAt)}
              </span>
            </div>
          </div>
        </div>

        {/* 2xl, not lg: this header's right-hand button cluster is already
            wide, so showing the pill at a common ~1440px laptop width would
            push the whole row into an unwanted 2-line wrap. 2xl (1536px+)
            keeps it hidden until there's genuinely enough spare room. */}
        <div className="hidden items-center gap-1.5 rounded-full border border-[#8B5CF6]/30 bg-[#18181b]/80 px-3 py-1 font-mono text-xs tracking-wide text-[#a1a1aa] 2xl:flex">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8B5CF6]" />
          Refresh if you encounter a glitch
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PresenceAvatars peers={peers} />
          <ConnectionBadge state={connectionState} />

          <VoiceBar
            voice={voice}
            peers={peers}
            myUserId={user?.id}
            myColor={myCursorColor}
            isModerator={governance.isModerator}
            onMuteAll={governance.muteAll}
            onUnmuteAll={governance.unmuteAll}
          />

          {governance.isModerator && (
            <button
              onClick={() => governance.togglePresentation(!governance.presentationMode)}
              title="Toggle presentation mode"
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                governance.presentationMode
                  ? 'border-electric-violet bg-electric-violet/20 text-electric-violet'
                  : 'border-ice/15 text-fog hover:bg-graphite'
              }`}
            >
              <Presentation size={16} /> Presentation
            </button>
          )}
          {!governance.isModerator && governance.presentationMode && (
            <span className="flex items-center gap-1.5 rounded-full border border-electric-violet/60 bg-electric-violet/10 px-2.5 py-1 text-xs text-electric-violet">
              <Presentation size={12} /> Presentation Mode
            </span>
          )}

          {governance.myRole !== 'owner' &&
            (saved ? (
              <span className="flex items-center gap-2 rounded-lg border border-emerald-900 bg-emerald-950/30 px-3 py-1.5 text-sm text-emerald-300">
                <BookmarkCheck size={16} /> Saved in Dashboard
              </span>
            ) : workspace.settings?.allowMemberSave ? (
              <button
                onClick={handleSaveToDashboard}
                disabled={savingWorkspace}
                className="flex items-center gap-2 rounded-lg border border-electric-violet/50 px-3 py-1.5 text-sm text-electric-violet transition hover:bg-electric-violet/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingWorkspace ? <Loader2 size={16} className="animate-spin" /> : <BookmarkPlus size={16} />}
                Add to Dashboard
              </button>
            ) : (
              <span
                title="The workspace owner has disabled saving this workspace to dashboards"
                className="flex items-center gap-2 rounded-lg border border-ice/10 px-3 py-1.5 text-sm text-steel opacity-60"
              >
                <Bookmark size={16} /> Saving disabled by owner
              </span>
            ))}

          <button
            onClick={() => setShowMembersModal(true)}
            className="flex items-center gap-2 rounded-lg border border-ice/15 px-3 py-1.5 text-sm text-fog hover:bg-graphite"
            title="Members"
          >
            <Users size={16} />
          </button>
          <button
            onClick={() => setShowShortcutsModal(true)}
            className="flex items-center gap-2 rounded-lg border border-ice/15 px-3 py-1.5 text-sm text-fog hover:bg-graphite"
            title="Keyboard shortcuts"
          >
            <Keyboard size={16} />
          </button>
          <button
            onClick={() => setAiOpen((o) => !o)}
            title="AI Assistant"
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
              aiOpen
                ? 'border-electric-violet bg-electric-violet/20 text-electric-violet'
                : 'border-ice/15 text-fog hover:bg-graphite'
            }`}
          >
            <Sparkles size={16} /> AI Assistant
          </button>

          <button
            onClick={handleRunCode}
            disabled={!activeFile || Boolean(execRunning) || !governance.canEdit}
            title="Run code (Ctrl+Enter / Cmd+Enter)"
            className="flex items-center gap-2 rounded-lg border border-signal-orange px-3 py-1.5 label-mono text-signal-orange transition hover:bg-signal-orange/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            {execRunning ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            {execRunning ? 'Running...' : 'Run Code'}
          </button>
          <button
            onClick={() => setTheme((t) => (t === 'devsangam-dark' ? 'light' : 'devsangam-dark'))}
            className="flex items-center gap-2 rounded-lg border border-ice/15 px-3 py-1.5 text-sm text-fog hover:bg-graphite"
            title="Toggle editor theme"
          >
            {theme === 'devsangam-dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 rounded-lg border border-ice/15 px-3 py-1.5 text-sm text-fog hover:bg-graphite"
          >
            <Download size={16} /> Export .zip
          </button>
          <button
            onClick={() => setShowAccountSettings(true)}
            className="flex items-center gap-2 rounded-lg border border-ice/15 px-3 py-1.5 text-sm text-fog hover:bg-graphite"
            title="Account settings"
          >
            <Settings size={16} />
          </button>
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="flex items-center gap-2 rounded-lg border border-ice/15 px-3 py-1.5 text-sm text-fog hover:bg-graphite"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <FileSidebar
          files={files}
          activeFileId={activeFileId}
          onSelectFile={openFile}
          onRequestDelete={setDeleteTarget}
          onNewFile={() => setShowNewFileModal(true)}
          readOnly={!governance.canEdit}
        />

        <div className="flex flex-1 flex-col overflow-hidden">
          {openFileIds.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto border-b border-ice/10 bg-carbon px-2">
              {openFileIds.map((id) => {
                const file = files.find((f) => f.id === id)
                if (!file) return null
                const isActive = id === activeFileId
                return (
                  <button
                    key={id}
                    onClick={() => setActiveFileId(id)}
                    className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
                      isActive ? 'border-electric-violet text-ice' : 'border-transparent text-fog hover:text-ice'
                    }`}
                  >
                    {file.fileName}
                    <span
                      role="button"
                      tabIndex={-1}
                      onClick={(e) => closeTab(id, e)}
                      className="rounded p-0.5 text-steel hover:bg-graphite hover:text-ice"
                    >
                      <X size={12} />
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          <div className="relative min-h-0 flex-1">
            <Editor
              height="100%"
              theme={theme}
              beforeMount={handleEditorBeforeMount}
              onMount={handleEditorMount}
              options={{
                minimap: { enabled: preferences.minimap },
                fontSize: preferences.fontSize,
                tabSize: preferences.tabSize,
                lineNumbers: preferences.lineNumbers ? 'on' : 'off',
                wordWrap: preferences.wordWrap ? 'on' : 'off',
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                fontLigatures: true,
                automaticLayout: true,
              }}
            />
            {activeFile && (
              <button
                onClick={handleCopyEditorContent}
                title="Copy file contents"
                className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-md border border-ice/15 bg-carbon/90 px-2 py-1 label-mono text-fog backdrop-blur hover:border-electric-violet/50 hover:text-ice"
              >
                {editorCopied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                {editorCopied ? 'Copied' : 'Copy'}
              </button>
            )}
            {!activeFile && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-void text-steel">
                Select or create a file to start editing.
              </div>
            )}
          </div>

          {preferences.keybinding === 'vim' && <div ref={vimStatusRef} className="vim-status-bar" />}

          <TerminalPanel
            running={execRunning}
            result={execResult}
            liveEvents={execLiveEvents}
            onClear={clearExecResult}
            onSendStdin={sendStdin}
            canSendStdin={governance.canEdit}
          />
        </div>

        <AIAssistantPanel
          open={aiOpen}
          onClose={() => setAiOpen(false)}
          loading={ai.loading}
          action={ai.action}
          markdown={ai.markdown}
          error={ai.error}
          onRunAction={handleAiAction}
          onApply={handleApplyAiCode}
          canApply={governance.canEdit}
          disabled={!activeFile}
          activeFileName={activeFile?.fileName}
        />
      </div>

      <NewFileModal
        open={showNewFileModal}
        onClose={() => setShowNewFileModal(false)}
        onCreate={handleCreateFile}
        existingNames={files.map((f) => f.fileName)}
      />

      <DeleteFileModal file={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDeleteFile} />

      <MembersModal
        open={showMembersModal}
        onClose={() => setShowMembersModal(false)}
        peers={peers}
        myUserId={user?.id}
        getRoleFor={governance.getRoleFor}
        isModerator={governance.isModerator}
        mutedUserIds={governance.mutedUserIds}
        onPromoteCoOwner={handlePromoteCoOwner}
        onDemoteCoOwner={handleDemoteCoOwner}
        onSetRole={governance.setMemberRole}
        onKick={governance.kickMember}
        onMute={governance.muteMember}
      />

      <ShortcutsModal open={showShortcutsModal} onClose={() => setShowShortcutsModal(false)} />
      <LogoutConfirmModal open={showLogoutConfirm} onClose={() => setShowLogoutConfirm(false)} />
      <AccountSettingsModal open={showAccountSettings} onClose={() => setShowAccountSettings(false)} />
    </div>
  )
}
