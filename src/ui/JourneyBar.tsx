import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Check, Pause } from 'lucide-react'
import { GATES, type Gate } from '../domain/types'

interface JourneyBarProps {
  current: Gate | null
  passed: Gate[]
  onHold?: boolean
  /** When given, passed and current gates link to their record (brief §9.1). */
  linkTo?: (gate: Gate) => string
}

/** Stepper of G0–G8 (brief §9.1). State is given in text, not only colour or icon. */
export function JourneyBar({ current, passed, onHold = false, linkTo }: JourneyBarProps) {
  const { t } = useTranslation()
  return (
    // Focusable so keyboard users can scroll it on narrow screens (WCAG 2.1.1).
    <nav aria-label={t('journey.label')} tabIndex={0} className="overflow-x-auto">
      <ol className="flex min-w-max gap-2">
        {GATES.map((gate) => {
          const isPassed = passed.includes(gate)
          const isCurrent = gate === current
          const state = isPassed
            ? t('journey.passed')
            : isCurrent
              ? onHold
                ? t('journey.onHold')
                : t('journey.current')
              : t('journey.upcoming')
          const body = (
            <>
              {isPassed && <Check aria-hidden className="h-4 w-4" />}
              {isCurrent && onHold && <Pause aria-hidden className="h-4 w-4" />}
              <span>{gate}</span>
              <span className="sr-only">: {state}</span>
            </>
          )
          const style = `flex min-h-9 items-center gap-1 rounded-full border px-3 py-1 text-sm ${
            isCurrent ? 'border-primary bg-success-bg font-semibold' : isPassed ? 'border-primary' : 'border-line text-muted'
          }`
          return (
            <li key={gate} aria-current={isCurrent ? 'step' : undefined}>
              {linkTo && (isPassed || isCurrent) ? (
                <Link to={linkTo(gate)} className={`${style} hover:underline`}>
                  {body}
                </Link>
              ) : (
                <span className={style}>{body}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
