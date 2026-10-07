import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'

const styles: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover disabled:opacity-50',
  secondary: 'bg-panel text-ink border border-line hover:bg-canvas disabled:text-muted',
  ghost: 'text-primary underline-offset-4 hover:underline disabled:text-muted',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  busy?: boolean
  busyLabel?: string
  /** Shown under a disabled button so the user always knows why (brief §9.4). */
  disabledReason?: string
  children: ReactNode
}

export function Button({
  variant = 'primary',
  busy = false,
  busyLabel,
  disabledReason,
  disabled,
  children,
  className = '',
  id,
  ...rest
}: ButtonProps) {
  const reasonId = disabledReason && id ? `${id}-reason` : undefined
  return (
    <div className="inline-flex flex-col gap-1">
      <button
        id={id}
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded px-4 py-2 text-base font-medium transition-colors disabled:cursor-not-allowed ${styles[variant]} ${className}`}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        aria-describedby={disabled && reasonId ? reasonId : undefined}
        {...rest}
      >
        {busy ? (busyLabel ?? children) : children}
      </button>
      {disabled && disabledReason && (
        <span id={reasonId} className="text-sm text-muted">
          {disabledReason}
        </span>
      )}
    </div>
  )
}
