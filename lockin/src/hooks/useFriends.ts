import { useCallback, useEffect, useState } from 'react'
import { respondFriendRequest, searchProfiles, sendFriendRequest } from '../lib/api'
import { supabase } from '../lib/supabase'
import type { FriendRequest, Friendship, Profile } from '../lib/types'

export function useFriends(userId: string | undefined) {
  const [friends, setFriends] = useState<Friendship[]>([])
  const [incoming, setIncoming] = useState<FriendRequest[]>([])
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([])
  const [searchResults, setSearchResults] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)

    const { data: friendRows } = await supabase
      .from('friendships')
      .select('*')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)

    const seen = new Set<string>()
    const friendIds: string[] = []
    for (const row of friendRows ?? []) {
      const fid = row.user_id === userId ? row.friend_id : row.user_id
      if (!seen.has(fid)) {
        seen.add(fid)
        friendIds.push(fid)
      }
    }
    let profiles: Profile[] = []
    if (friendIds.length) {
      const { data } = await supabase.from('profiles').select('*').in('id', friendIds)
      profiles = (data ?? []) as Profile[]
    }

    const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]))
    setFriends(
      friendIds.map((fid) => {
        const row = (friendRows ?? []).find(
          (f) => (f.user_id === userId ? f.friend_id : f.user_id) === fid,
        )
        return {
          user_id: userId,
          friend_id: fid,
          created_at: row?.created_at ?? new Date().toISOString(),
          friend_profile: profileMap[fid],
        }
      }) as Friendship[],
    )

    const { data: requests } = await supabase
      .from('friend_requests')
      .select('*')
      .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
      .eq('status', 'pending')

    const pending = (requests ?? []) as FriendRequest[]
    const requesterIds = [
      ...new Set(pending.flatMap((r) => [r.from_user_id, r.to_user_id])),
    ].filter((id) => !profileMap[id] && id !== userId)

    if (requesterIds.length) {
      const { data: reqProfiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', requesterIds)
      for (const p of reqProfiles ?? []) profileMap[p.id] = p as Profile
    }

    setIncoming(
      pending
        .filter((r) => r.to_user_id === userId)
        .map((r) => ({ ...r, from_profile: profileMap[r.from_user_id] })),
    )
    setOutgoing(
      pending
        .filter((r) => r.from_user_id === userId)
        .map((r) => ({ ...r, to_profile: profileMap[r.to_user_id] })),
    )

    setLoading(false)
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`friends-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships', filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships', filter: `friend_id=eq.${userId}` },
        () => load(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests' },
        () => load(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        () => load(),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, load])

  const search = useCallback(
    async (query: string) => {
      if (!userId) return
      const { data } = await searchProfiles(query, userId)
      const friendIds = new Set(friends.map((f) => f.friend_id))
      const pendingIds = new Set([
        ...incoming.map((r) => r.from_user_id),
        ...outgoing.map((r) => r.to_user_id),
      ])
      setSearchResults(
        ((data ?? []) as Profile[]).filter(
          (p) => !friendIds.has(p.id) && !pendingIds.has(p.id),
        ),
      )
    },
    [userId, friends, incoming, outgoing],
  )

  const sendRequest = useCallback(
    async (toId: string) => {
      if (!userId) return { error: 'Not signed in' }
      const { error } = await sendFriendRequest(userId, toId)
      if (error) return { error: error.message }
      await load()
      return { error: null }
    },
    [userId, load],
  )

  const respond = useCallback(
    async (request: FriendRequest, accept: boolean) => {
      const { error } = await respondFriendRequest(
        request.id,
        accept ? 'accepted' : 'declined',
        request.from_user_id,
        request.to_user_id,
      )
      if (error) return { error: error.message }
      await load()
      return { error: null }
    },
    [load],
  )

  return {
    friends,
    incoming,
    outgoing,
    searchResults,
    loading,
    search,
    sendRequest,
    respond,
    reload: load,
  }
}
