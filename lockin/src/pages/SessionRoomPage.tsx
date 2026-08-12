import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Lock, MessageCircle, Send, Settings, SkipForward } from 'lucide-react'
import Button from '../components/Button'
import Logo from '../components/Logo'
import SettingsModal from '../components/SettingsModal'
import StatusBadge from '../components/StatusBadge'
import ThemeToggle from '../components/ThemeToggle'
import { useAuth } from '../hooks/useAuth'
import { useFocusSession } from '../hooks/useFocusSession'
import { useProfile } from '../hooks/useProfile'
import { useTimerSettings } from '../hooks/useTimerSettings'
import { formatTimer } from '../lib/sessionTimer'
import {
  playTimerSound,
  requestNotificationPermission,
  sendTimerNotification,
} from '../lib/timerSounds'
import { PHASE_LABELS } from '../lib/types'

export default function SessionRoomPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { profile } = useProfile()
  const navigate = useNavigate()

  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatError, setChatError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const customAudioRef = useRef<HTMLAudioElement | null>(null)
  const prevRemainingRef = useRef<number>(0)
  const soundPlayedRef = useRef(false)
  const stopOnClickRef = useRef<(() => void) | null>(null)

  const {
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
  } = useTimerSettings(user?.id)

  // Create/update Audio element when custom sound URL changes
  useEffect(() => {
    if (customSoundUrl) {
      const audio = new Audio(customSoundUrl)
      audio.volume = timerVolume / 100
      customAudioRef.current = audio
    } else {
      customAudioRef.current = null
    }
  }, [customSoundUrl, timerVolume])

  const {
    session,
    participants,
    messages,
    profileMap,
    remainingSec,
    loading,
    error,
    isHost,
    actionError,
    starting,
    start,
    startBreak,
    end,
    leave,
    sendMessage,
    pause,
    resume,
  } = useFocusSession(id, user?.id, autoStartBreaks, autoStartFocus, focusDuration, breakDuration)

  const chatEnabled = session?.phase !== 'focus'

  // Determine if break needs manual start (focus ended but not auto-started)
  const focusEnded = session?.phase === 'focus' && remainingSec <= 0

  useEffect(() => {
    if (session && !session.is_active) {
      navigate('/', { replace: true })
    }
  }, [session, navigate])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Request notification permission on first settings open
  useEffect(() => {
    if (settingsModalOpen) {
      requestNotificationPermission()
    }
  }, [settingsModalOpen])

  // Clean up click listener on unmount
  useEffect(() => {
    return () => {
      if (stopOnClickRef.current) {
        document.removeEventListener('click', stopOnClickRef.current)
        stopOnClickRef.current = null
      }
    }
  }, [])

  // Play alert sound when timer hits 0
  useEffect(() => {
    if (!session || session.phase === 'idle' || session.is_paused) {
      prevRemainingRef.current = remainingSec
      return
    }

    const prev = prevRemainingRef.current
    prevRemainingRef.current = remainingSec

    // Detect transition from positive to zero
    if (prev > 0 && remainingSec === 0) {
      if (!soundPlayedRef.current) {
        soundPlayedRef.current = true

        // Play the custom sound if uploaded, otherwise the built-in sound
        if (customSoundUrl && customAudioRef.current) {
          try {
            customAudioRef.current.currentTime = 0
            customAudioRef.current.volume = timerVolume / 100
            customAudioRef.current.play().catch((err) =>
              console.error('[SessionRoom] Failed to play custom sound:', err),
            )
          } catch (err) {
            console.error('[SessionRoom] Custom sound play error:', err)
          }
        } else {
          playTimerSound(timerSound, timerVolume / 100)
        }

        // Send browser notification as fallback
        sendTimerNotification(session.phase)

        // Add one-time click listener to stop the ringtone on any screen click
        stopOnClickRef.current = () => {
          if (customAudioRef.current) {
            customAudioRef.current.pause()
            customAudioRef.current.currentTime = 0
          }
          document.removeEventListener('click', stopOnClickRef.current!)
          stopOnClickRef.current = null
        }
        document.addEventListener('click', stopOnClickRef.current)
      }
    }

    // Reset the sound played flag when timer starts again
    if (remainingSec > 0) {
      soundPlayedRef.current = false
    }
  }, [remainingSec, session?.phase, session?.is_paused, timerSound, timerVolume, customSoundUrl, session])

  async function handleLeave() {
    await leave()
    navigate('/')
  }

  async function handleChatSubmit(e: FormEvent) {
    e.preventDefault()
    if (!chatInput.trim()) return
    setSending(true)
    setChatError(null)
    const { error: err } = await sendMessage(chatInput)
    setSending(false)
    if (err) setChatError(err)
    else setChatInput('')
  }

  async function handleSkip() {
    if (!isHost || !session || !id || !user) return
    if (session.phase === 'focus') {
      await startBreak()
    } else if (session.phase === 'break') {
      await start()
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-text-secondary text-sm">Loading session…</p>
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4">
        <p className="text-text-secondary">{error ?? 'Session not found'}</p>
        <Link to="/" className="text-sm text-accent hover:underline">
          Back to dashboard
        </Link>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
        <Logo size="sm" />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setSettingsModalOpen(true)}
            className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text"
            aria-label="Open pomodoro settings"
          >
            <Settings size={18} />
          </button>
          <Button variant="ghost" onClick={handleLeave}>
            <ArrowLeft size={16} />
            Leave
          </Button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-8 lg:flex-row">
        <div className="flex flex-1 flex-col items-center">
          <p className="text-sm text-text-secondary">{session.title}</p>
          <p className="mt-1 text-xs font-medium uppercase tracking-wider text-accent">
            {PHASE_LABELS[session.phase]}
          </p>

          <div className="mt-8 font-mono text-7xl font-bold tracking-tight tabular-nums">
            {session.phase === 'idle' ? (
              <span className="text-text-muted">--:--</span>
            ) : (
              formatTimer(remainingSec)
            )}
          </div>

          <p className="mt-4 text-sm text-text-muted">
            {session.phase === 'idle'
              ? 'Waiting for host to start'
              : session.phase === 'focus'
                ? `${Math.floor(session.focus_duration_sec / 60)} min focus`
                : `${Math.floor(session.break_duration_sec / 60)} min break`}
          </p>

          {actionError && (
            <p className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {actionError}
            </p>
          )}

          {isHost && (
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {session.phase === 'idle' && (
                <Button onClick={() => void start()} disabled={starting}>
                  {starting ? 'Starting…' : 'Start focus'}
                </Button>
              )}
              {session.phase !== 'idle' && (
                <Button variant="secondary" onClick={() => void end()}>
                  End session
                </Button>
              )}
              {!autoStartBreaks && focusEnded && (
                <Button onClick={() => void startBreak()} disabled={starting}>
                  {starting ? 'Starting…' : 'Start Break'}
                </Button>
              )}
            </div>
          )}

          {/* Pause/Resume — only visible to the host */}
          {isHost && session.phase !== 'idle' && (
            <button
              type="button"
              onClick={() => void (session.is_paused ? resume() : pause())}
              className="mt-3 rounded-lg border border-border bg-surface-overlay px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-raised"
            >
              {session.is_paused ? 'Resume' : 'Pause'}
            </button>
          )}

          {/* Skip button — visible to host when timer is running */}
          {isHost && session.phase !== 'idle' && (
            <button
              type="button"
              onClick={() => void handleSkip()}
              className="mt-3 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text"
            >
              <SkipForward size={14} />
              Skip
            </button>
          )}
        </div>

        <div className="flex w-full flex-col gap-6 lg:w-80">
          <section className="rounded-lg border border-border-subtle">
            <h2 className="border-b border-border-subtle px-4 py-3 text-sm font-medium text-text-secondary">
              Participants ({participants.length})
            </h2>
            <ul className="divide-y divide-border-subtle">
              {participants.map((p) => (
                <li key={p.user_id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">
                      @{p.profile?.username ?? 'unknown'}
                      {p.user_id === session.host_id && (
                        <span className="ml-2 text-xs text-text-muted">host</span>
                      )}
                    </p>
                    {p.profile && <StatusBadge status={p.profile.status} />}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex min-h-64 flex-1 flex-col rounded-lg border border-border-subtle">
            <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
              <MessageCircle size={16} className="text-text-secondary" />
              <h2 className="text-sm font-medium text-text-secondary">Break chat</h2>
              {!chatEnabled && <Lock size={14} className="text-text-muted" />}
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 ? (
                <p className="text-center text-xs text-text-muted">
                  {chatEnabled
                    ? 'Say hi before the session starts or during breaks'
                    : 'Chat locked during focus time'}
                </p>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className="text-sm">
                    <span className="font-medium text-text-secondary">
                      @{profileMap[m.user_id]?.username ?? 'user'}:{' '}
                    </span>
                    <span>{m.content}</span>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            <form
              onSubmit={handleChatSubmit}
              className="border-t border-border-subtle p-3"
            >
              {chatError && (
                <p className="mb-2 text-xs text-danger">{chatError}</p>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  disabled={!chatEnabled || sending}
                  placeholder={
                    chatEnabled ? 'Message friends…' : 'Chat locked during focus time'
                  }
                  maxLength={500}
                  className="flex-1 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text placeholder:text-text-muted disabled:opacity-50"
                />
                <Button type="submit" disabled={!chatEnabled || sending || !chatInput.trim()}>
                  <Send size={16} />
                </Button>
              </div>
            </form>
          </section>
        </div>
      </div>

      <SettingsModal
        open={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        autoStartBreaks={autoStartBreaks}
        autoStartFocus={autoStartFocus}
        focusDuration={focusDuration}
        breakDuration={breakDuration}
        timerSound={timerSound}
        timerVolume={timerVolume}
        hasCustomSound={!!customSoundUrl}
        customRingtoneUrl={customSoundUrl}
        onToggleAutoStartBreaks={handleToggleAutoStartBreaks}
        onToggleAutoStartFocus={handleToggleAutoStartFocus}
        onFocusDurationChange={handleFocusDurationChange}
        onBreakDurationChange={handleBreakDurationChange}
        onTimerSoundChange={handleTimerSoundChange}
        onTimerVolumeChange={handleTimerVolumeChange}
        onCustomSoundUpload={handleCustomSoundUpload}
        onRemoveCustomSound={handleRemoveCustomSound}
      />
    </div>
  )
}
