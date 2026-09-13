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

export type TimerSound = 'bell' | 'chime' | 'digital' | 'gentle' | 'custom' | 'none'

export const TIMER_SOUND_LABELS: Record<TimerSound, string> = {
  bell: 'Bell',
  chime: 'Chime',
  digital: 'Digital Beep',
  gentle: 'Gentle Alarm',
  custom: 'Custom',
  none: 'None (Silent)',
}

export type Profile = {
  id: string
  username: string | null
  display_name: string | null
  status: UserStatus
  current_session_id: string | null
  auto_start_breaks: boolean
  auto_start_focus: boolean
  focus_duration: number
  break_duration: number
  timer_sound: TimerSound
  timer_volume: number
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
  is_paused: boolean
  paused_at: string | null
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

export type DirectMessage = {
  id: string
  sender_id: string
  receiver_id: string
  content: string
  created_at: string
  read_at: string | null
  sender?: Profile
  receiver?: Profile
}
