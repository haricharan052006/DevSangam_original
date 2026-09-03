import { API_BASE_URL } from '../config/api'

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  let res
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    // fetch() rejects only on a transport-level failure (server down, DNS,
    // offline, CORS preflight) — never on an HTTP error status. Callers have
    // to tell that apart from a real 4xx, so it gets a status of its own
    // rather than leaking a bare "Failed to fetch" TypeError into the UI.
    throw Object.assign(new Error('Could not reach the server. Check your connection and try again.'), { status: 0 })
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // The status rides along on the error so a caller can distinguish "this
    // genuinely does not exist" (404) from something transient worth
    // retrying. Note what deliberately does NOT happen here: a 401 never
    // clears the stored session or forces a redirect. Only an explicit
    // logout does that (see AuthContext), so one hiccuped request can't
    // silently sign the user out mid-navigation.
    throw Object.assign(new Error(data.error || 'Something went wrong'), { status: res.status })
  }
  return data
}

export const api = {
  register: (payload) => request('/api/auth/register', { method: 'POST', body: payload }),
  login: (payload) => request('/api/auth/login', { method: 'POST', body: payload }),
  me: (token) => request('/api/auth/me', { token }),
  resetPasswordWithToken: (payload) => request('/api/auth/reset-password-token', { method: 'POST', body: payload }),
  updateName: (token, name) => request('/api/auth/update-name', { method: 'PUT', body: { name }, token }),

  listWorkspaces: (token) => request('/api/workspaces', { token }),
  createWorkspace: (token, payload) => request('/api/workspaces', { method: 'POST', body: payload, token }),
  getWorkspace: (token, roomCode) => request(`/api/workspaces/${roomCode}`, { token }),
  addFile: (token, roomCode, payload) =>
    request(`/api/workspaces/${roomCode}/files`, { method: 'POST', body: payload, token }),
  deleteFile: (token, roomCode, fileId) =>
    request(`/api/workspaces/${roomCode}/files/${fileId}`, { method: 'DELETE', token }),
  setCoOwner: (token, roomCode, userId) =>
    request(`/api/workspaces/${roomCode}/co-owner`, { method: 'PATCH', body: { userId }, token }),
  updateWorkspace: (token, roomCode, payload) =>
    request(`/api/workspaces/${roomCode}`, { method: 'PATCH', body: payload, token }),
  saveWorkspace: (token, roomCode) => request(`/api/workspaces/${roomCode}/save`, { method: 'POST', token }),
  deleteWorkspace: (token, roomCode) => request(`/api/workspaces/${roomCode}`, { method: 'DELETE', token }),
  removeWorkspaceMember: (token, roomCode) =>
    request(`/api/workspaces/${roomCode}/member`, { method: 'DELETE', token }),

  analyzeCode: (token, payload) => request('/api/ai/analyze', { method: 'POST', body: payload, token }),
}
