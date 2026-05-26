import { useCallback, useEffect, useRef, useState } from 'react'
import {
  advanceSessionPhase,
  endFocusSession,
  fetchSessionMessages,
  joinFocusSession,
  leaveFocusSession,
  sendSessionMessage,
  startSessionTimer,
  syncFocusSessionPhase,
} from '../lib/api'
import { supabase } from '../lib/supabase'
import { getRemainingSeconds } from '../lib/sessionTimer'
import type { FocusSession, Profile, SessionMessage, SessionParticipant } from '../lib/types'

export function useFocusSession(
  sessionId: string | undefined,
  userId: string | undefined,
  autoStartBreaks?: boolean,
  autoStartFocus?: boolean,
) {
  const [session, setSession] = useState<FocusSession | null>(null)
  const [participants, setParticipants] = useState<SessionParticipant[]>([])
  const [messages, setMessages] = useState<SessionMessage[]>([])
  const [profileMap, setProfileMap] = useState<Record<string, Profile>>({})
  const [remainingSec, setRemainingSec] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const syncingRef = useRef(false)
  const syncedDeadlineRef = useRef<string | null>(null)
  const joinedRef = useRef(false)

  const loadParticipants = useCallback(async (sid: string) => {
    const { data: rows } = await supabase
      .from('session_participants')
      .select('*')
      .eq('session_id', sid)

    if (!rows?.length) {
      setParticipants([])
      return
    }

    const userIds = rows.map((r) => r.user_id)
    const { data: profiles } = await supabase.from('profiles').select('*').in('id', userIds)

    const map: Record<string, Profile> = {}
    for (const p of profiles ?? []) map[p.id] = p as Profile
    setProfileMap(map)

    setParticipants(
      rows.map((r) => ({
        ...r,
        profile: map[r.user_id],
      })) as SessionParticipant[],
    )
  }, [])

  const loadSession = useCallback(async () => {
    if (!sessionId) return
    setLoading(true)
    setError(null)

    const { data, error: err } = await supabase
      .from('focus_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle()

    if (err || !data) {
      setError('Session not found')
      setLoading(false)
      return
    }

    const loaded = data as FocusSession
    setSession(loaded)
    setRemainingSec(getRemainingSeconds(loaded))
    syncedDeadlineRef.current = null
    await loadParticipants(sessionId)

    const { data: msgs } = await fetchSessionMessages(sessionId)
    setMessages(msgs)
    setLoading(false)
  }, [sessionId, loadParticipants])

  useEffect(() => {
    loadSession()
  }, [loadSession])

  useEffect(() => {
    if (!sessionId || !userId) return
    let active = true

    if (!joinedRef.current) {
      joinedRef.current = true
      joinFocusSession(sessionId, userId).then(({ error: e }) => {
        if (!active) return
        if (e) setError(e.message)
        loadParticipants(sessionId)
      })
    }

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, userId])

  useEffect(() => {
    if (!sessionId) return

    const channel = supabase
      .channel(`session-${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'focus_sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          if (payload.new) {
            const next = payload.new as FocusSession
            setSession(next)
            setRemainingSec(getRemainingSeconds(next))
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'session_participants',
          filter: `session_id=eq.${sessionId}`,
        },
        () => loadParticipants(sessionId),
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'session_messages',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const msg = payload.new as SessionMessage
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [sessionId, loadParticipants])

  useEffect(() => {
    if (!sessionId || session?.phase !== 'break') return
    fetchSessionMessages(sessionId).then(({ data }) => {
      if (data.length) setMessages(data)
    })
  }, [sessionId, session?.phase])

  useEffect(() => {
    if (!session || session.phase === 'idle') return

    const tick = () => setRemainingSec(getRemainingSeconds(session))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [session])

  const isHost = !!(session && userId && session.host_id === userId)

  const runHostSync = useCallback(async () => {
    if (!sessionId || !session?.phase_ends_at || syncingRef.current) return
    if (syncedDeadlineRef.current === session.phase_ends_at) return

    syncingRef.current = true
    const { data, error: err } = await syncFocusSessionPhase(sessionId)
    syncingRef.current = false

    if (err) {
      setActionError(err.message)
      return
    }

    if (data) {
      setSession(data)
      setRemainingSec(getRemainingSeconds(data))
      syncedDeadlineRef.current = data.phase_ends_at
    } else {
      syncedDeadlineRef.current = session.phase_ends_at
    }
  }, [sessionId, session?.phase_ends_at])

  useEffect(() => {
    if (!session || !isHost || session.phase === 'idle' || !session.phase_ends_at) return
    if (remainingSec > 0) return

    // If auto-start breaks is enabled and focus just ended, start break automatically
    if (autoStartBreaks && session.phase === 'focus') {
      void (async () => {
        const { data, error: err } = await advanceSessionPhase(
          sessionId!,
          'break',
          session.break_duration_sec,
        )
        if (err) {
          setActionError(err.message)
          return
        }
        if (data) {
          setSession(data)
          setRemainingSec(getRemainingSeconds(data))
        }
      })()
      return
    }

    // If auto-start focus is enabled and break just ended, start focus automatically
    if (autoStartFocus && session.phase === 'break') {
      void (async () => {
        const { data, error: err } = await advanceSessionPhase(
          sessionId!,
          'focus',
          session.focus_duration_sec,
        )
        if (err) {
          setActionError(err.message)
          return
        }
        if (data) {
          setSession(data)
          setRemainingSec(getRemainingSeconds(data))
        }
      })()
      return
    }

    // Otherwise sync the phase (for page refresh cases)
    void runHostSync()
  }, [session, isHost, remainingSec, runHostSync, autoStartBreaks, autoStartFocus, sessionId])

  const start = useCallback(async () => {
    if (!sessionId || !userId || !session || session.host_id !== userId) return
    setStarting(true)
    setActionError(null)
    syncedDeadlineRef.current = null

    const { data, error: err } = await startSessionTimer(
      sessionId,
      session.focus_duration_sec,
    )
    setStarting(false)

    if (err) {
      setActionError(err.message)
      return
    }

    if (data) {
      setSession(data)
      setRemainingSec(getRemainingSeconds(data))
    } else {
      await loadSession()
    }
  }, [sessionId, userId, session, loadSession])

  const end = useCallback(async () => {
    if (!sessionId || !userId || !session || session.host_id !== userId) return
    setActionError(null)
    syncedDeadlineRef.current = null
    const { data, error: err } = await endFocusSession(sessionId)
    if (err) setActionError(err.message)
    else if (data) {
      setSession(data)
      setRemainingSec(0)
    }
  }, [sessionId, userId, session])

  const startBreak = useCallback(async () => {
    if (!sessionId || !userId || !session || session.host_id !== userId) return
    if (session.phase !== 'focus') return
    setActionError(null)
    syncedDeadlineRef.current = null

    const { data, error: err } = await advanceSessionPhase(
      sessionId,
      'break',
      session.break_duration_sec,
    )
    if (err) {
      setActionError(err.message)
      return
    }

    if (data) {
      setSession(data)
      setRemainingSec(getRemainingSeconds(data))
    } else {
      await loadSession()
    }
  }, [sessionId, userId, session, loadSession])

  const leave = useCallback(async () => {
    if (!sessionId || !userId) return
    await leaveFocusSession(sessionId, userId)
  }, [sessionId, userId])

  const sendMessage = useCallback(
    async (content: string) => {
      if (!sessionId || !userId) {
        return { error: 'Not signed in' }
      }
      if (session?.phase === 'focus') {
        return { error: 'Chat is locked during focus time' }
      }

      const { data, error } = await sendSessionMessage(sessionId, userId, content)
      if (error) return { error: error.message }

      if (data) {
        setMessages((prev) =>
          prev.some((m) => m.id === data.id) ? prev : [...prev, data],
        )
      }

      return { error: null }
    },
    [sessionId, userId, session?.phase, session?.is_active],
  )

  return {
    session,
    participants,
    messages,
    profileMap,
    remainingSec,
    loading,
    error,
    actionError,
    starting,
    isHost,
    start,
    startBreak,
    end,
    leave,
    sendMessage,
    reload: loadSession,
  }
}
