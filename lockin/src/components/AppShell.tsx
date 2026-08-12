import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LogOut, Settings, Users } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { useTimerSettings } from '../hooks/useTimerSettings'
import Button from './Button'
import Logo from './Logo'
import SettingsModal from './SettingsModal'
import StatusBadge from './StatusBadge'
import ThemeToggle from './ThemeToggle'

type AppShellProps = {
  children: React.ReactNode
  maxWidth?: 'md' | 'lg' | 'xl' | '2xl' | '4xl'
}

const widthClass = {
  md: 'max-w-lg',
  lg: 'max-w-xl',
  xl: 'max-w-2xl',
  '2xl': 'max-w-2xl',
  '4xl': 'max-w-4xl',
}

export default function AppShell({ children, maxWidth = '2xl' }: AppShellProps) {
  const { user, signOut } = useAuth()
  const { profile } = useProfile()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const timerSettings = useTimerSettings(user?.id)

  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
        <Link to="/">
          <Logo size="sm" />
        </Link>
        <div className="flex items-center gap-3">
          {profile && (
            <span className="hidden text-sm text-text-secondary sm:inline">
              @{profile.username}
            </span>
          )}
          <Link
            to="/friends"
            className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text"
            aria-label="Friends"
          >
            <Users size={18} />
          </Link>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text"
            aria-label="Settings"
          >
            <Settings size={18} />
          </button>
          <ThemeToggle />
          <Button variant="ghost" onClick={() => signOut()} aria-label="Sign out">
            <LogOut size={18} />
          </Button>
        </div>
      </header>
      <main className={`mx-auto px-6 py-10 ${widthClass[maxWidth]}`}>{children}</main>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        autoStartBreaks={timerSettings.autoStartBreaks}
        autoStartFocus={timerSettings.autoStartFocus}
        focusDuration={timerSettings.focusDuration}
        breakDuration={timerSettings.breakDuration}
        timerSound={timerSettings.timerSound}
        timerVolume={timerSettings.timerVolume}
        hasCustomSound={!!timerSettings.customSoundUrl}
        customRingtoneUrl={timerSettings.customSoundUrl}
        onToggleAutoStartBreaks={timerSettings.handleToggleAutoStartBreaks}
        onToggleAutoStartFocus={timerSettings.handleToggleAutoStartFocus}
        onFocusDurationChange={timerSettings.handleFocusDurationChange}
        onBreakDurationChange={timerSettings.handleBreakDurationChange}
        onTimerSoundChange={timerSettings.handleTimerSoundChange}
        onTimerVolumeChange={timerSettings.handleTimerVolumeChange}
        onCustomSoundUpload={timerSettings.handleCustomSoundUpload}
        onRemoveCustomSound={timerSettings.handleRemoveCustomSound}
      />
    </div>
  )
}

export function StatusPicker() {
  const { profile, updateStatus } = useProfile()
  if (!profile) return null

  const statuses = ['available', 'studying', 'break', 'away'] as const

  return (
    <div className="flex flex-wrap gap-2">
      {statuses.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => updateStatus(s)}
          className={[
            'rounded-lg border px-3 py-1.5 text-sm transition-colors',
            profile.status === s
              ? 'border-accent bg-accent-muted text-text'
              : 'border-border-subtle text-text-secondary hover:border-border hover:text-text',
          ].join(' ')}
        >
          <StatusBadge status={s} />
        </button>
      ))}
    </div>
  )
}
