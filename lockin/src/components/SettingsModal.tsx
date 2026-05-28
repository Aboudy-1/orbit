import { Minus, Plus, X } from 'lucide-react'

type SettingsModalProps = {
  open: boolean
  onClose: () => void
  autoStartBreaks: boolean
  autoStartFocus: boolean
  focusDuration: number
  breakDuration: number
  onToggleAutoStartBreaks: () => void
  onToggleAutoStartFocus: () => void
  onFocusDurationChange: (minutes: number) => void
  onBreakDurationChange: (minutes: number) => void
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

export default function SettingsModal({
  open,
  onClose,
  autoStartBreaks,
  autoStartFocus,
  focusDuration,
  breakDuration,
  onToggleAutoStartBreaks,
  onToggleAutoStartFocus,
  onFocusDurationChange,
  onBreakDurationChange,
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