import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { z } from 'zod'
import { supabase, appUrl } from '../../lib/supabase'
import { authErrorMessage } from '../../lib/authErrors'
import { Button } from '../../ui/Button'
import { TextField } from '../../ui/Field'
import { Alert } from '../../ui/Feedback'
import { AuthCard } from './AuthCard'
import { forgotSchema, newPasswordSchema } from './schemas'

export function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof forgotSchema>>({ resolver: zodResolver(forgotSchema) })

  const onSubmit = handleSubmit(async ({ email }) => {
    setError(null)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl('reset-password') })
    if (err) setError(authErrorMessage(err, t))
    else setSentTo(email)
  })

  return (
    <AuthCard title={t('auth.forgotTitle')} intro={t('auth.forgotIntro')}>
      {sentTo && <Alert tone="success">{t('auth.resetSent', { email: sentTo })}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField
          label={t('auth.email')}
          type="email"
          autoComplete="email"
          error={errors.email && t(String(errors.email.message))}
          {...register('email')}
        />
        <Button type="submit" busy={isSubmitting} busyLabel={t('auth.sending')}>
          {t('auth.sendResetLink')}
        </Button>
      </form>
      <Link className="text-primary underline" to="/sign-in">
        {t('auth.backToSignIn')}
      </Link>
    </AuthCard>
  )
}

/** Reached from the reset email; Supabase signs the user in with a recovery session first. */
export function ResetPasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof newPasswordSchema>>({ resolver: zodResolver(newPasswordSchema) })

  const onSubmit = handleSubmit(async ({ password }) => {
    setError(null)
    const { error: err } = await supabase.auth.updateUser({ password })
    if (err) setError(authErrorMessage(err, t))
    else navigate('/', { replace: true, state: { notice: t('auth.passwordUpdated') } })
  })

  return (
    <AuthCard title={t('auth.newPasswordTitle')}>
      {error && <Alert tone="error">{error}</Alert>}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField
          label={t('auth.password')}
          hint={t('auth.passwordHint')}
          type="password"
          autoComplete="new-password"
          error={errors.password && t(String(errors.password.message))}
          {...register('password')}
        />
        <TextField
          label={t('auth.confirmPassword')}
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword && t(String(errors.confirmPassword.message))}
          {...register('confirmPassword')}
        />
        <Button type="submit" busy={isSubmitting} busyLabel={t('common.saving')}>
          {t('auth.setNewPassword')}
        </Button>
      </form>
    </AuthCard>
  )
}

export function CheckEmailPage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  return (
    <AuthCard title={t('auth.checkEmailTitle')}>
      <p>{t('auth.checkEmailBody', { email: params.get('email') ?? '' })}</p>
      <Link className="text-primary underline" to="/sign-in">
        {t('auth.backToSignIn')}
      </Link>
    </AuthCard>
  )
}
