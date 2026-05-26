import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function handleCallback() {
      const code = searchParams.get('code')

      // PKCE flow — exchange the code for a session
      if (code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code)
        if (exchangeError) {
          setError(exchangeError.message)
          return
        }
        // Session set by onAuthStateChange in AuthProvider; redirect to home
        navigate('/', { replace: true })
        return
      }

      // No code param — might already have a session from hash fragment
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        navigate('/', { replace: true })
        return
      }

      setError('No authentication code found in the URL. Try signing in again.')
    }

    handleCallback()
  }, [navigate, searchParams])

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4">
        <h1 className="text-xl font-bold text-text">Authentication Error</h1>
        <p className="text-sm text-danger">{error}</p>
        <button
          onClick={() => navigate('/auth', { replace: true })}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
        >
          Back to sign in
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh items-center justify-center">
      <p className="text-text-secondary text-sm">Completing sign in…</p>
    </div>
  )
}