import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
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

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  hint?: string
  error?: string
  optional?: boolean
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hint, error, optional, id, rows = 4, ...rest },
  ref,
) {
  const { t } = useTranslation()
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = hint ? `${inputId}-hint` : undefined
  const errorId = error ? `${inputId}-error` : undefined
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="font-medium">
        {label}
        {optional && <span className="ml-1 text-sm font-normal text-muted">({t('common.optional')})</span>}
      </label>
      {hint && (
        <span id={hintId} className="text-sm text-muted">
          {hint}
        </span>
      )}
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        className={`rounded border bg-panel px-3 py-2 text-base read-only:bg-canvas ${error ? 'border-alert' : 'border-line'}`}
        {...rest}
      />
      {error && <FieldError id={errorId!}>{error}</FieldError>}
    </div>
  )
})

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  options: { value: string; label: string }[]
  placeholder?: string
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, options, placeholder, id, ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="font-medium">
        {label}
      </label>
      <select ref={ref} id={inputId} className="min-h-11 rounded border border-line bg-panel px-3 py-2 text-base" {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
})

interface RadioGroupProps {
  legend: string
  name: string
  value: string | null
  options: { value: string; label: string; help?: string }[]
  onChange: (value: string) => void
  disabled?: boolean
  columns?: 1 | 2 | 3 | 4
}

/** Radio choices rendered as cards; keyboard and screen-reader friendly. */
export function RadioGroup({ legend, name, value, options, onChange, disabled, columns = 1 }: RadioGroupProps) {
  const cols = { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' }[columns]
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-1 font-medium">{legend}</legend>
      <div className={`grid gap-2 ${cols}`}>
        {options.map((o) => (
          <label
            key={o.value}
            className={`flex cursor-pointer gap-3 rounded border p-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-[var(--color-focus)] ${
              value === o.value ? 'border-primary bg-success-bg' : 'border-line bg-panel'
            } ${disabled ? 'cursor-not-allowed opacity-80' : ''}`}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-primary)]"
            />
            <span className="flex flex-col">
              <span className="font-medium">{o.label}</span>
              {o.help && <span className="text-sm text-muted">{o.help}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
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
