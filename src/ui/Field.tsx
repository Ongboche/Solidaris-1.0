import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  error?: string
  optional?: boolean
}

/** Labelled input with hint and error text wired to aria-describedby (brief §9.12). */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, optional, id, className = '', ...rest },
  ref,
) {
  const { t } = useTranslation()
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = hint ? `${inputId}-hint` : undefined
  const errorId = error ? `${inputId}-error` : undefined
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={inputId} className="font-medium">
        {label}
        {optional && <span className="ml-1 text-sm font-normal text-muted">({t('common.optional')})</span>}
      </label>
      {hint && (
        <span id={hintId} className="text-sm text-muted">
          {hint}
        </span>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        className={`min-h-11 rounded border bg-panel px-3 py-2 text-base ${error ? 'border-alert' : 'border-line'}`}
        {...rest}
      />
      {error && <FieldError id={errorId!}>{error}</FieldError>}
    </div>
  )
})

export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <span id={id} className="text-sm font-medium text-alert">
      {children}
    </span>
  )
}

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, error, id, ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  const errorId = error ? `${inputId}-error` : undefined
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-3">
        <input
          ref={ref}
          type="checkbox"
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-primary)]"
          {...rest}
        />
        <label htmlFor={inputId}>{label}</label>
      </div>
      {error && <FieldError id={errorId!}>{error}</FieldError>}
    </div>
  )
})
