import { supabase } from './supabase'
import type { FocusSession, Profile, SessionMessage } from './types'

export async function ensureProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (data) return data as Profile

  const { data: created, error } = await supabase
    .from('profiles')
    .insert({ id: userId })
    .select()
    .single()

  if (error) return null
  return created as Profile
}

export async function setUsername(userId: string, username: string) {
  return supabase
    .from('profiles')
    .update({ username: username.toLowerCase() })
    .eq('id', userId)
    .select()
    .single()
}

export async function setProfileStatus(userId: string, status: Profile['status']) {
  return supabase.from('profiles').update({ status }).eq('id', userId)
}

export async function setAutoStartBreaks(userId: string, enabled: boolean) {
  return supabase.from('profiles').update({ auto_start_breaks: enabled }).eq('id', userId)
}

export async function setAutoStartFocus(userId: string, enabled: boolean) {
  return supabase.from('profiles').update({ auto_start_focus: enabled }).eq('id', userId)
}

export async function searchProfiles(query: string, excludeId: string) {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return { data: [] as Profile[], error: null }

  return supabase
    .from('profiles')
    .select('*')
    .ilike('username', `%${q}%`)
    .neq('id', excludeId)
    .not('username', 'is', null)
    .limit(10)
}

export async function sendFriendRequest(fromId: string, toId: string) {
  return supabase.from('friend_requests').insert({
    from_user_id: fromId,
    to_user_id: toId,
    status: 'pending',
  })
}

export async function respondFriendRequest(
  requestId: string,
  status: 'accepted' | 'declined',
  _fromId: string,
  _toId: string,
) {
  if (status === 'declined') {
    return supabase.from('friend_requests').update({ status }).eq('id', requestId)
  }

  return supabase.rpc('accept_friend_request', { request_id: requestId })
}

export async function fetchFriendActiveSessions(friendIds: string[]) {
  if (!friendIds.length) return { data: [] as FocusSession[], error: null }

  return supabase
    .from('focus_sessions')
    .select('*')
    .in('host_id', friendIds)
    .eq('is_active', true)
    .neq('phase', 'idle')
    .neq('phase', 'ended')
    .order('created_at', { ascending: false })
}

/** Idempotent — safe if create + session-room join both run (e.g. React Strict Mode). */
export async function ensureSessionParticipant(sessionId: string, userId: string) {
  const { error } = await supabase.from('session_participants').upsert(
    { session_id: sessionId, user_id: userId },
    { onConflict: 'session_id,user_id', ignoreDuplicates: true },
  )

  if (error && error.code !== '23505') return { error }
  return { error: null }
}

export async function createFocusSession(
  hostId: string,
  focusMin: number,
  breakMin: number,
  title?: string,
) {
  const { data: session, error } = await supabase
    .from('focus_sessions')
    .insert({
      host_id: hostId,
      title: title?.trim() || 'Focus Session',
      focus_duration_sec: focusMin * 60,
      break_duration_sec: breakMin * 60,
      phase: 'idle',
      is_active: true,
    })
    .select()
    .single()

  if (error || !session) return { session: null, error }

  const { error: participantError } = await ensureSessionParticipant(session.id, hostId)
  if (participantError) return { session: null, error: participantError }

  await supabase
    .from('profiles')
    .update({ current_session_id: session.id, status: 'available' })
    .eq('id', hostId)

  return { session: session as FocusSession, error: null }
}

export async function joinFocusSession(sessionId: string, userId: string) {
  const { data: session, error: sessionError } = await supabase
    .from('focus_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('is_active', true)
    .maybeSingle()

  if (sessionError) return { error: sessionError, session: null }
  if (!session) return { error: new Error('Session not found or has ended'), session: null }

  const { error: joinError } = await ensureSessionParticipant(sessionId, userId)
  if (joinError) return { error: joinError, session: null }

  const status =
    session.phase === 'focus' ? 'studying' : session.phase === 'break' ? 'break' : 'available'

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      current_session_id: sessionId,
      status,
    })
    .eq('id', userId)

  if (profileError) return { error: profileError, session: null }

  return { error: null, session: session as FocusSession }
}

export async function leaveFocusSession(sessionId: string, userId: string) {
  await supabase
    .from('session_participants')
    .delete()
    .eq('session_id', sessionId)
    .eq('user_id', userId)

  await supabase
    .from('profiles')
    .update({ current_session_id: null, status: 'available' })
    .eq('id', userId)
}

function phaseEndsAtIso(durationSec: number): string {
  return new Date(Date.now() + durationSec * 1000).toISOString()
}

export async function startSessionTimer(sessionId: string, focusDurationSec: number) {
  const { data: rpcData, error: rpcError } = await supabase.rpc('start_focus_session', {
    p_session_id: sessionId,
  })

  if (!rpcError && rpcData) {
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData
    if (row) return { data: row as FocusSession, error: null }
  }

  const started = new Date().toISOString()
  return supabase
    .from('focus_sessions')
    .update({
      phase: 'focus',
      phase_started_at: started,
      phase_ends_at: phaseEndsAtIso(focusDurationSec),
    })
    .eq('id', sessionId)
    .select()
    .single()
}

export async function advanceSessionPhase(
  sessionId: string,
  next: 'focus' | 'break',
  durationSec: number,
) {
  const { data: rpcData, error: rpcError } = await supabase.rpc('advance_focus_session', {
    p_session_id: sessionId,
    p_phase: next,
  })

  if (!rpcError && rpcData) {
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData
    if (row) return { data: row as FocusSession, error: null }
  }

  const started = new Date().toISOString()
  return supabase
    .from('focus_sessions')
    .update({
      phase: next,
      phase_started_at: started,
      phase_ends_at: phaseEndsAtIso(durationSec),
    })
    .eq('id', sessionId)
    .select()
    .single()
}

/** Host-only: advance phase when server deadline has passed (safe after refresh). */
export async function syncFocusSessionPhase(sessionId: string) {
  const { data: rpcData, error: rpcError } = await supabase.rpc('sync_focus_session_phase', {
    p_session_id: sessionId,
  })

  if (!rpcError && rpcData) {
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData
    if (row) return { data: row as FocusSession, error: null }
  }

  return { data: null, error: rpcError }
}

export async function endFocusSession(sessionId: string) {
  const { data: rpcData, error: rpcError } = await supabase.rpc('end_focus_session', {
    p_session_id: sessionId,
  })

  if (!rpcError && rpcData) {
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData
    if (row) return { data: row as FocusSession, error: null }
  }

  return supabase
    .from('focus_sessions')
    .update({
      phase: 'idle',
      is_active: false,
      phase_started_at: null,
      phase_ends_at: null,
    })
    .eq('id', sessionId)
    .select()
    .single()
}

export async function fetchSessionMessages(sessionId: string) {
  const { data, error } = await supabase
    .from('session_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(100)

  return { data: (data ?? []) as SessionMessage[], error }
}

export async function sendSessionMessage(sessionId: string, userId: string, content: string) {
  const trimmed = content.trim()

  const { data: rpcData, error: rpcError } = await supabase.rpc('send_break_message', {
    p_session_id: sessionId,
    p_content: trimmed,
  })

  if (!rpcError && rpcData) {
    return { data: rpcData as SessionMessage, error: null }
  }

  const { data, error } = await supabase
    .from('session_messages')
    .insert({
      session_id: sessionId,
      user_id: userId,
      content: trimmed,
    })
    .select()
    .single()

  return { data: (data as SessionMessage) ?? null, error }
}
