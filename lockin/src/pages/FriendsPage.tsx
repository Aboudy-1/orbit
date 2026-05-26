import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, UserPlus } from 'lucide-react'
import ActiveSessionsList from '../components/ActiveSessionsList'
import AppShell from '../components/AppShell'
import Button from '../components/Button'
import Input from '../components/Input'
import StatusBadge from '../components/StatusBadge'
import { useAuth } from '../hooks/useAuth'
import { useFriendActiveSessions } from '../hooks/useFriendActiveSessions'
import { useFriends } from '../hooks/useFriends'
import { useProfile } from '../hooks/useProfile'

export default function FriendsPage() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const {
    friends,
    incoming,
    outgoing,
    searchResults,
    loading,
    search,
    sendRequest,
    respond,
  } = useFriends(user?.id)

  const friendIds = useMemo(() => friends.map((f) => f.friend_id), [friends])
  const { sessions: friendSessions, loading: sessionsLoading } =
    useFriendActiveSessions(friendIds)

  const [query, setQuery] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleSearch() {
    setActionError(null)
    await search(query)
  }

  async function handleSend(toId: string) {
    setActionError(null)
    const { error } = await sendRequest(toId)
    if (error) setActionError(error)
  }

  async function handleRespond(requestId: string, accept: boolean) {
    const req = incoming.find((r) => r.id === requestId)
    if (!req) return
    setActionError(null)
    const { error } = await respond(req, accept)
    if (error) setActionError(error)
  }

  return (
    <AppShell maxWidth="lg">
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text"
      >
        <ArrowLeft size={16} />
        Back to dashboard
      </Link>

      <h1 className="text-2xl font-bold">Friends</h1>
      <p className="mt-1 text-text-secondary">Search by username and join their study sessions.</p>

      {actionError && (
        <p className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {actionError}
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-medium text-text-secondary">Active sessions</h2>
        <div className="mt-3">
          <ActiveSessionsList
            sessions={friendSessions}
            loading={sessionsLoading}
            mySessionId={profile?.current_session_id}
          />
        </div>
      </section>

      <section className="mt-10">
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              label="Search username"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="friend_username"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={handleSearch}>Search</Button>
          </div>
        </div>

        {searchResults.length > 0 && (
          <ul className="mt-4 divide-y divide-border-subtle rounded-lg border border-border-subtle">
            {searchResults.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-3">
                <span className="font-medium">@{p.username}</span>
                <Button variant="secondary" onClick={() => handleSend(p.id)}>
                  <UserPlus size={14} />
                  Add
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {incoming.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-medium text-text-secondary">Incoming requests</h2>
          <ul className="mt-3 divide-y divide-border-subtle rounded-lg border border-border-subtle">
            {incoming.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span>@{r.from_profile?.username ?? 'unknown'}</span>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => handleRespond(r.id, false)}>
                    Decline
                  </Button>
                  <Button onClick={() => handleRespond(r.id, true)}>Accept</Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {outgoing.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-medium text-text-secondary">Sent requests</h2>
          <ul className="mt-3 divide-y divide-border-subtle rounded-lg border border-border-subtle">
            {outgoing.map((r) => (
              <li key={r.id} className="px-4 py-3 text-sm text-text-secondary">
                Pending → @{r.to_profile?.username ?? 'unknown'}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-sm font-medium text-text-secondary">Your friends</h2>
        {loading ? (
          <p className="mt-3 text-sm text-text-muted">Loading…</p>
        ) : friends.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">No friends yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border-subtle rounded-lg border border-border-subtle">
            {friends.map((f) => (
              <li key={f.friend_id} className="flex items-center justify-between px-4 py-3">
                <span className="font-medium">@{f.friend_profile?.username ?? 'unknown'}</span>
                {f.friend_profile && <StatusBadge status={f.friend_profile.status} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  )
}
