import { supabase } from './supabase'
import type { DirectMessage, FocusSession, Profile, SessionMessage, TimerSound } from './types'

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

export async function setFocusDuration(userId: string, minutes: number) {
  const { error } = await supabase.from('profiles').update({ focus_duration: minutes }).eq('id', userId)
  if (error) console.error('[setFocusDuration] Supabase update failed:', error.message, error)
  return { error }
}

export async function setBreakDuration(userId: string, minutes: number) {
  const { error } = await supabase.from('profiles').update({ break_duration: minutes }).eq('id', userId)
  if (error) console.error('[setBreakDuration] Supabase update failed:', error.message, error)
  return { error }
}

export async function setTimerSound(userId: string, sound: TimerSound) {
  const { error } = await supabase.from('profiles').update({ timer_sound: sound }).eq('id', userId)
  if (error) console.error('[setTimerSound] Supabase update failed:', error.message, error)
  return { error }
}

export async function setTimerVolume(userId: string, volume: number) {
  const clamped = Math.max(0, Math.min(100, volume))
  const { error } = await supabase.from('profiles').update({ timer_volume: clamped }).eq('id', userId)
  if (error) console.error('[setTimerVolume] Supabase update failed:', error.message, error)
  return { error }
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

export async function removeFriendship(userId: string, friendId: string) {
  const { data, error } = await supabase
    .from('friendships')
    .delete()
    .or(`and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`)

  console.log('[removeFriendship] response:', { data, error })
  if (error) console.error('[removeFriendship] Supabase delete failed:', error.message, error, error.details, error.hint)
  return { error }
}

export async function fetchFriendActiveSessions(friendIds: string[]) {
  if (!friendIds.length) {
    console.log('[fetchFriendActiveSessions] no friendIds, returning empty')
    return { data: [] as FocusSession[], error: null }
  }

  console.log('[fetchFriendActiveSessions] fetching for friendIds:', friendIds)

  const result = await supabase
    .from('focus_sessions')
    .select('*')
    .in('host_id', friendIds)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  console.log('[fetchFriendActiveSessions] result:', result.data?.length, 'sessions, error:', result.error)

  return result
}

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
  console.log('[createFocusSession] called with:', { hostId, focusMin, breakMin, title })

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

  console.log('[createFocusSession] insert result:', { session, error })

  if (error || !session) return { session: null, error }

  const { error: participantError } = await ensureSessionParticipant(session.id, hostId)
  console.log('[createFocusSession] ensureSessionParticipant result:', { participantError })
  if (participantError) return { session: null, error: participantError }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ current_session_id: session.id, status: 'available' })
    .eq('id', hostId)

  console.log('[createFocusSession] profile update result:', { profileError })

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
  console.log("[leaveFocusSession] ====== START ======");
  console.log("[leaveFocusSession] Initializing leave process for session:", sessionId, "user:", userId);
  console.log("[leaveFocusSession] Timestamp:", new Date().toISOString());

  // Step 1: Remove the participant
  console.log("[leaveFocusSession] Step 1: Deleting participant row");
  console.log("[leaveFocusSession] Delete parameters: session_id =", sessionId, "user_id =", userId);
  const deleteResult = await supabase
    .from("session_participants")
    .delete()
    .eq("session_id", sessionId)
    .eq("user_id", userId);
  console.log("[leaveFocusSession] Delete response status:", deleteResult.status);
  console.log("[leaveFocusSession] Delete response data:", JSON.stringify(deleteResult.data));
  console.log("[leaveFocusSession] Delete response error:", deleteResult.error ? JSON.stringify(deleteResult.error) : null);
  console.log("[leaveFocusSession] Delete response details:", deleteResult.error?.details);
  console.log("[leaveFocusSession] Delete response hint:", deleteResult.error?.hint);
  console.log("[leaveFocusSession] Delete response code:", deleteResult.error?.code);

  // Step 1b: Verify the participant was actually deleted
  console.log("[leaveFocusSession] Step 1b: Verifying participant deletion by querying session_participants");
  const verifyDeleteResult = await supabase
    .from("session_participants")
    .select("session_id, user_id")
    .eq("session_id", sessionId)
    .eq("user_id", userId);
  console.log("[leaveFocusSession] Verify delete query result:", JSON.stringify(verifyDeleteResult.data), "error:", verifyDeleteResult.error);
  if (verifyDeleteResult.data && verifyDeleteResult.data.length > 0) {
    console.log("[leaveFocusSession] WARNING: Participant row still exists after delete!");
  } else {
    console.log("[leaveFocusSession] CONFIRMED: Participant row was successfully deleted");
  }

  // Step 2: Clear the user's current session
  console.log("[leaveFocusSession] Step 2: Clearing user's current_session_id in profiles");
  const profileUpdateResult = await supabase
    .from("profiles")
    .update({ current_session_id: null, status: "available" })
    .eq("id", userId)
    .select();
  console.log("[leaveFocusSession] Profile update response status:", profileUpdateResult.status);
  console.log("[leaveFocusSession] Profile update response data:", JSON.stringify(profileUpdateResult.data));
  console.log("[leaveFocusSession] Profile update response error:", profileUpdateResult.error ? JSON.stringify(profileUpdateResult.error) : null);

  // Step 3: Check if the leaving user is the host
  console.log("[leaveFocusSession] Step 3: Checking if leaving user is the host");
  const sessionResult = await supabase
    .from("focus_sessions")
    .select("host_id, is_active, phase")
    .eq("id", sessionId)
    .single();
  console.log("[leaveFocusSession] Session query response status:", sessionResult.status);
  console.log("[leaveFocusSession] Session query response data:", JSON.stringify(sessionResult.data));
  console.log("[leaveFocusSession] Session query response error:", sessionResult.error ? JSON.stringify(sessionResult.error) : null);

  if (sessionResult.error) {
    console.error("[leaveFocusSession] ERROR fetching session for host check:", sessionResult.error.message);
    console.error("[leaveFocusSession] Full error:", JSON.stringify(sessionResult.error));
    console.log("[leaveFocusSession] ====== END (error) ======");
    return;
  }

  if (!sessionResult.data) {
    console.log("[leaveFocusSession] Session not found, returning early");
    console.log("[leaveFocusSession] ====== END (no session) ======");
    return;
  }

  const isHost = sessionResult.data.host_id === userId;
  console.log("[leaveFocusSession] Is user the host?", isHost, "(session.host_id =", sessionResult.data.host_id, ", userId =", userId + ")");

  if (!isHost) {
    console.log("[leaveFocusSession] User is NOT the host, returning early");
    console.log("[leaveFocusSession] ====== END (not host) ======");
    return;
  }

  // Step 4: Host is leaving — query for remaining participants
  console.log("[leaveFocusSession] Step 4: Host is leaving. Querying remaining participants...");
  const remainingResult = await supabase
    .from("session_participants")
    .select("user_id, joined_at")
    .eq("session_id", sessionId);
  console.log("[leaveFocusSession] Remaining participants query response status:", remainingResult.status);
  console.log("[leaveFocusSession] Remaining participants query response data:", JSON.stringify(remainingResult.data));
  console.log("[leaveFocusSession] Remaining participants query response error:", remainingResult.error ? JSON.stringify(remainingResult.error) : null);
  console.log("[leaveFocusSession] Remaining participants count:", remainingResult.data ? remainingResult.data.length : 0);

  if (remainingResult.error) {
    console.error("[leaveFocusSession] ERROR querying remaining participants:", remainingResult.error.message);
    console.error("[leaveFocusSession] Full error:", JSON.stringify(remainingResult.error));
    console.log("[leaveFocusSession] ====== END (query error) ======");
    return;
  }

  const participantUserIds = remainingResult.data?.map(p => p.user_id) || [];
  console.log("[leaveFocusSession] Remaining participant user_ids:", participantUserIds);

  // Step 5: Decide whether to auto-end or transfer host
  if (participantUserIds.length === 0) {
    console.log("[leaveFocusSession] Step 5a: No remaining participants (count =", participantUserIds.length + "), auto-ending session");
    console.log("[leaveFocusSession] Calling end_focus_session RPC with p_session_id =", sessionId);
    const endResult = await supabase.rpc("end_focus_session", {
      p_session_id: sessionId,
    });
    console.log("[leaveFocusSession] end_focus_session RPC response status:", endResult.status);
    console.log("[leaveFocusSession] end_focus_session RPC response data:", JSON.stringify(endResult.data));
    console.log("[leaveFocusSession] end_focus_session RPC response error:", endResult.error ? JSON.stringify(endResult.error) : null);
    console.log("[leaveFocusSession] end_focus_session RPC response details:", endResult.error?.details);
    console.log("[leaveFocusSession] end_focus_session RPC response hint:", endResult.error?.hint);
    console.log("[leaveFocusSession] end_focus_session RPC response code:", endResult.error?.code);
    if (endResult.error) {
      console.error("[leaveFocusSession] Auto-end session RPC FAILED:", endResult.error.message);
    } else {
      console.log("[leaveFocusSession] Auto-end session RPC SUCCEEDED");
    }
  } else {
    console.log("[leaveFocusSession] Step 5b: Remaining participants found (count =", participantUserIds.length + "), transferring host");
    console.log("[leaveFocusSession] Calling transfer_session_host RPC with p_session_id =", sessionId, "p_old_host_id =", userId);
    const transferResult = await supabase.rpc("transfer_session_host", {
      p_session_id: sessionId,
      p_old_host_id: userId,
    });
    console.log("[leaveFocusSession] transfer_session_host RPC response status:", transferResult.status);
    console.log("[leaveFocusSession] transfer_session_host RPC response data:", JSON.stringify(transferResult.data));
    console.log("[leaveFocusSession] transfer_session_host RPC response error:", transferResult.error ? JSON.stringify(transferResult.error) : null);
    console.log("[leaveFocusSession] transfer_session_host RPC response details:", transferResult.error?.details);
    console.log("[leaveFocusSession] transfer_session_host RPC response hint:", transferResult.error?.hint);
    console.log("[leaveFocusSession] transfer_session_host RPC response code:", transferResult.error?.code);
    if (transferResult.error) {
      console.error("[leaveFocusSession] Host transfer RPC FAILED:", transferResult.error.message);
    } else {
      console.log("[leaveFocusSession] Host transfer RPC SUCCEEDED");
    }

    // Verify the host transfer by querying the session again
    console.log("[leaveFocusSession] Verifying host transfer by querying session...");
    const verifyTransferResult = await supabase
      .from("focus_sessions")
      .select("host_id, is_active, phase")
      .eq("id", sessionId)
      .single();
    console.log("[leaveFocusSession] Verify transfer query result:", JSON.stringify(verifyTransferResult.data));
    console.log("[leaveFocusSession] Verify transfer query error:", verifyTransferResult.error ? JSON.stringify(verifyTransferResult.error) : null);
    if (verifyTransferResult.data) {
      const newHostIsDifferent = verifyTransferResult.data.host_id !== userId;
      console.log("[leaveFocusSession] Host changed?", newHostIsDifferent, "(old host_id =", userId, "new host_id =", verifyTransferResult.data.host_id + ")");
    }
  }

  console.log("[leaveFocusSession] ====== END ======");
}

export async function pauseSession(sessionId: string) {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('focus_sessions')
    .update({ is_paused: true, paused_at: now })
    .eq('id', sessionId)
    .select()
    .single()

  if (error) return { data: null, error }
  return { data: data as FocusSession, error: null }
}

export async function resumeSession(sessionId: string) {
  const { data: session, error: fetchError } = await supabase
    .from('focus_sessions')
    .select('id, phase_ends_at, paused_at')
    .eq('id', sessionId)
    .single()

  if (fetchError || !session) return { data: null, error: fetchError }

  const pausedAt = session.paused_at
  if (!pausedAt) {
    const { data, error } = await supabase
      .from('focus_sessions')
      .update({ is_paused: false, paused_at: null })
      .eq('id', sessionId)
      .select()
      .single()
    return { data: data as FocusSession | null, error }
  }

  const pauseDurationMs = Date.now() - Date.parse(pausedAt)
  const oldEnds = session.phase_ends_at
  const newEnds = oldEnds
    ? new Date(Date.parse(oldEnds) + pauseDurationMs).toISOString()
    : new Date(Date.now() + pauseDurationMs).toISOString()

  const { data, error } = await supabase
    .from('focus_sessions')
    .update({ is_paused: false, paused_at: null, phase_ends_at: newEnds })
    .eq('id', sessionId)
    .select()
    .single()

  if (error) return { data: null, error }
  return { data: data as FocusSession, error: null }
}

function phaseEndsAtIso(durationSec: number): string {
  return new Date(Date.now() + durationSec * 1000).toISOString()
}

export async function syncSessionDurations(
  sessionId: string,
  focusDurationSec: number,
  breakDurationSec: number,
) {
  return supabase
    .from('focus_sessions')
    .update({
      focus_duration_sec: focusDurationSec,
      break_duration_sec: breakDurationSec,
    })
    .eq('id', sessionId)
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

async function enrichMessagesWithProfiles(messages: DirectMessage[]): Promise<DirectMessage[]> {
  if (!messages.length) return messages

  const userIds = new Set<string>()
  for (const m of messages) {
    userIds.add(m.sender_id)
    userIds.add(m.receiver_id)
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .in('id', [...userIds])

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))

  return messages.map((m) => ({
    ...m,
    sender: profileMap.get(m.sender_id) as Profile | undefined,
    receiver: profileMap.get(m.receiver_id) as Profile | undefined,
  }))
}

export async function fetchDirectMessages(userId: string, otherId: string) {
  const { data, error } = await supabase
    .from('direct_messages')
    .select('*')
    .or(`and(sender_id.eq.${userId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${userId})`)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) return { data: [] as DirectMessage[], error }

  const enriched = await enrichMessagesWithProfiles(data as DirectMessage[])
  return { data: enriched, error: null }
}

export async function sendDirectMessage(senderId: string, receiverId: string, content: string) {
  const trimmed = content.trim()
  if (!trimmed) return { data: null, error: new Error('Message cannot be empty') }

  const { data, error } = await supabase
    .from('direct_messages')
    .insert({
      sender_id: senderId,
      receiver_id: receiverId,
      content: trimmed,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[sendDirectMessage] Supabase insert failed:', error.message, error, { senderId, receiverId, content: trimmed })
    return { data: null, error }
  }

  // Enrich with profile data
  const enriched = (await enrichMessagesWithProfiles([data as DirectMessage]))[0]
  console.log('[sendDirectMessage] success:', { data: enriched })
  return { data: enriched, error: null }
}

export async function markDirectMessagesRead(userId: string, otherId: string) {
  const { error } = await supabase
    .from('direct_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('sender_id', otherId)
    .eq('receiver_id', userId)
    .is('read_at', null)

  if (error) console.error('[markDirectMessagesRead] failed:', error.message, error)
  return { error }
}

export async function countUnreadMessages(userId: string) {
  const { data, error } = await supabase
    .from('direct_messages')
    .select('sender_id')
    .eq('receiver_id', userId)
    .is('read_at', null)

  if (error) return { counts: [] as { sender_id: string }[], error }
  return { counts: data as { sender_id: string }[], error: null }
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
