import type { InputHTMLAttributes } from 'react'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string
}

export default function Input({
  label,
  error,
  id,
  className = '',
  ...props
}: InputProps) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-text-secondary">
        {label}
      </label>
      <input
        id={inputId}
        className={[
          'w-full rounded-lg border bg-surface-raised px-3.5 py-2.5 text-sm text-text',
          'border-border placeholder:text-text-muted',
          'transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent',
          error ? 'border-danger' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      />
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}
