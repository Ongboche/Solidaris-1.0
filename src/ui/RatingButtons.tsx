import { useTranslation } from 'react-i18next'
import type { Rating } from '../domain/types'

export interface RatingLevel {
  value: Exclude<Rating, null>
  label: string
  descriptor?: string | null
}

interface RatingButtonsProps {
  domainName: string
  levels: RatingLevel[]
  value: Rating
  onChange: (value: Rating) => void
  disabled?: boolean
}

/**
 * Five labelled choices, no slider (brief §9.7). Implemented as a radio group so it
 * works with keyboard and screen readers. Unrated is shown as "Not rated" — never 0.
 */
export function RatingButtons({ domainName, levels, value, onChange, disabled }: RatingButtonsProps) {
  const { t } = useTranslation()
  const name = `rating-${domainName.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-1 font-medium">{t('rating.groupLabel', { domain: domainName })}</legend>
      <div className="grid gap-2 sm:grid-cols-5">
        {levels.map((level) => {
          const checked = value === level.value
          return (
            <label
              key={level.value}
              className={`flex cursor-pointer flex-col gap-1 rounded border p-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-[var(--color-focus)] ${
                checked ? 'border-primary bg-success-bg' : 'border-line bg-panel'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={level.value}
                checked={checked}
                onChange={() => onChange(level.value)}
                className="sr-only"
              />
              <span className="text-xl font-semibold" aria-hidden>
                {level.value}
              </span>
              <span className="font-medium">
                <span className="sr-only">{level.value} – </span>
                {level.label}
              </span>
              {level.descriptor && <span className="text-sm text-muted">{level.descriptor}</span>}
            </label>
          )
        })}
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span aria-live="polite">{value === null ? t('common.notRated') : null}</span>
        {value !== null && (
          <button type="button" className="text-primary underline" onClick={() => onChange(null)}>
            {t('rating.clear')}
          </button>
        )}
      </div>
    </fieldset>
  )
}
