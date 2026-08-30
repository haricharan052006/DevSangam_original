import { AlertCircle, Loader2 } from 'lucide-react'

export function ErrorBox({ message }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
      <AlertCircle size={16} /> {message}
    </div>
  )
}

export function InfoBox({ message }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-emerald-900 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-300">
      {message}
    </div>
  )
}

export function SubmitButton({ loading, label, loadingLabel, icon: Icon }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-electric-violet py-2.5 text-sm font-medium text-white transition hover:bg-bright-violet disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? <Loader2 className="animate-spin" size={18} /> : Icon && <Icon size={18} />}
      {loading ? loadingLabel : label}
    </button>
  )
}
