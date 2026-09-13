import { useCallback, useEffect, useState } from 'react'
import { fetchFriendActiveSessions } from '../lib/api'
import { supabase } from '../lib/supabase'
import type { FocusSession } from '../lib/types'

export type FriendSession = FocusSession & {
  host_username?: string
}

export function useFriendActiveSessions(friendIds: string[]) {
  const [sessions, setSessions] = useState<FriendSession[]>([])
  const [loading, setLoading] = useState(true)
  const idsKey = friendIds.join(',')

  const load = useCallback(async () => {
    if (!friendIds.length) {
      setSessions([])
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error } = await fetchFriendActiveSessions(friendIds)
    if (error) {
      setSessions([])
      setLoading(false)
      return
    }

    const rows = (data ?? []) as FocusSession[]
    const hostIds = [...new Set(rows.map((s) => s.host_id))]
    const { data: hosts } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', hostIds)

    const hostMap = Object.fromEntries(
      (hosts ?? []).map((h) => [h.id, h.username as string]),
    )

    setSessions(
      rows.map((s) => ({
        ...s,
        host_username: hostMap[s.host_id],
      })),
    )
    setLoading(false)
  }, [idsKey, friendIds])

  useEffect(() => {
    load()
  }, [load])

  // Smart realtime handler: removes ended sessions immediately from local state
  // (optimistic update), then does a full re-fetch for consistency.
  const handleRealtimeEvent = useCallback(
    (payload: { eventType: string; new: Record<string, unknown> | null; old: Record<string, unknown> | null }) => {
      console.log('[useFriendActiveSessions] realtime payload received:', payload.eventType, payload.new)

      const { eventType, new: newData, old: oldData } = payload

      // DELETE — remove the session immediately
      if (eventType === 'DELETE') {
        const deletedId = (oldData as { id?: string })?.id
        if (deletedId) {
          console.log('[useFriendActiveSessions] DELETE event, removing session:', deletedId)
          setSessions((prev) => prev.filter((s) => s.id !== deletedId))
        }
        return
      }

      // INSERT — do a full re-fetch to pick up the new session
      if (eventType === 'INSERT') {
        load()
        return
      }

      // UPDATE — check if the session ended; if so, remove it immediately
      if (eventType === 'UPDATE') {
        const updated = newData as Partial<FocusSession> | null
        if (updated?.id) {
          const sessionEnded = updated.is_active === false || updated.phase === 'idle'
          if (sessionEnded) {
            console.log('[useFriendActiveSessions] UPDATE event, session ended, removing:', updated.id)
            setSessions((prev) => prev.filter((s) => s.id !== updated.id))
            return
          }
        }
      }

      // Fallback: full re-fetch for other cases
      load()
    },
    [load],
  )

  useEffect(() => {
    if (!friendIds.length) return

    console.log('[useFriendActiveSessions] subscribing to realtime changes for friend sessions')

    const channel = supabase
      .channel('friend-active-sessions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'focus_sessions' },
        (payload) => handleRealtimeEvent(payload),
      )
      .subscribe((status) => {
        console.log('[useFriendActiveSessions] subscription status:', status)
      })

    return () => {
      console.log('[useFriendActiveSessions] unsubscribing')
      supabase.removeChannel(channel)
    }
  }, [friendIds, handleRealtimeEvent])

  return { sessions, loading, reload: load }
}
