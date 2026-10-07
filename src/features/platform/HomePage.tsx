import { useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { useAuth } from '../../app/auth'
import { useMyInvitations, useProjects } from '../../lib/api'
import { nextActions } from '../../domain/nextActions'
import { gateForStatus } from '../../domain/workflow'
import { Alert, Card, Chip, EmptyState, Spinner } from '../../ui/Feedback'
import { Button } from '../../ui/Button'
import { JourneyBar } from '../../ui/JourneyBar'
import { gateProgress, toSnapshot } from '../project/snapshot'
import { NextActionList } from './NextActionList'

export default function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { profile, session } = useAuth()
  const notice = (useLocation().state as { notice?: string } | null)?.notice
  const projects = useProjects()
  const invitations = useMyInvitations()
  const userId = session!.user.id

  const mine = useMemo(
    () => (projects.data ?? []).filter((p) => p.project_members.some((m) => m.user_id === userId)),
    [projects.data, userId],
  )
  const actions = useMemo(
    () =>
      nextActions(
        mine.map((p) => toSnapshot(p, userId)),
        (invitations.data ?? []).map((i) => ({
          id: i.invitation_id,
          projectId: i.project_id,
          subjectName: i.subject_name,
          role: i.role,
        })),
      ),
    [mine, invitations.data, userId],
  )

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-semibold">
          {profile?.full_name ? t('home.greeting', { name: profile.full_name }) : t('home.greetingNoName')}
        </h1>
        <Button onClick={() => navigate('/projects/new')}>
          <Plus aria-hidden className="h-4 w-4" /> {t('home.newProject')}
        </Button>
      </div>
      {notice && <Alert tone="success">{notice}</Alert>}

      <section aria-labelledby="next-title" className="flex flex-col gap-3">
        <h2 id="next-title" className="text-xl font-semibold">
          {t('home.nextTitle')}
        </h2>
        {projects.isLoading || invitations.isLoading ? (
          <Spinner label={t('common.loading')} />
        ) : projects.error ? (
          <Alert tone="error">{t('errors.generic')}</Alert>
        ) : (
          <NextActionList actions={actions} emptyBody={t('home.nothingYetBody')} />
        )}
      </section>

      <section aria-labelledby="projects-title" className="flex flex-col gap-3">
        <h2 id="projects-title" className="text-xl font-semibold">
          {t('home.projectsTitle')}
        </h2>
        {!projects.isLoading && mine.length === 0 ? (
          <EmptyState
            title={t('home.noProjects')}
            action={<Button onClick={() => navigate('/projects/new')}>{t('home.newProject')}</Button>}
          >
            {t('home.noProjectsBody')}
          </EmptyState>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {mine.map((p) => {
              const current = gateForStatus(p.status)
              const { passed, onHold } = gateProgress(p, current)
              const roles = p.project_members.filter((m) => m.user_id === userId).map((m) => t(`role.${m.role}`))
              return (
                <li key={p.id}>
                  <Card className="flex h-full flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <Link to={`/projects/${p.id}`} className="text-lg font-semibold text-primary underline-offset-4 hover:underline">
                        {p.subjects.name}
                      </Link>
                      <p className="text-sm text-muted">
                        {t(`subjectType.${p.subjects.type}`)}
                        {p.subjects.country ? ` · ${p.subjects.country}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Chip>{t(`status.${p.status}`)}</Chip>
                      {onHold && <Chip tone="alert">{t('journey.onHold')}</Chip>}
                      <span className="text-sm text-muted">{t('home.yourRoles', { roles: roles.join(', ') })}</span>
                    </div>
                    {p.status !== 'draft' && p.status !== 'closed' && (
                      <JourneyBar current={current} passed={passed} onHold={onHold} />
                    )}
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
