import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, UserMinus } from 'lucide-react'
import type { ProjectRole } from '../../domain/types'
import {
  useInvite,
  useProjectInvitations,
  useProjectRpc,
  useSetSingleAssessor,
  useTeam,
  useUpdateMember,
} from '../../lib/api'
import { appUrl } from '../../lib/supabase'
import { Button } from '../../ui/Button'
import { Checkbox, SelectField, TextArea, TextField } from '../../ui/Field'
import { Alert, Card, Chip, EmptyState, Spinner } from '../../ui/Feedback'
import { Term } from '../../ui/Term'
import { useProjectContext } from './ProjectLayout'

const INVITABLE: ProjectRole[] = ['assessor', 'reviewer', 'observer', 'external_expert', 'kt_lead', 'community_participant']

export default function TeamPage() {
  const { t } = useTranslation()
  const { project, userId, isPi, myRoles } = useProjectContext()
  const team = useTeam(project.id)
  const invitations = useProjectInvitations(project.id, isPi)
  const invite = useInvite(project.id)
  const revoke = useProjectRpc<{ p_invitation: string }>(project.id, 'revoke_invitation')
  const remove = useProjectRpc<{ p_membership: string }>(project.id, 'remove_member')
  const declare = useUpdateMember(project.id)
  const single = useSetSingleAssessor(project.id)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<ProjectRole>('assessor')
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [coi, setCoi] = useState('')
  const open = project.status !== 'closed'

  const myAssessorRow = project.project_members.find((m) => m.user_id === userId && m.role === 'assessor')
  const membershipId = (uid: string, r: ProjectRole) =>
    project.project_members.find((m) => m.user_id === uid && m.role === r)?.id
  const coiOf = (uid: string) => project.project_members.find((m) => m.user_id === uid && m.role === 'assessor')

  const sendInvite = (e: React.FormEvent) => {
    e.preventDefault()
    setLink(null)
    setCopied(false)
    invite.mutate(
      { email, role },
      {
        onSuccess: (token) => {
          setLink(appUrl(`invite/${token}`))
          setEmail('')
        },
      },
    )
  }

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {myAssessorRow && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">
            <Term term="coi">{t('team.coiTitle')}</Term>
          </h2>
          {myAssessorRow.coi_declared_at ? (
            <Alert tone="success">
              {t('team.coiDeclaredOn', { date: new Date(myAssessorRow.coi_declared_at).toLocaleDateString() })}
              {myAssessorRow.coi_statement ? ` — ${myAssessorRow.coi_statement}` : ''}
            </Alert>
          ) : (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                declare.mutate({ membershipId: myAssessorRow.id, coi_statement: coi.trim() || t('team.coiNone') })
              }}
            >
              <TextArea label={t('team.coiStatement')} hint={t('team.coiHint')} rows={3} value={coi} onChange={(e) => setCoi(e.target.value)} />
              {declare.error && <Alert tone="error">{declare.error.message}</Alert>}
              <div>
                <Button type="submit" busy={declare.isPending}>
                  {t('team.coiDeclare')}
                </Button>
              </div>
            </form>
          )}
        </Card>
      )}

      <section aria-labelledby="team-title" className="flex flex-col gap-3">
        <h2 id="team-title" className="text-xl font-semibold">
          {t('team.title')}
        </h2>
        {remove.error && <Alert tone="error">{remove.error.message}</Alert>}
        {team.isLoading ? (
          <Spinner label={t('common.loading')} />
        ) : (
          <ul className="divide-y divide-line rounded border border-line bg-panel">
            {(team.data ?? []).map((m) => {
              const id = membershipId(m.user_id, m.role)
              const coiRow = m.role === 'assessor' ? coiOf(m.user_id) : undefined
              return (
                <li key={`${m.user_id}-${m.role}`} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {m.full_name ?? t('team.unnamed')}
                      {m.user_id === userId ? ` (${t('team.you')})` : ''}
                    </span>
                    <span className="text-sm text-muted">{m.institution}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip>{t(`role.${m.role}`)}</Chip>
                    {coiRow && <Chip tone={coiRow.coi_declared_at ? 'neutral' : 'alert'}>{coiRow.coi_declared_at ? t('team.coiDone') : t('team.coiMissing')}</Chip>}
                    {isPi && open && m.role !== 'pi' && id && (
                      <Button variant="ghost" onClick={() => remove.mutate({ p_membership: id })} aria-label={t('team.removeNamed', { name: m.full_name ?? '', role: t(`role.${m.role}`) })}>
                        <UserMinus aria-hidden className="h-4 w-4" /> {t('team.remove')}
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {isPi && open && (
        <Card className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">{t('team.inviteTitle')}</h2>
          <p className="text-muted">{t('team.inviteIntro')}</p>
          <form noValidate onSubmit={sendInvite} className="grid gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
            <TextField label={t('auth.email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <SelectField
              label={t('team.role')}
              value={role}
              onChange={(e) => setRole(e.target.value as ProjectRole)}
              options={INVITABLE.map((r) => ({ value: r, label: t(`role.${r}`) }))}
            />
            <Button type="submit" busy={invite.isPending} disabled={!email.trim()}>
              {t('team.invite')}
            </Button>
          </form>
          <p className="text-sm text-muted">{t(`roleHelp.${role}`)}</p>
          {invite.error && <Alert tone="error">{invite.error.message}</Alert>}
          {link && (
            <Alert tone="success" title={t('team.linkTitle')}>
              <p className="mb-2">{t('team.linkHelp')}</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input readOnly value={link} aria-label={t('team.linkTitle')} className="min-h-11 flex-1 rounded border border-line bg-panel px-3 text-ink" onFocus={(e) => e.target.select()} />
                <Button variant="secondary" onClick={() => void copy()}>
                  <Copy aria-hidden className="h-4 w-4" /> {copied ? t('team.copied') : t('team.copy')}
                </Button>
              </div>
            </Alert>
          )}
          <h3 className="font-semibold">{t('team.pendingTitle')}</h3>
          {revoke.error && <Alert tone="error">{revoke.error.message}</Alert>}
          {(invitations.data ?? []).filter((i) => !i.accepted_at && new Date(i.expires_at) > new Date()).length === 0 ? (
            <EmptyState title={t('team.noPending')} />
          ) : (
            <ul className="divide-y divide-line rounded border border-line">
              {(invitations.data ?? [])
                .filter((i) => !i.accepted_at && new Date(i.expires_at) > new Date())
                .map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <span>
                      {i.email} · {t(`role.${i.role}`)}
                    </span>
                    <Button variant="ghost" onClick={() => revoke.mutate({ p_invitation: i.id })}>
                      {t('team.withdraw')}
                    </Button>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      )}

      {isPi && open && (
        <Card className="flex flex-col gap-2">
          <Checkbox
            label={t('team.singleAssessorLabel')}
            checked={project.single_assessor}
            disabled={single.isPending}
            onChange={(e) => single.mutate(e.target.checked)}
          />
          <p className="text-sm text-muted">
            <Term term="singleAssessor">{t('team.exploratory')}</Term> — {t('team.singleAssessorHelp')}
          </p>
          {single.error && <Alert tone="error">{single.error.message}</Alert>}
        </Card>
      )}
      {!isPi && myRoles.length === 0 && <Alert>{t('project.noRole')}</Alert>}
    </div>
  )
}
