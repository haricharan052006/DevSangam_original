import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import Workspace from './pages/Workspace'
import ProtectedRoute from './components/ProtectedRoute'
import ParticleBackground from './components/ParticleBackground'

// The marketing entry point for signed-out visitors — but a signed-in user
// landing on "/" (a bookmark, a shared link) should go straight to their
// workspaces, not see the pitch again.
function HomeRoute() {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <Landing />
}

// Single canvas mount shared by every signed-out route, so it persists
// across Login <-> Register <-> Landing navigation instead of each page
// mounting (and re-seeding) its own. Pages under this layout must not paint
// their own opaque background — see the "bg-transparent" note on each of
// their root wrappers.
//
// z-0, not a negative z-index: html/body/#root are all position:static with
// no stacking context of their own, and body has its own opaque
// background-color (index.css). Per the CSS stacking spec, a non-positioned
// ancestor's own box paints as an ordinary in-flow descendant of the root
// stacking context — which sits ABOVE negative-z-index descendants of that
// same context. So a `-z-10` canvas here was rendering behind body's own
// black background, fully hidden, even though it was drawing particles
// correctly the whole time (confirmed via canvas pixel sampling). Giving the
// canvas z-0 and every foreground wrapper an explicit z-10 (see Landing.jsx
// / AuthCard.jsx) puts both in the same "positioned descendant" stacking
// bucket, ordered above body's box and correctly relative to each other.
function PublicLayout() {
  return (
    <>
      <ParticleBackground className="pointer-events-none fixed inset-0 z-0 h-screen w-screen" />
      <Outlet />
    </>
  )
}

function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/workspace/:code" element={<Workspace />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App
