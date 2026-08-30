import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { KeyRound, Eye, EyeOff, Lock, ShieldAlert } from 'lucide-react'
import { api } from '../lib/api'
import AuthCard from '../components/AuthCard'
import FormField from '../components/FormField'
import { ErrorBox, SubmitButton } from '../components/FormBits'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const resetToken = searchParams.get('resetToken')
  const email = searchParams.get('email')

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!newPassword || !confirmPassword) {
      setError('Please fill in all fields.')
      return
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      await api.resetPasswordWithToken({ resetToken, newPassword })
      navigate('/login', { state: { resetSuccess: true } })
    } catch (err) {
      setError(err.message || 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  if (!resetToken) {
    return (
      <AuthCard
        title="Invalid reset link"
        subtitle="This password reset link is missing or malformed"
        footer={
          <Link to="/forgot-password" className="font-medium text-electric-violet hover:text-bright-violet">
            Start over
          </Link>
        }
      >
        <ErrorBox message="We couldn't find a reset token in this link. Please verify with Google again to get a new one." />
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Set a new password"
      subtitle="Choose a new password for your account"
      footer={
        <>
          Remembered it?{' '}
          <Link to="/login" className="font-medium text-electric-violet hover:text-bright-violet">
            Back to sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {email && (
          <div className="flex items-start gap-2 rounded-lg border border-ice/15 bg-graphite px-3 py-2.5 text-sm text-ice">
            <ShieldAlert size={18} className="mt-0.5 shrink-0 text-electric-violet" />
            <span>
              Resetting the password for <span className="font-medium text-ice">{email}</span>
            </span>
          </div>
        )}

        <FormField
          icon={Lock}
          label="New password"
          type={showPassword ? 'text' : 'password'}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
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
        <FormField
          icon={Lock}
          label="Confirm new password"
          type={showPassword ? 'text' : 'password'}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
        />

        {error && <ErrorBox message={error} />}

        <SubmitButton loading={loading} label="Reset password" loadingLabel="Resetting..." icon={KeyRound} />
      </form>
    </AuthCard>
  )
}
