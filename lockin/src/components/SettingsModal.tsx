import { X } from 'lucide-react'

type SettingsModalProps = {
  open: boolean
  onClose: () => void
  autoStartBreaks: boolean
  autoStartFocus: boolean
  onToggleAutoStartBreaks: () => void
  onToggleAutoStartFocus: () => void
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

export default function SettingsModal({
  open,
  onClose,
  autoStartBreaks,
  autoStartFocus,
  onToggleAutoStartBreaks,
  onToggleAutoStartFocus,
}: SettingsModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface-raised p-6 shadow-xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-bold">Pomodoro settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-secondary hover:bg-surface-overlay hover:text-text"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between rounded-lg border border-border-subtle px-4 py-3">
            <div>
              <p className="text-sm font-medium text-text">Auto-start breaks</p>
              <p className="text-xs text-text-muted">
                When a focus session ends, the break timer starts automatically
              </p>
            </div>
            <ToggleSwitch
              enabled={autoStartBreaks}
              onChange={onToggleAutoStartBreaks}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border-subtle px-4 py-3">
            <div>
              <p className="text-sm font-medium text-text">Auto-start focus sessions</p>
              <p className="text-xs text-text-muted">
                When a break ends, the next focus session starts automatically
              </p>
            </div>
            <ToggleSwitch
              enabled={autoStartFocus}
              onChange={onToggleAutoStartFocus}
            />
          </div>
        </div>
      </div>
    </div>
  )
}