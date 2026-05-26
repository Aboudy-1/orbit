import type { FocusSession, SessionPhase } from './types'

export function phaseDurationSec(session: FocusSession, phase: SessionPhase): number {
  if (phase === 'focus') return session.focus_duration_sec
  if (phase === 'break') return session.break_duration_sec
  return 0
}

/** Remaining seconds — prefers server `phase_ends_at` so refresh stays in sync. */
export function getRemainingSeconds(session: FocusSession, now = Date.now()): number {
  if (session.phase === 'idle' || !session.is_active) return 0

  if (session.phase_ends_at) {
    const ends = Date.parse(session.phase_ends_at)
    if (!Number.isNaN(ends)) {
      return Math.max(0, Math.floor((ends - now) / 1000))
    }
  }

  if (!session.phase_started_at) return 0

  const duration = phaseDurationSec(session, session.phase)
  const started = Date.parse(session.phase_started_at)
  if (Number.isNaN(started)) return 0

  const elapsed = (now - started) / 1000
  return Math.max(0, Math.floor(duration - elapsed))
}

export function formatTimer(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function nextPhase(current: SessionPhase): SessionPhase {
  if (current === 'idle' || current === 'break') return 'focus'
  return 'break'
}
