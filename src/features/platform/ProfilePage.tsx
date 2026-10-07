import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../app/auth'
import { Button } from '../../ui/Button'
import { TextField } from '../../ui/Field'
import { Alert, Card } from '../../ui/Feedback'
import { profileSchema, type ProfileValues } from '../auth/schemas'

export default function ProfilePage() {
  const { t } = useTranslation()
  const { profile, refreshProfile } = useAuth()
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: {
      fullName: profile?.full_name ?? '',
      institution: profile?.institution_name ?? '',
      position: profile?.position ?? '',
      country: profile?.country ?? '',
      discipline: profile?.discipline ?? '',
      orcid: profile?.orcid ?? '',
    },
  })

  const msg = (key?: string) => (key ? t(key) : undefined)

  const onSubmit = handleSubmit(async (v) => {
    setStatus('idle')
    // Only these columns are writable by users; platform_role is not (brief §7).
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: v.fullName,
        institution_name: v.institution,
        position: v.position,
        country: v.country,
        discipline: v.discipline,
        orcid: v.orcid || null,
      })
      .eq('id', profile!.id)
    setStatus(error ? 'error' : 'saved')
    if (!error) await refreshProfile()
  })

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold">{t('profile.title')}</h1>
        <p className="text-muted">{t('profile.intro')}</p>
      </div>
      {status === 'saved' && <Alert tone="success">{t('profile.updated')}</Alert>}
      {status === 'error' && <Alert tone="error">{t('errors.generic')}</Alert>}
      <Card>
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
          <p>
            <span className="font-medium">{t('profile.email')}:</span> {profile?.email}
          </p>
          <TextField label={t('auth.fullName')} error={msg(errors.fullName?.message)} {...register('fullName')} />
          <TextField label={t('auth.institution')} error={msg(errors.institution?.message)} {...register('institution')} />
          <TextField label={t('auth.position')} error={msg(errors.position?.message)} {...register('position')} />
          <TextField label={t('auth.country')} error={msg(errors.country?.message)} {...register('country')} />
          <TextField label={t('auth.discipline')} error={msg(errors.discipline?.message)} {...register('discipline')} />
          <TextField label="ORCID" optional placeholder="0000-0000-0000-0000" error={msg(errors.orcid?.message)} {...register('orcid')} />
          <p>
            <span className="font-medium">{t('profile.emailNotifications')}:</span>{' '}
            {profile?.consent_email_at ? t('profile.emailOn') : t('profile.emailOff')}
          </p>
          <div>
            <Button type="submit" busy={isSubmitting} busyLabel={t('common.saving')}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
