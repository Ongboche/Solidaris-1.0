import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Checkbox } from '../../ui/Field'
import { NOTICE_VERSION } from '../../lib/flags'

type ConsentForm = { processing: boolean; handling: boolean; emailConsent: boolean }

/** Privacy notice and consents (PLAN D-8, D-9): two required, email optional. */
export function ConsentFields<T extends ConsentForm>({
  register,
  errors,
}: {
  register: UseFormRegister<T>
  errors: FieldErrors<T>
}) {
  const { t } = useTranslation()
  const paragraphs = t('consent.notice', { returnObjects: true }) as string[]
  const reg = register as unknown as UseFormRegister<ConsentForm>
  const errs = errors as FieldErrors<ConsentForm>
  return (
    <fieldset className="flex flex-col gap-4 rounded border border-line bg-canvas p-4">
      <legend className="px-1 font-semibold">{t('consent.title')}</legend>
      <div className="flex max-h-56 flex-col gap-2 overflow-y-auto text-sm" tabIndex={0}>
        {paragraphs.map((p) => (
          <p key={p.slice(0, 24)}>{p}</p>
        ))}
        <p className="text-muted">
          {t('consent.noticeVersionLabel', { version: NOTICE_VERSION })} · {t('consent.draftNote')}
        </p>
      </div>
      <Checkbox
        label={t('consent.processing')}
        error={errs.processing && t(String(errs.processing.message))}
        {...reg('processing')}
      />
      <Checkbox
        label={t('consent.handling')}
        error={errs.handling && t(String(errs.handling.message))}
        {...reg('handling')}
      />
      <Checkbox label={`${t('consent.email')} (${t('common.optional')})`} {...reg('emailConsent')} />
    </fieldset>
  )
}
