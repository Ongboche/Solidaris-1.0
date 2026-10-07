import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase, appUrl } from '../../lib/supabase'
import { authErrorMessage } from '../../lib/authErrors'
import { NOTICE_VERSION } from '../../lib/flags'
import { useAuth } from '../../app/auth'
import { Button } from '../../ui/Button'
import { TextField } from '../../ui/Field'
import { Alert } from '../../ui/Feedback'
import { AuthCard } from './AuthCard'
import { ConsentFields } from './ConsentFields'
import { signUpSchema, type SignUpValues } from './schemas'

export default function SignUpPage() {
  const { t } = useTranslation()
  const { session } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({ resolver: zodResolver(signUpSchema), defaultValues: { emailConsent: false } })

  if (session) return <Navigate to="/" replace />

  const msg = (key?: string) => (key ? t(key) : undefined)

  const onSubmit = handleSubmit(async (v) => {
    setError(null)
    // No role is sent: the database makes every new account a plain member (brief §7).
    const { data, error: err } = await supabase.auth.signUp({
      email: v.email,
      password: v.password,
      options: {
        emailRedirectTo: appUrl(),
        data: {
          full_name: v.fullName,
          institution_name: v.institution,
          position: v.position,
          country: v.country,
          discipline: v.discipline,
          consent_processing: v.processing,
          consent_handling: v.handling,
          consent_email: v.emailConsent,
          consent_notice_version: NOTICE_VERSION,
        },
      },
    })
    if (err) {
      setError(authErrorMessage(err, t))
      return
    }
    if (!data.session) navigate(`/check-email?email=${encodeURIComponent(v.email)}`)
  })

  return (
    <AuthCard title={t('auth.signUpTitle')} intro={t('auth.signUpIntro')}>
      {error && <Alert tone="error">{error}</Alert>}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField label={t('auth.fullName')} autoComplete="name" error={msg(errors.fullName?.message)} {...register('fullName')} />
        <TextField label={t('auth.email')} type="email" autoComplete="email" error={msg(errors.email?.message)} {...register('email')} />
        <TextField label={t('auth.institution')} autoComplete="organization" error={msg(errors.institution?.message)} {...register('institution')} />
        <TextField label={t('auth.position')} autoComplete="organization-title" error={msg(errors.position?.message)} {...register('position')} />
        <TextField label={t('auth.country')} autoComplete="country-name" error={msg(errors.country?.message)} {...register('country')} />
        <TextField label={t('auth.discipline')} error={msg(errors.discipline?.message)} {...register('discipline')} />
        <TextField
          label={t('auth.password')}
          hint={t('auth.passwordHint')}
          type="password"
          autoComplete="new-password"
          error={msg(errors.password?.message)}
          {...register('password')}
        />
        <TextField
          label={t('auth.confirmPassword')}
          type="password"
          autoComplete="new-password"
          error={msg(errors.confirmPassword?.message)}
          {...register('confirmPassword')}
        />
        <ConsentFields register={register} errors={errors} />
        <Button type="submit" busy={isSubmitting} busyLabel={t('auth.creatingAccount')}>
          {t('auth.createAccount')}
        </Button>
      </form>
      <p>
        {t('auth.haveAccount')}{' '}
        <Link className="text-primary underline" to="/sign-in">
          {t('auth.signIn')}
        </Link>
      </p>
    </AuthCard>
  )
}
