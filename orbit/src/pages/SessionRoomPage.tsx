import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronUp, History, Lock, MessageCircle, Send, Settings, SkipForward, Trash2 } from 'lucide-react'
import Button from '../components/Button'
import Logo from '../components/Logo'
import SettingsModal from '../components/SettingsModal'
import StatusBadge from '../components/StatusBadge'
import ThemeToggle from '../components/ThemeToggle'
import { useAuth } from '../hooks/useAuth'
import { useFocusSession } from '../hooks/useFocusSession'
import { useTimerSettings } from '../hooks/useTimerSettings'
import { formatTimer } from '../lib/sessionTimer'
import {
  installTimerAudioUnlock,
  playTimerSound,
  requestNotificationPermission,
  sendTimerNotification,
} from '../lib/timerSounds'
import { PHASE_LABELS } from '../lib/types'

/** Title from index.html — restored whenever no session timer is running. */
const APP_TITLE = 'Orbit - Study together'

/** Gap between repeated alarm plays (built-in sounds last ~2s). */
const ALARM_REPEAT_GAP_MS = 3000

export default function SessionRoomPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatError, setChatError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  /** "Clear chat for me" confirmation step. */
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  /** "Delete chat for everyone" (host / allowed controllers) confirmation step. */
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  /**
   * Visual collapse/expand of the break chat panel. Purely local UI state —
   * nothing is hidden from the server and nothing is deleted. Distinct from
   * "show previous breaks" (which reveals older history) and "delete chat
   * for everyone" (which permanently removes messages).
   */
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)
  const customAudioRef = useRef<HTMLAudioElement | null>(null)
  const prevRemainingRef = useRef<number>(0)
  const soundPlayedRef = useRef(false)
  const stopOnClickRef = useRef<(() => void) | null>(null)
  const repeatTimersRef = useRef<number[]>([])

  const {
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

  /** Plays the end-of-timer alert once (custom ringtone or built-in sound). */
  const playAlarmOnce = useCallback(() => {
    const audio = customAudioRef.current

    if (customSoundUrl && audio) {
      try {
        audio.currentTime = 0
        audio.volume = timerVolume / 100
        audio.play().catch((err) => {
          console.error('[SessionRoom] Failed to play custom sound:', err)
          // Fall back to the synthesised sound if the file cannot play
          playTimerSound(timerSound, timerVolume / 100)
        })
      } catch (err) {
        console.error('[SessionRoom] Custom sound play error:', err)
        playTimerSound(timerSound, timerVolume / 100)
      }
    } else {
      playTimerSound(timerSound, timerVolume / 100)
    }
  }, [customSoundUrl, timerSound, timerVolume])

  /** Silences the alert, cancels pending repeats and removes the dismiss listener. */
  const stopAlarm = useCallback(() => {
    for (const timer of repeatTimersRef.current) window.clearTimeout(timer)
    repeatTimersRef.current = []

    if (customAudioRef.current) {
      customAudioRef.current.pause()
      customAudioRef.current.currentTime = 0
    }

    if (stopOnClickRef.current) {
      document.removeEventListener('click', stopOnClickRef.current)
      stopOnClickRef.current = null
    }
  }, [])

  // Mobile browsers only allow audio that was started from a user gesture, so
  // unlock the Web Audio context and the custom ringtone <audio> element on the
  // first tap / key press in the room. Without this the alarm stays silent on
  // iOS Safari and most Android browsers.
  useEffect(() => {
    installTimerAudioUnlock()

    const unlockCustomAudio = () => {
      const audio = customAudioRef.current
      if (!audio) return

      // Play silently once inside the gesture, then rewind so the real alarm can
      // play later without autoplay restrictions.
      const previousVolume = audio.volume
      audio.volume = 0

      const played = audio.play()
      if (!played) {
        audio.volume = previousVolume
        return
      }

      played
        .then(() => {
          audio.pause()
          audio.currentTime = 0
          audio.volume = previousVolume
        })
        .catch(() => {
          audio.volume = previousVolume
        })
    }

    const gestureEvents: (keyof WindowEventMap)[] = [
      'pointerdown',
      'touchend',
      'mousedown',
      'keydown',
    ]
    for (const event of gestureEvents) {
      window.addEventListener(event, unlockCustomAudio)
    }

    return () => {
      for (const event of gestureEvents) {
        window.removeEventListener(event, unlockCustomAudio)
      }
    }
  }, [customSoundUrl])

  const {
    session,
    participants,
    messages,
    allMessages,
    showPreviousBreaks,
    setShowPreviousBreaks,
    profileMap,
    remainingSec,
    loading,
    error,
    isHost,
    allowAllControl,
    canControl,
    setAllowAllControl,
    clearChat,
    deleteChat,
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
    // Scroll inside the fixed-height chat box (not the whole page) so new
    // messages push older ones up within the box.
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, chatCollapsed])

  // Keep the browser tab title in sync with the running timer so the remaining
  // time is visible even when the user is on another tab. Resets to the normal
  // app title when no session is running and when the room unmounts.
  useEffect(() => {
    if (!session || session.phase === 'idle' || !session.is_active) {
      document.title = APP_TITLE
    } else {
      document.title = `${formatTimer(remainingSec)} - Orbit`
    }

    return () => {
      document.title = APP_TITLE
    }
  }, [session, remainingSec])

  // Request notification permission on first settings open
  useEffect(() => {
    if (settingsModalOpen) {
      requestNotificationPermission()
    }
  }, [settingsModalOpen])

  // Clean up the dismiss listener and any pending alarm repeats on unmount
  useEffect(() => {
    return () => {
      stopAlarm()
    }
  }, [stopAlarm])

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
        playAlarmOnce()

        // Repeat the alarm for the configured number of times (1–5)
        const repeatCount = Math.max(1, Math.min(5, alarmRepeatCount))
        for (let i = 1; i < repeatCount; i++) {
          repeatTimersRef.current.push(
            window.setTimeout(playAlarmOnce, i * ALARM_REPEAT_GAP_MS),
          )
        }

        // Send browser notification as fallback
        sendTimerNotification(session.phase)

        // Any screen click dismisses the ringtone and cancels the repeats
        stopOnClickRef.current = stopAlarm
        document.addEventListener('click', stopAlarm)
      }
    }

    // Reset the sound played flag when timer starts again
    if (remainingSec > 0) {
      soundPlayedRef.current = false
      if (repeatTimersRef.current.length > 0 || stopOnClickRef.current) stopAlarm()
    }
  }, [remainingSec, session?.phase, session?.is_paused, timerSound, timerVolume, alarmRepeatCount, customSoundUrl, session, playAlarmOnce, stopAlarm])

  async function handleLeave() {
    await leave()
    navigate('/')
  }

  // Keep the caret in the message box so several messages can be sent in a row.
  // Clearing the input / disabling things during send otherwise drops focus.
  function refocusChatInput() {
    chatInputRef.current?.focus()
    requestAnimationFrame(() => chatInputRef.current?.focus())
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
    refocusChatInput()
  }

  // Clear this user's session chat view (per-user watermark, nothing shared is deleted)
  async function handleConfirmClearChat() {
    if (clearing) return
    setClearing(true)
    await clearChat()
    setClearing(false)
    setConfirmingClear(false)
  }

  // Permanently delete the session chat for EVERYONE (host, or participants
  // the host allowed to control the session). Rows are removed from Supabase
  // so they never reappear on refresh or for other participants.
  async function handleConfirmDeleteChat() {
    if (deleting) return
    setDeleting(true)
    await deleteChat()
    setDeleting(false)
    setConfirmingDelete(false)
  }

  async function handleSkip() {
    if (!canControl || !session || !id || !user) return
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
              ? canControl
                ? 'Ready when you are — start the session'
                : 'Waiting for the host to start'
              : session.phase === 'focus'
                ? `${Math.floor(session.focus_duration_sec / 60)} min focus`
                : `${Math.floor(session.break_duration_sec / 60)} min break`}
          </p>

          {actionError && (
            <p className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {actionError}
            </p>
          )}

          {canControl && (
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

          {/* Pause/Resume — host, or everyone when the host allowed it */}
          {canControl && session.phase !== 'idle' && (
            <button
              type="button"
              onClick={() => void (session.is_paused ? resume() : pause())}
              className="mt-3 rounded-lg border border-border bg-surface-overlay px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-raised"
            >
              {session.is_paused ? 'Resume' : 'Pause'}
            </button>
          )}

          {/* Skip button — host, or everyone when the host allowed it */}
          {canControl && session.phase !== 'idle' && (
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

          <section className="flex min-h-0 flex-col rounded-lg border border-border-subtle">
            <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
              <MessageCircle size={16} className="text-text-secondary" />
              <h2 className="text-sm font-medium text-text-secondary">Break chat</h2>
              {!chatEnabled && <Lock size={14} className="text-text-muted" />}
              {chatCollapsed && messages.length > 0 && (
                <span className="text-xs tabular-nums text-text-muted">
                  {messages.length} {messages.length === 1 ? 'message' : 'messages'}
                </span>
              )}
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setConfirmingClear((prev) => !prev)}
                  className={`rounded-md p-1.5 transition-colors hover:bg-surface-overlay ${
                    confirmingClear ? 'text-danger' : 'text-text-secondary hover:text-text'
                  }`}
                  aria-label="Clear chat for me"
                  title="Clear chat for me (other participants keep the history)"
                >
                  <Trash2 size={14} />
                </button>
                {canControl && (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingDelete((prev) => !prev)
                      setConfirmingClear(false)
                    }}
                    className={`rounded-md p-1.5 transition-colors hover:bg-surface-overlay ${
                      confirmingDelete ? 'text-danger' : 'text-text-secondary hover:text-text'
                    }`}
                    aria-label="Delete chat for everyone"
                    title="Delete chat for everyone (permanent — removes it for all participants)"
                  >
                    <Trash2 size={14} className="text-danger" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setChatCollapsed((prev) => !prev)}
                  aria-expanded={!chatCollapsed}
                  aria-label={chatCollapsed ? 'Expand break chat' : 'Collapse break chat'}
                  title={
                    chatCollapsed
                      ? 'Expand break chat (visual only, messages stay saved)'
                      : 'Collapse break chat (visual only, messages stay saved)'
                  }
                  className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text"
                >
                  {chatCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                </button>
              </div>
            </div>

            {chatCollapsed ? (
              <p className="px-4 py-3 text-xs text-text-muted">
                Chat collapsed — expand to read and send messages.
              </p>
            ) : (
              <>
              {confirmingDelete && (
                <div className="border-b border-border-subtle bg-surface-overlay px-4 py-3">
                  <p className="text-xs text-text-secondary">
                    Permanently delete this chat for everyone? This removes all messages from the
                    server — they will disappear for all participants and cannot be recovered.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleConfirmDeleteChat()}
                      disabled={deleting}
                      className="rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
                    >
                      {deleting ? 'Deleting…' : 'Delete for everyone'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      disabled={deleting}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-raised hover:text-text disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {confirmingClear && (
                <div className="border-b border-border-subtle bg-surface-overlay px-4 py-3">
                  <p className="text-xs text-text-secondary">
                    Clear this chat for you? Other participants keep the full history, and new
                    messages will appear here again.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleConfirmClearChat()}
                      disabled={clearing}
                      className="rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
                    >
                      {clearing ? 'Clearing…' : 'Clear for me'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingClear(false)}
                      disabled={clearing}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-raised hover:text-text disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div ref={chatScrollRef} className="h-64 min-h-0 shrink-0 space-y-3 overflow-y-auto p-4">
                {showPreviousBreaks ? (
                  <button
                    type="button"
                    onClick={() => setShowPreviousBreaks(false)}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-overlay px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-raised hover:text-text"
                  >
                    <History size={12} />
                    Showing full session history — show this break only
                  </button>
                ) : (
                  allMessages.length > messages.length && (
                    <button
                      type="button"
                      onClick={() => setShowPreviousBreaks(true)}
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-overlay px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-raised hover:text-text"
                      title="Earlier breaks are kept on the server — this only changes what you see"
                    >
                      <History size={12} />
                      Show previous breaks ({allMessages.length - messages.length} earlier{' '}
                      {allMessages.length - messages.length === 1 ? 'message' : 'messages'})
                    </button>
                  )
                )}
                {messages.length === 0 ? (
                  <p className="text-center text-xs text-text-muted">
                    {!chatEnabled
                      ? 'Chat locked during focus time'
                      : allMessages.length > messages.length && !showPreviousBreaks
                        ? 'New break — starting fresh. Earlier breaks are still saved.'
                        : 'Say hi before the session starts or during breaks'}
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
                    ref={chatInputRef}
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    disabled={!chatEnabled}
                    readOnly={sending}
                    placeholder={
                      chatEnabled ? 'Message friends…' : 'Chat locked during focus time'
                    }
                    maxLength={500}
                    className="flex-1 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text placeholder:text-text-muted disabled:opacity-50"
                  />
                  <Button
                    type="submit"
                    disabled={!chatEnabled || sending || !chatInput.trim()}
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <Send size={16} />
                  </Button>
                </div>
              </form>
              </>
            )}
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
        alarmRepeatCount={alarmRepeatCount}
        hasCustomSound={!!customSoundUrl}
        customRingtoneUrl={customSoundUrl}
        allowAllControl={allowAllControl}
        onToggleAllowAllControl={
          isHost ? () => void setAllowAllControl(!allowAllControl) : undefined
        }
        onToggleAutoStartBreaks={handleToggleAutoStartBreaks}
        onToggleAutoStartFocus={handleToggleAutoStartFocus}
        onFocusDurationChange={handleFocusDurationChange}
        onBreakDurationChange={handleBreakDurationChange}
        onTimerSoundChange={handleTimerSoundChange}
        onTimerVolumeChange={handleTimerVolumeChange}
        onAlarmRepeatCountChange={handleAlarmRepeatCountChange}
        onCustomSoundUpload={handleCustomSoundUpload}
        onRemoveCustomSound={handleRemoveCustomSound}
      />
    </div>
  )
}
