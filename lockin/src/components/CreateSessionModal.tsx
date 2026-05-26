import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { createFocusSession } from '../lib/api'
import Button from './Button'
import Input from './Input'

type CreateSessionModalProps = {
  open: boolean
  onClose: () => void
  hostId: string
}

export default function CreateSessionModal({ open, onClose, hostId }: CreateSessionModalProps) {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [focusMin, setFocusMin] = useState(25)
  const [breakMin, setBreakMin] = useState(5)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const creatingRef = useRef(false)

  if (!open) return null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (creatingRef.current) return
    creatingRef.current = true
    setSubmitting(true)
    setError(null)

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
