import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAcceptInvitation } from '../../lib/api'
import { useAuth } from '../../app/auth'
import { Button } from '../../ui/Button'
import { Alert, Spinner } from '../../ui/Feedback'
import { AuthCard } from '../auth/AuthCard'

interface Preview {
  subject_name: string
  subject_type: string
  role: string
  invited_by_name: string | null
  email: string
  expired: boolean
  accepted: boolean
}

export default function InvitePage() {
  const { t } = useTranslation()
  const { token } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const accept = useAcceptInvitation()
  const preview = useQuery({
    queryKey: ['invite-preview', token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('invitation_preview', { p_token: token })
      if (error) throw new Error(error.message)
      return ((data as Preview[]) ?? [])[0] ?? null
    },
  })

  if (preview.isLoading) return <Spinner label={t('common.loading')} />
  const p = preview.data
  if (!p) return <AuthCard title={t('invite.invalidTitle')}><p>{t('invite.invalidBody')}</p></AuthCard>

  const wrongAccount = profile?.email && profile.email.toLowerCase() !== p.email
  return (
    <AuthCard title={t('invite.title')}>
      <p>
        {t('invite.body', {
          name: p.invited_by_name ?? t('invite.someone'),
          role: t(`role.${p.role}`),
          subject: p.subject_name,
        })}
      </p>
      <p className="text-sm text-muted">{t(`roleHelp.${p.role}`)}</p>
      {p.accepted && <Alert>{t('invite.alreadyUsed')}</Alert>}
      {p.expired && !p.accepted && <Alert tone="error">{t('invite.expired')}</Alert>}
      {wrongAccount && <Alert tone="error">{t('invite.wrongAccount', { email: p.email })}</Alert>}
      {accept.error && <Alert tone="error">{accept.error.message}</Alert>}
      {!p.accepted && !p.expired && !wrongAccount && (
        <Button busy={accept.isPending} onClick={() => accept.mutate({ token }, { onSuccess: (id) => navigate(`/projects/${id}`) })}>
          {t('invite.accept')}
        </Button>
      )}
    </AuthCard>
  )
}
