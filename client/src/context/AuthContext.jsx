import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { api } from '../lib/api'

const AuthContext = createContext(null)

function loadStoredAuth() {
  try {
    const token = localStorage.getItem('ds_token')
    const userRaw = localStorage.getItem('ds_user')
    return token && userRaw ? { token, user: JSON.parse(userRaw) } : { token: null, user: null }
  } catch {
    return { token: null, user: null }
  }
}

export function AuthProvider({ children }) {
  const [{ token, user }, setAuth] = useState(loadStoredAuth)
  const navigate = useNavigate()

  // `useNavigate()` hands back a NEW function identity after every location
  // change — react-router's non-data `useNavigateUnstable` memoizes the
  // callback on the current pathname — so any effect that lists it as a
  // dependency re-runs on every client-side navigation in the app. Effects
  // that only *call* navigate read it through this ref instead, which keeps
  // them genuinely one-shot. See the OAuth exchange below.
  const navigateRef = useRef(navigate)
  useEffect(() => {
    navigateRef.current = navigate
  })

  // Latches the single OAuth token -> session exchange for this page load.
  const oauthExchangeRef = useRef(null)

  // Captured once, on the very first render — not inside the effect below.
  // StrictMode (see main.jsx) double-invokes effects in dev: mount, cleanup,
  // mount again. The old version of this effect read `token` straight from
  // `window.location.search` AND stripped it from the URL in the same pass,
  // so the *first* (later-cancelled) invocation deleted the query param
  // before the *second*, real invocation ever ran — which then found no
  // token in the URL and silently no-op'd. Net effect: the OAuth redirect
  // landed on /login, the URL got cleaned, and the user was just never
  // logged in. Reading the token into state up front decouples "do we have
  // a token to process" from "has the URL been stripped yet", so it survives
  // the double-invoke.
  const [oauthToken] = useState(() => new URLSearchParams(window.location.search).get('token'))

  const persist = useCallback((nextToken, nextUser) => {
    localStorage.setItem('ds_token', nextToken)
    localStorage.setItem('ds_user', JSON.stringify(nextUser))
    setAuth({ token: nextToken, user: nextUser })
  }, [])

  // Google OAuth login lands back on the client as `?token=<jwt>` (see
  // GET /api/auth/google/callback). There's no user object in the redirect,
  // so we exchange the token for one via /me, then persist exactly like a
  // normal email/password login and drop the token off the URL so it can't
  // be re-shared/bookmarked with the redirect-history back button.
  useEffect(() => {
    // One exchange per page load, full stop — and `oauthExchangeRef`, not the
    // dependency array, is what guarantees it. The array can't: `navigate`
    // used to be listed here, and its identity churns on every location
    // change (see navigateRef above), so this whole effect re-ran on every
    // single client-side navigation. `oauthToken` stays latched for the life
    // of the SPA session, so each of those re-runs fired another /me and, on
    // success, `navigate('/dashboard', { replace: true })` — which is exactly
    // why opening a workspace rendered "Loading workspace..." for about one
    // round-trip and then snapped back to the dashboard, and why a hard
    // refresh "fixed" it: the reload re-reads a URL whose token param this
    // effect already stripped, so `oauthToken` comes back null and the whole
    // thing no-ops.
    if (!oauthToken || oauthExchangeRef.current) return

    // Strip the token from the visible URL immediately (before the async
    // lookup below), rather than after: navigate() further down mutates
    // browser history too, and doing that first would race a later
    // window.history.replaceState() built from the now-stale /login path.
    const params = new URLSearchParams(window.location.search)
    params.delete('token')
    const search = params.toString()
    window.history.replaceState({}, '', `${window.location.pathname}${search ? `?${search}` : ''}`)

    // Latched in the ref before the first await, and deliberately NOT
    // cancelled from a cleanup. StrictMode (see main.jsx) double-invokes
    // effects as mount, cleanup, mount: the guard above already makes the
    // second invocation a no-op, so a `cancelled` flag set by the cleanup in
    // between would abort the only exchange that ever starts and leave the
    // user silently never logged in. Letting the single owning exchange run
    // to completion — and routing its redirect through navigateRef so it
    // lands wherever the app currently is — keeps the one-shot guarantee and
    // the StrictMode fix compatible with each other.
    oauthExchangeRef.current = (async () => {
      try {
        const data = await api.me(oauthToken)
        persist(oauthToken, data.user)
        navigateRef.current('/dashboard', { replace: true })
      } catch {
        // Expired/invalid token from the redirect — nothing to recover, but
        // tell the user rather than leaving them silently logged out.
        toast.error('Google sign-in link expired or was already used. Please try again.')
      }
    })()
  }, [oauthToken, persist])

  const login = useCallback(
    async (email, password) => {
      const data = await api.login({ email, password })
      persist(data.token, data.user)
      return data.user
    },
    [persist]
  )

  const register = useCallback(
    async (name, email, password) => {
      const data = await api.register({ name, email, password })
      persist(data.token, data.user)
      return data.user
    },
    [persist]
  )

  const logout = useCallback(() => {
    localStorage.removeItem('ds_token')
    localStorage.removeItem('ds_user')
    setAuth({ token: null, user: null })
  }, [])

  // Merges a partial user update (e.g. the response from PUT
  // /api/auth/update-name) into the cached user so the UI reflects it
  // immediately, without a re-login or a page refresh.
  const updateUser = useCallback((patch) => {
    setAuth((prev) => {
      const nextUser = { ...prev.user, ...patch }
      localStorage.setItem('ds_user', JSON.stringify(nextUser))
      return { ...prev, user: nextUser }
    })
  }, [])

  const value = { token, user, isAuthenticated: Boolean(token), login, register, logout, updateUser }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
