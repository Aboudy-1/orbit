import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  advanceSessionPhase,
  clearSessionChatForUser,
  deleteSessionChat,
  endFocusSession,
  fetchSessionChatClearedAt,
  fetchSessionMessages,
  joinFocusSession,
  leaveFocusSession,
  pauseSession,
  resumeSession,
  sendSessionMessage,
  setSessionAllowAllControl,
  startSessionTimer,
  syncFocusSessionPhase,
  syncSessionDurations,
} from '../lib/api'
import { supabase } from '../lib/supabase'
import { getRemainingSeconds } from '../lib/sessionTimer'
import type { FocusSession, Profile, SessionMessage, SessionParticipant } from '../lib/types'

export function useFocusSession(
  sessionId: string | undefined,
  userId: string | undefined,
  autoStartBreaks?: boolean,
  autoStartFocus?: boolean,
  focusDurationMin?: number,
  breakDurationMin?: number,
) {
  const [session, setSession] = useState<FocusSession | null>(null)
  const [participants, setParticipants] = useState<SessionParticipant[]>([])
  const [messages, setMessages] = useState<SessionMessage[]>([])
  /**
   * Per-user "clear chat for me" watermark. Messages at/below it are hidden from
   * this user's view only — nothing is deleted, other participants keep the
   * full history.
   */
  const [clearedAt, setClearedAt] = useState<string | null>(null)
  const [profileMap, setProfileMap] = useState<Record<string, Profile>>({})
  const [remainingSec, setRemainingSec] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const syncingRef = useRef(false)
  const syncedDeadlineRef = useRef<string | null>(null)
  const joinedRef = useRef(false)

  // Use profile-based durations (in seconds) when available, falling back to session defaults
  const focusDurationSec = (focusDurationMin ?? 25) * 60
  const breakDurationSec = (breakDurationMin ?? 5) * 60

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

    // Per-user chat watermark, so a previously cleared chat stays cleared
    if (userId) {
      const { clearedAt: storedClearedAt } = await fetchSessionChatClearedAt(sessionId, userId)
      setClearedAt(storedClearedAt)
    }

    const { data: msgs } = await fetchSessionMessages(sessionId)
    setMessages(msgs)
    setLoading(false)
  }, [sessionId, userId, loadParticipants])

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

  // Ref to store the latest loadParticipants function to avoid recreating the subscription
  const loadParticipantsRef = useRef(loadParticipants)
  useEffect(() => {
    loadParticipantsRef.current = loadParticipants
  }, [loadParticipants])

  useEffect(() => {
    if (!sessionId) return

    console.log('[useFocusSession] subscribing to realtime for session:', sessionId)

    const channel = supabase
      .channel(`session-${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'focus_sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          console.log('[useFocusSession] session change received:', payload.eventType, payload.new)
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
        () => {
          console.log('[useFocusSession] participant change received, reloading')
          loadParticipantsRef.current(sessionId)
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'session_messages',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as Partial<SessionMessage> | undefined
            if (oldRow?.id) {
              setMessages((prev) => prev.filter((m) => m.id !== oldRow.id))
            } else {
              // Unknown row deleted (e.g. whole chat) — drop everything and let
              // the next reload repopulate if anything remains.
              setMessages([])
            }
            return
          }
          const msg = payload.new as SessionMessage
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
        },
      )
      .subscribe((status) => {
        console.log('[useFocusSession] subscription status:', status)
      })

    return () => {
      console.log('[useFocusSession] unsubscribing from session:', sessionId)
      supabase.removeChannel(channel)
    }
  }, [sessionId])

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
  const allowAllControl = !!session?.allow_all_control
  /** Host, or any participant once the host allowed everyone to control the session. */
  const canControl = !!(session && userId && (session.host_id === userId || session.allow_all_control))

  const setAllowAllControl = useCallback(
    async (allow: boolean) => {
      if (!sessionId || !session || session.host_id !== userId) return
      setActionError(null)
      const { data, error: err } = await setSessionAllowAllControl(sessionId, allow)
      if (err) {
        setActionError(err.message)
        return
      }
      if (data) setSession(data)
    },
    [sessionId, userId, session],
  )

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

    // When paused, don't auto-advance
    if (session.is_paused) return

    // If auto-start breaks is enabled and focus just ended, start break automatically
    if (autoStartBreaks && session.phase === 'focus') {
      void (async () => {
        // Sync durations first so RPC reads correct values
        await syncSessionDurations(sessionId!, focusDurationSec, breakDurationSec)
        const { data, error: err } = await advanceSessionPhase(
          sessionId!,
          'break',
          breakDurationSec,
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
        // Sync durations first so RPC reads correct values
        await syncSessionDurations(sessionId!, focusDurationSec, breakDurationSec)
        const { data, error: err } = await advanceSessionPhase(
          sessionId!,
          'focus',
          focusDurationSec,
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
  }, [session, isHost, remainingSec, runHostSync, autoStartBreaks, autoStartFocus, sessionId, focusDurationSec, breakDurationSec])

  const start = useCallback(async () => {
    if (!sessionId || !userId || !session || !canControl) return
    setStarting(true)
    setActionError(null)
    syncedDeadlineRef.current = null

    // Sync stored durations to match profile preferences before starting
    await syncSessionDurations(sessionId, focusDurationSec, breakDurationSec)

    const { data, error: err } = await startSessionTimer(
      sessionId,
      focusDurationSec,
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
  }, [sessionId, userId, session, loadSession, focusDurationSec, breakDurationSec, canControl])

  const end = useCallback(async () => {
    if (!sessionId || !userId || !session || !canControl) return
    setActionError(null)
    syncedDeadlineRef.current = null
    const { data, error: err } = await endFocusSession(sessionId)
    if (err) setActionError(err.message)
    else if (data) {
      setSession(data)
      setRemainingSec(0)
    }
  }, [sessionId, userId, session, canControl])

  const startBreak = useCallback(async () => {
    if (!sessionId || !userId || !session || !canControl) return
    if (session.phase !== 'focus') return
    setActionError(null)
    syncedDeadlineRef.current = null

    // Sync stored durations to match profile preferences before starting break
    await syncSessionDurations(sessionId, focusDurationSec, breakDurationSec)

    const { data, error: err } = await advanceSessionPhase(
      sessionId,
      'break',
      breakDurationSec,
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
  }, [sessionId, userId, session, loadSession, focusDurationSec, breakDurationSec, canControl])

  const pause = useCallback(async () => {
    if (!sessionId || !userId || !session) return
    if (session.phase === 'idle') return
    setActionError(null)

    const { data, error: err } = await pauseSession(sessionId)
    if (err) {
      setActionError(err.message)
      return
    }

    if (data) {
      setSession(data)
      setRemainingSec(getRemainingSeconds(data))
    }
  }, [sessionId, userId, session])

  const resume = useCallback(async () => {
    if (!sessionId || !userId || !session) return
    if (session.phase === 'idle') return
    setActionError(null)

    const { data, error: err } = await resumeSession(sessionId)
    if (err) {
      setActionError(err.message)
      return
    }

    if (data) {
      setSession(data)
      setRemainingSec(getRemainingSeconds(data))
    }
  }, [sessionId, userId, session])

  const leave = useCallback(async () => {
    if (!sessionId || !userId) return
    await leaveFocusSession(sessionId, userId)
  }, [sessionId, userId])

  const clearChat = useCallback(async () => {
    if (!sessionId || !userId) return
    setActionError(null)

    const { clearedAt: newWatermark, error: err } = await clearSessionChatForUser(sessionId, userId)
    if (err || !newWatermark) {
      setActionError(err?.message ?? 'Could not clear the chat')
      return
    }

    setClearedAt(newWatermark)
  }, [sessionId, userId])

  const deleteChat = useCallback(async () => {
    if (!sessionId || !userId) return
    setActionError(null)

    const { error: err } = await deleteSessionChat(sessionId)
    if (err) {
      setActionError(err.message)
      return
    }

    setMessages([])
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

  /**
   * Messages visible to this user, i.e. everything newer than their own
   * "clear chat for me" watermark.
   */
  const visibleMessages = useMemo(() => {
    if (!clearedAt) return messages
    const watermark = Date.parse(clearedAt)
    if (Number.isNaN(watermark)) return messages
    return messages.filter((m) => Date.parse(m.created_at) > watermark)
  }, [messages, clearedAt])

  return {
    session,
    participants,
    messages: visibleMessages,
    profileMap,
    remainingSec,
    loading,
    error,
    actionError,
    starting,
    isHost,
    allowAllControl,
    canControl,
    setAllowAllControl,
    clearChat,
    deleteChat,
    start,
    startBreak,
    end,
    leave,
    sendMessage,
    pause,
    resume,
    reload: loadSession,
  }
}