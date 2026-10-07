import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'

type Tone = 'info' | 'error' | 'success'

const toneStyles: Record<Tone, string> = {
  info: 'bg-panel border-line',
  error: 'bg-alert-bg border-alert text-alert',
  success: 'bg-success-bg border-primary text-primary',
}

/** Status message. Errors are announced immediately; the icon never carries meaning alone. */
export function Alert({ tone = 'info', title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  const Icon = tone === 'error' ? AlertTriangle : tone === 'success' ? CheckCircle2 : Info
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex gap-3 rounded border p-4 ${toneStyles[tone]}`}>
      <Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="flex flex-col gap-1">
        {title && <strong>{title}</strong>}
        <div>{children}</div>
      </div>
    </div>
  )
}

/** Every list gets an empty state that says what to do next (brief §9.17). */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded border border-dashed border-line bg-panel p-6">
      <h3 className="text-lg font-semibold">{title}</h3>
      {children && <div className="text-muted">{children}</div>}
      {action}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded border border-line bg-panel p-6 ${className}`}>{children}</section>
}

export function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'alert' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-0.5 text-sm ${
        tone === 'alert' ? 'border-alert text-alert' : 'border-line text-ink'
      }`}
    >
      {children}
    </span>
  )
}

export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-3 p-6 text-muted">
      <span aria-hidden className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-primary" />
      {label}
    </div>
  )
}
