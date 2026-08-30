// Single source of truth for backend base URLs. Every module that opens a
// network or socket connection (REST calls, OAuth redirects, the Yjs
// provider, the exec/governance/voice websocket) imports from here instead
// of hardcoding http://localhost:5000 or independently re-deriving its own
// import.meta.env.VITE_* fallback.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
export const WS_BASE_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:5000'

export const YJS_WS_URL = `${WS_BASE_URL}/yjs`
export const EXEC_WS_URL = `${WS_BASE_URL}/exec`

export const GOOGLE_LOGIN_URL = `${API_BASE_URL}/api/auth/google`
export const GOOGLE_RECOVER_URL = `${API_BASE_URL}/api/auth/google/recover`
