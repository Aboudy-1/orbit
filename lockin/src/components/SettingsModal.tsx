import { useEffect, useRef, useState } from 'react'
import { Minus, Play, Plus, Square, Trash2, Upload, X } from 'lucide-react'
import { playTimerSound } from '../lib/timerSounds'
import { TIMER_SOUND_LABELS, type TimerSound } from '../lib/types'

type SettingsModalProps = {
  open: boolean
  onClose: () => void
  autoStartBreaks: boolean
  autoStartFocus: boolean
  focusDuration: number
  breakDuration: number
  timerSound: TimerSound
  timerVolume: number
  hasCustomSound: boolean
  customRingtoneUrl?: string | null
  onToggleAutoStartBreaks: () => void
  onToggleAutoStartFocus: () => void
  onFocusDurationChange: (minutes: number) => void
  onBreakDurationChange: (minutes: number) => void
  onTimerSoundChange: (sound: TimerSound) => void
  onTimerVolumeChange: (volume: number) => void
  onCustomSoundUpload?: (file: File) => void
  onRemoveCustomSound?: () => void
}

function ToggleSwitch({
  enabled,
  onChange,
}: {
  enabled: boolean
  onChange: () => void
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
      role="switch"
      aria-checked={enabled}
      style={{
        backgroundColor: enabled ? '#0d9488' : '#27272a',
      }}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          enabled ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

function StepperInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border-subtle px-4 py-3">
      <div>
        <p className="text-sm font-medium text-text">{label} duration</p>
        <p className="text-xs text-text-muted">minutes</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text disabled:opacity-30"
        >
          <Minus size={16} />
        </button>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10)
            if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)))
          }}
          className="w-16 rounded-lg border border-border bg-surface-raised px-2 py-1.5 text-center text-sm font-medium text-text tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text disabled:opacity-30"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  )
}

const SOUND_OPTIONS: TimerSound[] = ['bell', 'chime', 'digital', 'gentle', 'none']

export default function SettingsModal({
  open,
  onClose,
  autoStartBreaks,
  autoStartFocus,
  focusDuration,
  breakDuration,
  timerSound,
  timerVolume,
  hasCustomSound,
  customRingtoneUrl,
  onToggleAutoStartBreaks,
  onToggleAutoStartFocus,
  onFocusDurationChange,
  onBreakDurationChange,
  onTimerSoundChange,
  onTimerVolumeChange,
  onCustomSoundUpload,
  onRemoveCustomSound,
}: SettingsModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!open) {
      stopAudio()
    }
  }, [open])

  useEffect(() => {
    return () => {
      stopAudio()
    }
  }, [])

  function stopAudio() {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current.onended = null
      audioRef.current = null
    }
    setPlayingId(null)
  }

  function handlePreview(soundId: TimerSound) {
    if (soundId === 'none') return
    if (playingId === soundId) {
      stopAudio()
      return
    }
    stopAudio()
    setPlayingId(soundId)

    if (soundId === 'custom') {
      if (customRingtoneUrl) {
        const audio = new Audio(customRingtoneUrl)
        audio.volume = timerVolume / 100
        audio.onended = () => {
          setPlayingId(null)
          audioRef.current = null
        }
        audioRef.current = audio
        audio.play().catch((err) => {
          console.error('[SettingsModal] Failed to play custom sound:', err)
          setPlayingId(null)
        })
      }
    } else {
      playTimerSound(soundId, timerVolume / 100)
      setTimeout(() => {
        setPlayingId((prev) => (prev === soundId ? null : prev))
      }, 2500)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !onCustomSoundUpload) return
    stopAudio()
    onCustomSoundUpload(file)
    onTimerSoundChange('custom')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-surface-raised shadow-xl">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border-subtle bg-surface-raised px-6 py-4">
          <h2 className="text-lg font-bold">Pomodoro settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-secondary hover:bg-surface-overlay hover:text-text"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-6">
          <StepperInput
            label="Focus"
            value={focusDuration}
            min={1}
            max={120}
            onChange={onFocusDurationChange}
          />
          <StepperInput
            label="Break"
            value={breakDuration}
            min={1}
            max={60}
            onChange={onBreakDurationChange}
          />

          <div className="h-px bg-border-subtle" />

          <div className="flex items-center justify-between rounded-lg border border-border-subtle px-4 py-3">
            <div>
              <p className="text-sm font-medium text-text">Auto-start breaks</p>
              <p className="text-xs text-text-muted">
                When a focus session ends, the break timer starts automatically
              </p>
            </div>
            <ToggleSwitch enabled={autoStartBreaks} onChange={onToggleAutoStartBreaks} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border-subtle px-4 py-3">
            <div>
              <p className="text-sm font-medium text-text">Auto-start focus sessions</p>
              <p className="text-xs text-text-muted">
                When a break ends, the next focus session starts automatically
              </p>
            </div>
            <ToggleSwitch enabled={autoStartFocus} onChange={onToggleAutoStartFocus} />
          </div>

          <div className="h-px bg-border-subtle" />

          {/* Timer Sound Section */}
          <div>
            <p className="mb-3 text-sm font-medium text-text">Timer Sound</p>

            <div className="flex flex-col gap-2">
              {SOUND_OPTIONS.map((sound) => (
                <div
                  key={sound}
                  className={`flex items-center justify-between rounded-lg border px-4 py-2.5 transition-colors ${
                    timerSound === sound
                      ? 'border-accent bg-accent/10'
                      : 'border-border-subtle hover:bg-surface-overlay'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onTimerSoundChange(sound)}
                    className="flex-1 text-left"
                  >
                    <p className="text-sm font-medium text-text">
                      {TIMER_SOUND_LABELS[sound]}
                    </p>
                  </button>
                  {sound !== 'none' && (
                    <button
                      type="button"
                      onClick={() => handlePreview(sound)}
                      className="ml-2 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text"
                      title={playingId === sound ? 'Stop preview' : `Preview ${TIMER_SOUND_LABELS[sound]}`}
                    >
                      {playingId === sound ? <Square size={12} /> : <Play size={14} />}
                    </button>
                  )}
                </div>
              ))}

              {/* Custom ringtone option */}
              {hasCustomSound && (
                <div
                  className={`flex items-center justify-between rounded-lg border px-4 py-2.5 transition-colors ${
                    timerSound === 'custom'
                      ? 'border-accent bg-accent/10'
                      : 'border-border-subtle hover:bg-surface-overlay'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onTimerSoundChange('custom')}
                    className="flex-1 text-left"
                  >
                    <p className="text-sm font-medium text-text">{TIMER_SOUND_LABELS.custom}</p>
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handlePreview('custom')}
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text"
                      title={playingId === 'custom' ? 'Stop custom sound' : 'Preview custom sound'}
                    >
                      {playingId === 'custom' ? <Square size={12} /> : <Play size={14} />}
                    </button>
                    {onRemoveCustomSound && (
                      <button
                        type="button"
                        onClick={() => {
                          stopAudio()
                          onRemoveCustomSound()
                        }}
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-danger/20 hover:text-danger"
                        title="Remove custom ringtone"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Custom ringtone upload */}
          <div className="rounded-lg border border-border-subtle px-4 py-3">
            <p className="text-sm font-medium text-text">Custom ringtone</p>
            <p className="mb-2 text-xs text-text-muted">
              Upload your own alert sound (.mp3, .wav, .ogg)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/ogg"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface-overlay px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-raised hover:text-text"
            >
              <Upload size={14} />
              Choose file
            </button>
          </div>

          {/* Volume slider */}
          <div className="rounded-lg border border-border-subtle px-4 py-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-text">Alert volume</p>
              <p className="text-xs tabular-nums text-text-muted">{timerVolume}%</p>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={timerVolume}
              onChange={(e) => onTimerVolumeChange(parseInt(e.target.value, 10))}
              className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-border-subtle accent-accent"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
