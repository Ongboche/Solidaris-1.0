import { useTranslation } from 'react-i18next'
import { Check, Pause } from 'lucide-react'
import { GATES, type Gate } from '../domain/types'

interface JourneyBarProps {
  current: Gate | null
  passed: Gate[]
  onHold?: boolean
}

/** Stepper of G0–G8 (brief §9.1). State is given in text, not only colour or icon. */
export function JourneyBar({ current, passed, onHold = false }: JourneyBarProps) {
  const { t } = useTranslation()
  return (
    <nav aria-label={t('journey.label')} className="overflow-x-auto">
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
          return (
            <li
              key={gate}
              aria-current={isCurrent ? 'step' : undefined}
              className={`flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${
                isCurrent ? 'border-primary bg-success-bg font-semibold' : isPassed ? 'border-primary' : 'border-line text-muted'
              }`}
            >
              {isPassed && <Check aria-hidden className="h-4 w-4" />}
              {isCurrent && onHold && <Pause aria-hidden className="h-4 w-4" />}
              <span>{gate}</span>
              <span className="sr-only">: {state}</span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
