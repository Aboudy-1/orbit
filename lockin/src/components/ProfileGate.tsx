import { Navigate } from 'react-router-dom'
import { useProfile } from '../hooks/useProfile'

export default function ProfileGate({ children }: { children: React.ReactNode }) {
  const { profile, loading, needsOnboarding } = useProfile()

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-text-secondary text-sm">Loading profile…</p>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4 text-center">
        <p className="text-text-secondary text-sm">
          Could not load profile. Check your Supabase connection and run{' '}
          <code className="text-text">supabase/schema.sql</code>.
        </p>
      </div>
    )
  }

  if (needsOnboarding) {
    return <Navigate to="/onboarding" replace />
  }

  return children
}
