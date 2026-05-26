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

  useEffect(() => {
    if (!friendIds.length) return

    const channel = supabase
      .channel('friend-active-sessions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'focus_sessions' },
        () => load(),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [friendIds, load])

  return { sessions, loading, reload: load }
}
