import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Play, Users } from 'lucide-react'
import ActiveSessionsList from '../components/ActiveSessionsList'
import AppShell, { StatusPicker } from '../components/AppShell'
import Button from '../components/Button'
import CreateSessionModal from '../components/CreateSessionModal'
import { useAuth } from '../hooks/useAuth'
import { useFriendActiveSessions } from '../hooks/useFriendActiveSessions'
import { useFriends } from '../hooks/useFriends'
import { useProfile } from '../hooks/useProfile'

export default function DashboardPage() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const { friends, loading: friendsLoading } = useFriends(user?.id)
  const [modalOpen, setModalOpen] = useState(false)

  const friendIds = useMemo(() => friends.map((f) => f.friend_id), [friends])
  const { sessions: friendSessions, loading: sessionsLoading } =
    useFriendActiveSessions(friendIds)

  const mySessionId = profile?.current_session_id

  return (
    <AppShell>
      <div className="flex flex-col gap-10">
        <section>
          <h1 className="text-2xl font-bold">
            Hey, {profile?.display_name ?? profile?.username}
          </h1>
          <p className="mt-1 text-text-secondary">Study together with friends in sync.</p>

          {mySessionId && (
            <div className="mt-4 rounded-lg border border-accent/30 bg-accent-muted px-4 py-3">
              <p className="text-sm text-text-secondary">You&apos;re in a session</p>
              <Link
                to={`/session/${mySessionId}`}
                className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
              >
                <Play size={14} />
                Return to session room
              </Link>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={() => setModalOpen(true)} disabled={!!mySessionId}>
              Create Session
            </Button>
            <Link to="/friends">
              <Button variant="secondary">
                <Users size={16} />
                Friends
              </Button>
            </Link>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-medium text-text-secondary">Friends&apos; active sessions</h2>
          <p className="mt-1 text-xs text-text-muted">
            Join a session hosted by someone you follow.
          </p>
          <div className="mt-3">
            <ActiveSessionsList
              sessions={friendSessions}
              loading={friendsLoading || sessionsLoading}
              mySessionId={mySessionId}
              emptyMessage={
                friends.length === 0
                  ? 'Add friends to see their sessions here.'
                  : 'No active sessions right now. Ask a friend to create one!'
              }
            />
          </div>
        </section>

        <section>
          <h2 className="text-sm font-medium text-text-secondary">Your status</h2>
          <div className="mt-3">
            <StatusPicker />
          </div>
        </section>
      </div>

      {user && (
        <CreateSessionModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          hostId={user.id}
        />
      )}
    </AppShell>
  )
}
