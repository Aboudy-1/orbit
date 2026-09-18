import type { TimerSound } from './types'

/**
 * Synthesize timer alert sounds using the Web Audio API.
 * No external audio files required — all sounds are generated procedurally.
 */

let audioCtx: AudioContext | null = null
let audioUnlocked = false
let unlockListenersInstalled = false
let pendingPlay: (() => void) | null = null

type AudioContextConstructor = typeof AudioContext

function getAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null
  const globalWithWebkit = globalThis as typeof globalThis & {
    webkitAudioContext?: AudioContextConstructor
  }
  return globalWithWebkit.AudioContext ?? globalWithWebkit.webkitAudioContext ?? null
}

function getAudioContext(): AudioContext {
  if (audioCtx) return audioCtx

  const Ctor = getAudioContextConstructor()
  if (!Ctor) throw new Error('Web Audio API is not supported in this browser')

  audioCtx = new Ctor()
  return audioCtx
}

/** Plays a 1-sample silent buffer — helps some mobile browsers mark the context usable. */
function primeAudioContext(ctx: AudioContext) {
  try {
    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start(0)
  } catch {
    // Priming is best-effort only
  }
}

function flushPendingPlay() {
  const play = pendingPlay
  pendingPlay = null
  play?.()
}

/**
 * Resume the shared AudioContext from inside a user gesture.
 * Mobile browsers (iOS Safari especially) create the context suspended and only
 * allow `resume()` while a gesture is being handled, so alarm sounds are silent
 * unless this runs on a tap/key press first.
 */
export function unlockTimerAudio() {
  let ctx: AudioContext
  try {
    ctx = getAudioContext()
  } catch (err) {
    console.error('[timerSounds] Audio unavailable:', err)
    return
  }

  primeAudioContext(ctx)

  if (ctx.state === 'running') {
    audioUnlocked = true
    flushPendingPlay()
    return
  }

  void ctx
    .resume()
    .then(() => {
      if (ctx.state === 'running') {
        audioUnlocked = true
        flushPendingPlay()
      }
    })
    .catch(() => {
      // Still locked — the gesture listeners will retry
    })
}

/**
 * Attach one-time-ish listeners so the first tap / key press unlocks timer audio
 * for the rest of the page's lifetime. Safe to call multiple times.
 */
export function installTimerAudioUnlock() {
  if (typeof window === 'undefined' || unlockListenersInstalled) return
  unlockListenersInstalled = true

  const events: (keyof WindowEventMap)[] = ['pointerdown', 'touchend', 'mousedown', 'keydown']

  const handler = () => {
    unlockTimerAudio()
    if (audioUnlocked) {
      for (const event of events) window.removeEventListener(event, handler)
    }
  }

  for (const event of events) {
    window.addEventListener(event, handler, { passive: true })
  }
}

export function isTimerAudioUnlocked(): boolean {
  return audioUnlocked
}

function playNow(sound: TimerSound, volume: number) {
  try {
    switch (sound) {
      case 'bell':
        playBell(volume)
        break
      case 'chime':
        playChime(volume)
        break
      case 'digital':
        playDigital(volume)
        break
      case 'gentle':
        playGentle(volume)
        break
    }
  } catch (err) {
    console.error('[timerSounds] Failed to play sound:', err)
  }
}

function playBell(volume: number) {
  const ctx = getAudioContext()
  const now = ctx.currentTime

  const freqs = [880, 1100]
  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const oscGain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, now)
    oscGain.gain.setValueAtTime(volume * 0.6, now + i * 0.15)
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2 + i * 0.15)
    osc.connect(oscGain)
    oscGain.connect(ctx.destination)
    osc.start(now + i * 0.15)
    osc.stop(now + 1.5 + i * 0.15)
  })

  const osc3 = ctx.createOscillator()
  const g3 = ctx.createGain()
  osc3.type = 'sine'
  osc3.frequency.setValueAtTime(1760, now)
  g3.gain.setValueAtTime(volume * 0.15, now)
  g3.gain.exponentialRampToValueAtTime(0.001, now + 0.8)
  osc3.connect(g3)
  g3.connect(ctx.destination)
  osc3.start(now)
  osc3.stop(now + 1.0)
}

function playChime(volume: number) {
  const ctx = getAudioContext()
  const now = ctx.currentTime
  const notes = [523, 659, 784, 1047] // C5, E5, G5, C6
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, now)
    gain.gain.setValueAtTime(volume * 0.5, now + i * 0.18)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8 + i * 0.18)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now + i * 0.18)
    osc.stop(now + 1.0 + i * 0.18)
  })
}

function playDigital(volume: number) {
  const ctx = getAudioContext()
  const now = ctx.currentTime
  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(880, now + i * 0.2)
    gain.gain.setValueAtTime(volume * 0.3, now + i * 0.2)
    gain.gain.setValueAtTime(0, now + 0.1 + i * 0.2)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now + i * 0.2)
    osc.stop(now + 0.12 + i * 0.2)
  }
}

function playGentle(volume: number) {
  const ctx = getAudioContext()
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(440, now)

  gain.gain.setValueAtTime(0, now)
  for (let i = 0; i < 4; i++) {
    const t = now + i * 0.5
    gain.gain.linearRampToValueAtTime(volume * 0.4, t + 0.15)
    gain.gain.linearRampToValueAtTime(volume * 0.1, t + 0.35)
  }
  gain.gain.linearRampToValueAtTime(0, now + 2.0)

  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 2.2)
}

/**
 * Play a timer alert sound.
 * @param sound - The sound type to play
 * @param volume - Volume from 0 to 1 (mapped from 0-100 percentage)
 */
export function playTimerSound(sound: TimerSound, volume: number) {
  if (sound === 'none' || sound === 'custom' || volume <= 0) return

  let ctx: AudioContext
  try {
    ctx = getAudioContext()
  } catch (err) {
    console.error('[timerSounds] Failed to play sound:', err)
    return
  }

  if (ctx.state === 'running') {
    audioUnlocked = true
    playNow(sound, volume)
    return
  }

  // Context is still suspended (mobile browsers block audio until a gesture).
  // Queue the alarm and play it as soon as the context can be resumed instead of
  // dropping it silently.
  pendingPlay = () => playNow(sound, volume)
  installTimerAudioUnlock()
  unlockTimerAudio()
}

/**
 * Send a browser notification as a fallback for background tabs.
 */
export function sendTimerNotification(phase: 'focus' | 'break') {
  if (!('Notification' in window)) return

  const title = phase === 'focus' ? 'Focus session ended!' : 'Break is over!'
  const body = phase === 'focus' ? 'Time for a break. Great work!' : 'Ready to focus again?'

  if (Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon: '/icon-192.png' })
    } catch {
      // Notification may fail in some contexts — silently ignore
    }
  }
}

/**
 * Request notification permission from the browser.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false

  const result = await Notification.requestPermission()
  return result === 'granted'
}
