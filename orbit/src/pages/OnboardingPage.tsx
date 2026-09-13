import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import Input from '../components/Input'
import Logo from '../components/Logo'
import ThemeToggle from '../components/ThemeToggle'
import { useProfile } from '../hooks/useProfile'

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { saveUsername } = useProfile()
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const result = await saveUsername(username)
    setSubmitting(false)
    if (result.error) setError(result.error)
    else navigate('/', { replace: true })
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

        <h1 className="text-center text-xl font-bold">Choose a username</h1>
        <p className="mt-2 text-center text-sm text-text-secondary">
          Friends will find you by username. Use lowercase letters, numbers, and underscores.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
          <Input
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            placeholder="studybuddy_42"
            autoComplete="username"
            required
            minLength={3}
            maxLength={20}
          />

          {error && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <Button type="submit" fullWidth disabled={submitting}>
            {submitting ? 'Saving…' : 'Continue'}
          </Button>
        </form>
      </div>
    </div>
  )
}
