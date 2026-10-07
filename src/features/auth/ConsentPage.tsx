import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { NOTICE_VERSION } from '../../lib/flags'
import { useAuth } from '../../app/auth'
import { Button } from '../../ui/Button'
import { Alert } from '../../ui/Feedback'
import { AuthCard } from './AuthCard'
import { ConsentFields } from './ConsentFields'
import { consentSchema, type ConsentValues } from './schemas'

/** Shown to signed-in users who have not consented yet, e.g. after Google sign-in. */
export default function ConsentPage() {
  const { t } = useTranslation()
  const { hasConsented, refreshProfile } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ConsentValues>({ resolver: zodResolver(consentSchema), defaultValues: { emailConsent: false } })

  if (hasConsented) return <Navigate to="/" replace />

  const onSubmit = handleSubmit(async (v) => {
    setError(null)
    const { error: err } = await supabase.rpc('record_consent', {
      p_processing: v.processing,
      p_handling: v.handling,
      p_email: v.emailConsent,
      p_notice_version: NOTICE_VERSION,
    })
    if (err) setError(t('errors.generic'))
    else await refreshProfile()
  })

  return (
    <AuthCard title={t('consent.title')} intro={t('consent.intro')}>
      {error && <Alert tone="error">{error}</Alert>}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <ConsentFields register={register} errors={errors} />
        <Button type="submit" busy={isSubmitting} busyLabel={t('common.saving')}>
          {t('consent.accept')}
        </Button>
      </form>
    </AuthCard>
  )
}
