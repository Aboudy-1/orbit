import { useCallback, useEffect, useRef, useState } from 'react'
import {
  setAlarmRepeatCount,
  setAutoStartBreaks,
  setAutoStartFocus,
  setBreakDuration,
  setFocusDuration,
  setTimerSound,
  setTimerVolume,
} from '../lib/api'
import {
  saveCustomRingtone,
  loadCustomRingtones,
  removeCustomRingtone as removeCustomRingtoneFromDB,
  type StoredRingtone,
} from '../lib/customRingtoneStorage'
import { useProfile } from './useProfile'
import type { TimerSound } from '../lib/types'

export type TimerSettingsState = {
  autoStartBreaks: boolean
  autoStartFocus: boolean
  focusDuration: number
  breakDuration: number
  timerSound: TimerSound
  timerVolume: number
  alarmRepeatCount: number
  customSoundUrl: string | null
}

export type TimerSettingsActions = {
  handleToggleAutoStartBreaks: () => void
  handleToggleAutoStartFocus: () => void
  handleFocusDurationChange: (minutes: number) => void
  handleBreakDurationChange: (minutes: number) => void
  handleTimerSoundChange: (sound: TimerSound) => void
  handleTimerVolumeChange: (volume: number) => void
  handleAlarmRepeatCountChange: (count: number) => void
  handleCustomSoundUpload: (file: File) => void
  handleRemoveCustomSound: () => void
}

/** Default used only when nothing has ever been stored for the user. */
const DEFAULT_AUTO_START_BREAKS = true
const DEFAULT_AUTO_START_FOCUS = true
const DEFAULT_FOCUS_DURATION = 25
const DEFAULT_BREAK_DURATION = 5
const DEFAULT_TIMER_VOLUME = 80
const DEFAULT_ALARM_REPEAT_COUNT = 1

/**
 * Reads a persisted boolean. `null`/`undefined`/anything non-boolean means the
 * value was never stored, so the default applies — a saved `false` is a real
 * value and must always win over the default (that mix-up is what made
 * "auto-start breaks" reset to the default instead of showing the saved value).
 */
function savedBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function savedNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function useTimerSettings(userId: string | undefined): TimerSettingsState & TimerSettingsActions {
  const { profile } = useProfile()

  const [autoStartBreaks, setAutoStartBreaksLocal] = useState<boolean>(() =>
    savedBoolean(profile?.auto_start_breaks, DEFAULT_AUTO_START_BREAKS),
  )
  const [autoStartFocus, setAutoStartFocusLocal] = useState<boolean>(() =>
    savedBoolean(profile?.auto_start_focus, DEFAULT_AUTO_START_FOCUS),
  )
  const [focusDuration, setFocusDurationLocal] = useState<number>(() =>
    savedNumber(profile?.focus_duration, DEFAULT_FOCUS_DURATION),
  )
  const [breakDuration, setBreakDurationLocal] = useState<number>(() =>
    savedNumber(profile?.break_duration, DEFAULT_BREAK_DURATION),
  )
  const [timerSound, setTimerSoundLocal] = useState<TimerSound>(
    () => (profile?.timer_sound as TimerSound) ?? 'bell',
  )
  const [timerVolume, setTimerVolumeLocal] = useState<number>(() =>
    savedNumber(profile?.timer_volume, DEFAULT_TIMER_VOLUME),
  )
  const [alarmRepeatCount, setAlarmRepeatCountLocal] = useState<number>(() =>
    savedNumber(profile?.alarm_repeat_count, DEFAULT_ALARM_REPEAT_COUNT),
  )
  const [customSoundUrl, setCustomSoundUrl] = useState<string | null>(null)
  const [customRingtoneId, setCustomRingtoneId] = useState<string | null>(null)

  // Commit guard for optimistic writes. `committingRef` is true while one of
  // our own Supabase writes is in flight, so the profile sync effect below
  // can't apply a stale row / realtime echo over the optimistic value.
  // `pendingWriteRef` is a monotonic token: a resolving write that has been
  // superseded by a newer click does nothing (no stale rollback).
  // `latestRef` mirrors the toggle states synchronously so rapid clicks read
  // the newest value even before React re-renders (avoids stale closures
  // without putting side effects inside a state updater, which StrictMode
  // would double-invoke).
  const pendingWriteRef = useRef(0)
  const committingRef = useRef(false)
  const latestRef = useRef({ autoStartBreaks, autoStartFocus })

  // Load custom ringtone from IndexedDB on mount
  useEffect(() => {
    let cancelled = false
    loadCustomRingtones().then((ringtones: StoredRingtone[]) => {
      if (cancelled) return
      if (ringtones.length > 0) {
        const latest = ringtones[ringtones.length - 1]
        setCustomSoundUrl(latest.blobUrl)
        setCustomRingtoneId(latest.id)
      }
    })
    return () => { cancelled = true }
  }, [])

  // Sync local state with the profile whenever it loads or changes. A value is
  // only replaced when the stored value is really stored (a boolean/number), so
  // a saved `false` is never treated as "not set" and swapped for a default.
  // While one of our own writes is still in flight (committingRef), incoming
  // profile values are ignored: they are either the stale pre-write row or the
  // realtime echo arriving before `.then()` runs, and applying them would snap
  // an optimistic toggle back to its previous state.
  useEffect(() => {
    if (!profile || committingRef.current) return

    if (typeof profile.auto_start_breaks === 'boolean') {
      latestRef.current.autoStartBreaks = profile.auto_start_breaks
      setAutoStartBreaksLocal(profile.auto_start_breaks)
    }
    if (typeof profile.auto_start_focus === 'boolean') {
      latestRef.current.autoStartFocus = profile.auto_start_focus
      setAutoStartFocusLocal(profile.auto_start_focus)
    }
    if (typeof profile.focus_duration === 'number' && Number.isFinite(profile.focus_duration)) {
      setFocusDurationLocal(profile.focus_duration)
    }
    if (typeof profile.break_duration === 'number' && Number.isFinite(profile.break_duration)) {
      setBreakDurationLocal(profile.break_duration)
    }
    if (typeof profile.timer_sound === 'string' && profile.timer_sound) {
      setTimerSoundLocal(profile.timer_sound as TimerSound)
    }
    if (typeof profile.timer_volume === 'number' && Number.isFinite(profile.timer_volume)) {
      setTimerVolumeLocal(profile.timer_volume)
    }
    if (
      typeof profile.alarm_repeat_count === 'number' &&
      Number.isFinite(profile.alarm_repeat_count)
    ) {
      setAlarmRepeatCountLocal(profile.alarm_repeat_count)
    }
  }, [
    profile?.auto_start_breaks,
    profile?.auto_start_focus,
    profile?.focus_duration,
    profile?.break_duration,
    profile?.timer_sound,
    profile?.timer_volume,
    profile?.alarm_repeat_count,
  ])

  const handleToggleAutoStartBreaks = useCallback(() => {
    if (!userId) return
    const previousValue = latestRef.current.autoStartBreaks
    const newValue = !previousValue
    // Mirror synchronously so a second click before re-render still flips.
    latestRef.current.autoStartBreaks = newValue
    setAutoStartBreaksLocal(newValue)

    // Mark an in-flight write before firing it so the profile sync effect
    // (and the realtime echo of this write) can't overwrite the optimistic
    // value. Only a real Supabase error reverts the toggle; a resolving write
    // superseded by a newer click does nothing (token check).
    committingRef.current = true
    pendingWriteRef.current += 1
    const token = pendingWriteRef.current
    void setAutoStartBreaks(userId, newValue).then(({ error }) => {
      if (token !== pendingWriteRef.current) return
      committingRef.current = false
      if (error) {
        latestRef.current.autoStartBreaks = previousValue
        setAutoStartBreaksLocal(previousValue)
      }
    })
  }, [userId])

  const handleToggleAutoStartFocus = useCallback(() => {
    if (!userId) return
    const previousValue = latestRef.current.autoStartFocus
    const newValue = !previousValue
    // Mirror synchronously so a second click before re-render still flips.
    latestRef.current.autoStartFocus = newValue
    setAutoStartFocusLocal(newValue)

    // Mark an in-flight write before firing it so the profile sync effect
    // (and the realtime echo of this write) can't overwrite the optimistic
    // value. Only a real Supabase error reverts the toggle; a resolving write
    // superseded by a newer click does nothing (token check).
    committingRef.current = true
    pendingWriteRef.current += 1
    const token = pendingWriteRef.current
    void setAutoStartFocus(userId, newValue).then(({ error }) => {
      if (token !== pendingWriteRef.current) return
      committingRef.current = false
      if (error) {
        latestRef.current.autoStartFocus = previousValue
        setAutoStartFocusLocal(previousValue)
      }
    })
  }, [userId])

  const handleFocusDurationChange = useCallback(
    (minutes: number) => {
      if (!userId) return
      setFocusDurationLocal(minutes)
      setFocusDuration(userId, minutes)
    },
    [userId],
  )

  const handleBreakDurationChange = useCallback(
    (minutes: number) => {
      if (!userId) return
      setBreakDurationLocal(minutes)
      setBreakDuration(userId, minutes)
    },
    [userId],
  )

  const handleTimerSoundChange = useCallback(
    (sound: TimerSound) => {
      if (!userId) return
      setTimerSoundLocal(sound)
      setTimerSound(userId, sound)
    },
    [userId],
  )

  const handleTimerVolumeChange = useCallback(
    (volume: number) => {
      if (!userId) return
      setTimerVolumeLocal(volume)
      setTimerVolume(userId, volume)
    },
    [userId],
  )

  const handleAlarmRepeatCountChange = useCallback(
    (count: number) => {
      if (!userId) return
      const clamped = Math.max(1, Math.min(5, Math.round(count)))
      setAlarmRepeatCountLocal(clamped)
      setAlarmRepeatCount(userId, clamped)
    },
    [userId],
  )

  const handleCustomSoundUpload = useCallback(async (file: File) => {
    if (customSoundUrl) {
      URL.revokeObjectURL(customSoundUrl)
    }
    const { id, blobUrl } = await saveCustomRingtone(file)
    setCustomSoundUrl(blobUrl)
    setCustomRingtoneId(id)
  }, [customSoundUrl])

  const handleRemoveCustomSound = useCallback(async () => {
    if (customSoundUrl) {
      URL.revokeObjectURL(customSoundUrl)
    }
    if (customRingtoneId) {
      await removeCustomRingtoneFromDB(customRingtoneId)
    }
    setCustomSoundUrl(null)
    setCustomRingtoneId(null)
    if (timerSound === 'custom' && userId) {
      setTimerSoundLocal('bell')
      setTimerSound(userId, 'bell')
    }
  }, [customSoundUrl, customRingtoneId, timerSound, userId])

  return {
    autoStartBreaks,
    autoStartFocus,
    focusDuration,
    breakDuration,
    timerSound,
    timerVolume,
    alarmRepeatCount,
    customSoundUrl,
    handleToggleAutoStartBreaks,
    handleToggleAutoStartFocus,
    handleFocusDurationChange,
    handleBreakDurationChange,
    handleTimerSoundChange,
    handleTimerVolumeChange,
    handleAlarmRepeatCountChange,
    handleCustomSoundUpload,
    handleRemoveCustomSound,
  }
}
