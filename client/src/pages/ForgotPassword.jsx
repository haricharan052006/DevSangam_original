import { useSearchParams, Link } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import AuthCard from '../components/AuthCard'
import GoogleButton from '../components/GoogleButton'
import { ErrorBox } from '../components/FormBits'
import { GOOGLE_RECOVER_URL } from '../config/api'

const ERROR_MESSAGES = {
  no_matching_account: "We couldn't find a DevSangam account for that Google email address.",
  google_no_email: 'Your Google account did not share an email address with us — please try a different Google account.',
}

export default function ForgotPassword() {
  const [searchParams] = useSearchParams()
  const errorCode = searchParams.get('error')
  const errorMessage = errorCode && (ERROR_MESSAGES[errorCode] || 'Something went wrong verifying your Google account.')

  return (
    <AuthCard
      title="Forgot password"
      subtitle="Reset your password by verifying your identity with Google"
      footer={
        <>
          Remembered it?{' '}
          <Link to="/login" className="font-medium text-electric-violet hover:text-bright-violet">
            Back to sign in
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-ice/15 bg-graphite px-3 py-2.5 text-sm text-ice">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-electric-violet" />
          <span>
            Sign in with the Google account tied to your DevSangam login. If it matches, you&apos;ll be taken straight
            to a page to set a new password.
          </span>
        </div>

        {errorMessage && <ErrorBox message={errorMessage} />}

        <GoogleButton href={GOOGLE_RECOVER_URL} label="Verify with Google to Reset Password" />
      </div>
    </AuthCard>
  )
}
