import { useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, LogIn, Lock, Mail } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import AuthCard from '../components/AuthCard'
import FormField from '../components/FormField'
import GoogleButton from '../components/GoogleButton'
import { ErrorBox, InfoBox, SubmitButton } from '../components/FormBits'
import { GOOGLE_LOGIN_URL } from '../config/api'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) {
      setError('Please fill in all fields.')
      return
    }
    setLoading(true)
    try {
      await login(email.trim(), password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to continue to your workspaces"
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-medium text-electric-violet hover:text-bright-violet">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {location.state?.resetSuccess && (
          <InfoBox message="Password reset successful. Please sign in with your new password." />
        )}
        {searchParams.get('error') === 'google_auth_failed' && (
          <ErrorBox message="Google sign-in failed. Please try again." />
        )}

        <FormField
          icon={Mail}
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jane@example.com"
          autoComplete="email"
          required
        />
        <FormField
          icon={Lock}
          label="Password"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          rightElement={
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="text-steel hover:text-ice"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          }
        />

        <div className="flex justify-end text-sm">
          <Link to="/forgot-password" className="text-electric-violet hover:text-bright-violet">
            Forgot password?
          </Link>
        </div>

        {error && <ErrorBox message={error} />}

        <SubmitButton loading={loading} label="Sign in" loadingLabel="Signing in..." icon={LogIn} />
      </form>

      <div className="my-6 flex items-center gap-3 text-xs font-medium text-fog">
        <div className="h-px flex-1 bg-ice/15" />
        OR
        <div className="h-px flex-1 bg-ice/15" />
      </div>

      <GoogleButton href={GOOGLE_LOGIN_URL} label="Continue with Google" />
    </AuthCard>
  )
}
