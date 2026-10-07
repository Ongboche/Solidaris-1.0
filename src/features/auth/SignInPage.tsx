import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase, appUrl } from '../../lib/supabase'
import { authErrorMessage } from '../../lib/authErrors'
import { flags, IDLE_TIMEOUT_MINUTES } from '../../lib/flags'
import { useAuth } from '../../app/auth'
import { Button } from '../../ui/Button'
import { TextField } from '../../ui/Field'
import { Alert } from '../../ui/Feedback'
import { AuthCard } from './AuthCard'
import { signInSchema, type SignInValues } from './schemas'

export default function SignInPage() {
  const { t } = useTranslation()
  const { session, signedOutForIdle } = useAuth()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({ resolver: zodResolver(signInSchema) })

  const from = (location.state as { from?: string } | null)?.from ?? '/'
  if (session) return <Navigate to={from} replace />

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword(values)
    setError(authErrorMessage(err, t))
  })

  return (
    <AuthCard title={t('auth.signInTitle')} intro={t('auth.signInIntro')}>
      {signedOutForIdle && <Alert>{t('auth.sessionExpired', { minutes: IDLE_TIMEOUT_MINUTES })}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField
          label={t('auth.email')}
          type="email"
          autoComplete="email"
          error={errors.email && t(String(errors.email.message))}
          {...register('email')}
        />
        <TextField
          label={t('auth.password')}
          type="password"
          autoComplete="current-password"
          error={errors.password && t(String(errors.password.message))}
          {...register('password')}
        />
        <Button type="submit" busy={isSubmitting} busyLabel={t('auth.signingIn')}>
          {t('auth.signIn')}
        </Button>
      </form>
      {flags.googleSignIn && (
        <>
          <p className="text-center text-muted">{t('auth.orGoogle')}</p>
          <Button
            variant="secondary"
            onClick={() =>
              void supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: appUrl() } })
            }
          >
            {t('auth.continueWithGoogle')}
          </Button>
        </>
      )}
      <div className="flex flex-col gap-2">
        <Link className="text-primary underline" to="/forgot-password">
          {t('auth.forgotPassword')}
        </Link>
        <p>
          {t('auth.noAccount')}{' '}
          <Link className="text-primary underline" to="/sign-up">
            {t('auth.createAccount')}
          </Link>
        </p>
      </div>
    </AuthCard>
  )
}
