import { useCallback, useEffect, useState } from 'react'
import {
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
  customSoundUrl: string | null
}

export type TimerSettingsActions = {
  handleToggleAutoStartBreaks: () => void
  handleToggleAutoStartFocus: () => void
  handleFocusDurationChange: (minutes: number) => void
  handleBreakDurationChange: (minutes: number) => void
  handleTimerSoundChange: (sound: TimerSound) => void
  handleTimerVolumeChange: (volume: number) => void
  handleCustomSoundUpload: (file: File) => void
  handleRemoveCustomSound: () => void
}

export function useTimerSettings(userId: string | undefined): TimerSettingsState & TimerSettingsActions {
  const { profile } = useProfile()

  const [autoStartBreaks, setAutoStartBreaksLocal] = useState<boolean>(
    profile?.auto_start_breaks ?? true,
  )
  const [autoStartFocus, setAutoStartFocusLocal] = useState<boolean>(
    profile?.auto_start_focus ?? true,
  )
  const [focusDuration, setFocusDurationLocal] = useState<number>(25)
  const [breakDuration, setBreakDurationLocal] = useState<number>(5)
  const [timerSound, setTimerSoundLocal] = useState<TimerSound>(
    (profile?.timer_sound as TimerSound) ?? 'bell',
  )
  const [timerVolume, setTimerVolumeLocal] = useState<number>(
    profile?.timer_volume ?? 80,
  )
  const [customSoundUrl, setCustomSoundUrl] = useState<string | null>(null)
  const [customRingtoneId, setCustomRingtoneId] = useState<string | null>(null)

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

  // Sync local state with profile when it loads or changes
  useEffect(() => {
    if (!profile) return

    if (profile.auto_start_breaks !== undefined) {
      setAutoStartBreaksLocal(profile.auto_start_breaks)
    }
    if (profile.auto_start_focus !== undefined) {
      setAutoStartFocusLocal(profile.auto_start_focus)
    }
    if (profile.focus_duration !== undefined && profile.focus_duration !== null) {
      setFocusDurationLocal(profile.focus_duration)
    } else {
      setFocusDurationLocal(25)
    }
    if (profile.break_duration !== undefined && profile.break_duration !== null) {
      setBreakDurationLocal(profile.break_duration)
    } else {
      setBreakDurationLocal(5)
    }
    if (profile.timer_sound !== undefined && profile.timer_sound !== null) {
      setTimerSoundLocal(profile.timer_sound as TimerSound)
    }
    if (profile.timer_volume !== undefined && profile.timer_volume !== null) {
      setTimerVolumeLocal(profile.timer_volume)
    }
  }, [
    profile?.auto_start_breaks,
    profile?.auto_start_focus,
    profile?.focus_duration,
    profile?.break_duration,
    profile?.timer_sound,
    profile?.timer_volume,
  ])

  const handleToggleAutoStartBreaks = useCallback(() => {
    if (!userId) return
    const newValue = !autoStartBreaks
    setAutoStartBreaksLocal(newValue)
    setAutoStartBreaks(userId, newValue)
  }, [userId, autoStartBreaks])

  const handleToggleAutoStartFocus = useCallback(() => {
    if (!userId) return
    const newValue = !autoStartFocus
    setAutoStartFocusLocal(newValue)
    setAutoStartFocus(userId, newValue)
  }, [userId, autoStartFocus])

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
    customSoundUrl,
    handleToggleAutoStartBreaks,
    handleToggleAutoStartFocus,
    handleFocusDurationChange,
    handleBreakDurationChange,
    handleTimerSoundChange,
    handleTimerVolumeChange,
    handleCustomSoundUpload,
    handleRemoveCustomSound,
  }
}
