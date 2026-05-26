export type UserStatus = 'available' | 'studying' | 'break' | 'away'
export type SessionPhase = 'idle' | 'focus' | 'break'
export type FriendRequestStatus = 'pending' | 'accepted' | 'declined'

export const STATUS_LABELS: Record<UserStatus, string> = {
  available: '🟢 Available',
  studying: '🔴 Studying',
  break: '☕ On Break',
  away: '💤 Away',
}

export const PHASE_LABELS: Record<SessionPhase, string> = {
  idle: 'Not started',
  focus: 'Focus',
  break: 'Break',
}

export type Profile = {
  id: string
  username: string | null
  display_name: string | null
  status: UserStatus
  current_session_id: string | null
  auto_start_breaks: boolean
  auto_start_focus: boolean
  created_at: string
  updated_at: string
}

export type FocusSession = {
  id: string
  host_id: string
  title: string
  focus_duration_sec: number
  break_duration_sec: number
  phase: SessionPhase
  phase_started_at: string | null
  phase_ends_at: string | null
  is_active: boolean
  created_at: string
}

export type SessionParticipant = {
  session_id: string
  user_id: string
  joined_at: string
  profile?: Profile
}

export type FriendRequest = {
  id: string
  from_user_id: string
  to_user_id: string
  status: FriendRequestStatus
  created_at: string
  from_profile?: Profile
  to_profile?: Profile
}

export type Friendship = {
  user_id: string
  friend_id: string
  created_at: string
  friend_profile?: Profile
}

export type SessionMessage = {
  id: string
  session_id: string
  user_id: string
  content: string
  created_at: string
  profile?: Profile
}
