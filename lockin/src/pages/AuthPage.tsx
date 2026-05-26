import { useState, type FormEvent } from 'react'
import Button from '../components/Button'
import Input from '../components/Input'
import Logo from '../components/Logo'
import ThemeToggle from '../components/ThemeToggle'
import { useAuth } from '../hooks/useAuth'

type AuthMode = 'login' | 'signup'

export default function AuthPage() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setSubmitting(true)

    const result =
      mode === 'login'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password)

    setSubmitting(false)

    if (result.error) {
      setError(result.error)
      return
    }

    if (mode === 'signup') {
      setSuccess('Check your email to confirm your account, then sign in.')
    }
  }

  function switchMode(next: AuthMode) {
    setMode(next)
    setError(null)
    setSuccess(null)
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-10 flex justify-center">
          <Logo />
        </div>

        <div className="mb-8 text-center">
          <h1 className="text-xl font-bold text-text">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            {mode === 'login'
              ? 'Sign in to join focus sessions with friends.'
              : 'Start studying together in synchronized sessions.'}
          </p>
        </div>

        <div className="mb-6 flex rounded-lg border border-border-subtle bg-surface-raised p-1">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={[
              'flex-1 rounded-md py-2 text-sm font-medium transition-colors',
              mode === 'login'
                ? 'bg-surface-overlay text-text'
                : 'text-text-muted hover:text-text-secondary',
            ].join(' ')}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => switchMode('signup')}
            className={[
              'flex-1 rounded-md py-2 text-sm font-medium transition-colors',
              mode === 'signup'
                ? 'bg-surface-overlay text-text'
                : 'text-text-muted hover:text-text-secondary',
            ].join(' ')}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@school.edu"
          />
          <Input
            label="Password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
          />

          {error && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
              {success}
            </p>
          )}

          <Button type="submit" fullWidth disabled={submitting}>
            {submitting
              ? mode === 'login'
                ? 'Signing in…'
                : 'Creating account…'
              : mode === 'login'
                ? 'Log in'
                : 'Sign up'}
          </Button>
        </form>
      </div>
    </div>
  )
}
