import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Lock, Mail, User, UserPlus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import AuthCard from '../components/AuthCard'
import FormField from '../components/FormField'
import GoogleButton from '../components/GoogleButton'
import { ErrorBox, SubmitButton } from '../components/FormBits'
import { GOOGLE_LOGIN_URL } from '../config/api'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_NAME_LENGTH = 60

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!name.trim() || !email.trim() || !password) {
      setError('Please fill in all fields.')
      return
    }
    if (name.trim().length > MAX_NAME_LENGTH) {
      setError(`Display name must be ${MAX_NAME_LENGTH} characters or fewer.`)
      return
    }
    if (!EMAIL_RE.test(email.trim())) {
      setError('Please enter a valid email address.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      await register(name.trim(), email.trim(), password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const eyeToggle = (
    <button
      type="button"
      onClick={() => setShowPassword((s) => !s)}
      className="text-steel hover:text-ice"
    >
      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  )

  return (
    <AuthCard
      title="Create your account"
      subtitle="Join DevSangam and start collaborating"
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-electric-violet hover:text-bright-violet">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField
          icon={User}
          label="Display Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Doe"
          autoComplete="name"
          required
        />
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
          autoComplete="new-password"
          rightElement={eyeToggle}
        />
        <FormField
          icon={Lock}
          label="Confirm password"
          type={showPassword ? 'text' : 'password'}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
        />

        {error && <ErrorBox message={error} />}

        <SubmitButton loading={loading} label="Create account" loadingLabel="Creating account..." icon={UserPlus} />
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
