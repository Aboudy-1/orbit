import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { createFocusSession, setBreakDuration, setFocusDuration } from '../lib/api'
import { useProfile } from '../hooks/useProfile'
import Button from './Button'
import Input from './Input'

type CreateSessionModalProps = {
  open: boolean
  onClose: () => void
  hostId: string
}

export default function CreateSessionModal({ open, onClose, hostId }: CreateSessionModalProps) {
  const navigate = useNavigate()
  const { profile } = useProfile()
  const [title, setTitle] = useState('')
  const [focusMin, setFocusMin] = useState(profile?.focus_duration ?? 25)
  const [breakMin, setBreakMin] = useState(profile?.break_duration ?? 5)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const creatingRef = useRef(false)

  // Sync the menu's duration inputs with the user's saved settings so creation
  // defaults match the last persisted choice (available even after a refresh,
  // since the profile is loaded before the dashboard is interactive).
  useEffect(() => {
    if (!open) return
    setFocusMin(profile?.focus_duration ?? 25)
    setBreakMin(profile?.break_duration ?? 5)
  }, [open, profile?.focus_duration, profile?.break_duration])

  if (!open) return null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (creatingRef.current) return
    creatingRef.current = true
    setSubmitting(true)
    setError(null)

    // Persist the menu's selected durations to the user's saved settings BEFORE
    // creating/starting the session, so the running session and the persisted
    // settings are always in sync with the latest menu choice. Awaiting these
    // writes guarantees the profile is updated before the session room loads,
    // preventing a race where a stale saved value is read at session start.
    await setFocusDuration(hostId, focusMin)
    await setBreakDuration(hostId, breakMin)

    const { session, error: err } = await createFocusSession(hostId, focusMin, breakMin, title)
    creatingRef.current = false
    setSubmitting(false)

    if (err || !session) {
      setError(err?.message ?? 'Could not create session')
      return
    }

    onClose()
    navigate(`/session/${session.id}`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface-raised p-6 shadow-xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-bold">Create focus session</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-secondary hover:bg-surface-overlay hover:text-text"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Session title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Evening study"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Focus (minutes)"
              type="number"
              min={1}
              max={120}
              required
              value={focusMin}
              onChange={(e) => setFocusMin(Number(e.target.value))}
            />
            <Input
              label="Break (minutes)"
              type="number"
              min={1}
              max={30}
              required
              value={breakMin}
              onChange={(e) => setBreakMin(Number(e.target.value))}
            />
          </div>

          {error && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" fullWidth onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" fullWidth disabled={submitting}>
              {submitting ? 'Creating…' : 'Create & join'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
