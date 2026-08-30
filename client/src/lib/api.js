import { API_BASE_URL } from '../config/api'

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || 'Something went wrong')
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

  analyzeCode: (token, payload) => request('/api/ai/analyze', { method: 'POST', body: payload, token }),
}
