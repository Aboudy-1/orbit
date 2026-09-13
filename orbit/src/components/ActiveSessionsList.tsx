import { useNavigate } from 'react-router-dom'
import Button from './Button'
import type { FriendSession } from '../hooks/useFriendActiveSessions'
import { joinFocusSession } from '../lib/api'
import { PHASE_LABELS } from '../lib/types'
import { useAuth } from '../hooks/useAuth'
import { useState } from 'react'

type ActiveSessionsListProps = {
  sessions: FriendSession[]
  loading?: boolean
  mySessionId?: string | null
  emptyMessage?: string
}

export default function ActiveSessionsList({
  sessions,
  loading,
  mySessionId,
  emptyMessage = 'No active sessions from friends right now.',
}: ActiveSessionsListProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [joining, setJoining] = useState<string | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)

  async function handleJoin(sessionId: string) {
    if (!user?.id) return
    setJoining(sessionId)
    setJoinError(null)
    const { error } = await joinFocusSession(sessionId, user.id)
    setJoining(null)
    if (error) {
      setJoinError(error.message)
      return
    }
    navigate(`/session/${sessionId}`)
  }

  if (loading) {
    return <p className="text-sm text-text-muted">Loading sessions…</p>
  }

  if (!sessions.length) {
    return <p className="text-sm text-text-muted">{emptyMessage}</p>
  }

  return (
    <div className="space-y-3">
      {joinError && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {joinError}
        </p>
      )}
      <ul className="space-y-2">
        {sessions.map((s) => {
          const isMine = mySessionId === s.id
          return (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{s.title}</p>
                <p className="text-xs text-text-muted">
                  Host @{s.host_username ?? 'unknown'} · {PHASE_LABELS[s.phase]}
                  {s.phase !== 'idle' && ' · in progress'}
                </p>
              </div>
              {isMine ? (
                <Button variant="secondary" onClick={() => navigate(`/session/${s.id}`)}>
                  Open
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => handleJoin(s.id)}
                  disabled={!!mySessionId || joining === s.id}
                >
                  {joining === s.id ? 'Joining…' : 'Join'}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
