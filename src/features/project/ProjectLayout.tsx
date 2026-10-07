import { NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../app/auth'
import { useProject, type Bundle } from '../../lib/api'
import { gateForStatus } from '../../domain/workflow'
import type { Gate, ProjectRole } from '../../domain/types'
import { Alert, Chip, Spinner } from '../../ui/Feedback'
import { JourneyBar } from '../../ui/JourneyBar'
import { gateProgress } from './snapshot'
import { flags } from '../../lib/flags'
import { StageBanner } from './StageBanner'

export interface ProjectContextValue {
  project: Bundle
  userId: string
  myRoles: ProjectRole[]
  isPi: boolean
  currentGate: Gate | null
  passed: Gate[]
  onHold: boolean
}

export function useProjectContext() {
  return useOutletContext<ProjectContextValue>()
}

export default function ProjectLayout() {
  const { t } = useTranslation()
  const { projectId } = useParams()
  const { session } = useAuth()
  const query = useProject(projectId!)

  if (query.isLoading) return <Spinner label={t('common.loading')} />
  if (query.error || !query.data)
    return (
      <Alert tone="error" title={t('project.notFoundTitle')}>
        {t('project.notFoundBody')}
      </Alert>
    )

  const project = query.data
  const userId = session!.user.id
  const myRoles = project.project_members.filter((m) => m.user_id === userId).map((m) => m.role)
  const currentGate = gateForStatus(project.status)
  const { passed, onHold } = gateProgress(project, currentGate)
  const ctx: ProjectContextValue = { project, userId, myRoles, isPi: myRoles.includes('pi'), currentGate, passed, onHold }

  const tabs = [
    { to: '.', label: t('project.tabs.overview'), end: true },
    { to: 'team', label: t('project.tabs.team') },
    { to: 'scoping', label: t('project.tabs.scoping') },
    { to: 'context', label: t('project.tabs.context') },
    // PLAN D-52: assessment comes before the evidence review.
    { to: 'assessment', label: t('project.tabs.assessment') },
    { to: 'evidence', label: t('project.tabs.evidence') },
    ...(passed.includes('G3')
      ? [
          { to: 'integrity', label: t('project.tabs.integrity') },
          { to: 'deliberation', label: t('project.tabs.deliberation') },
        ]
      : []),
    ...(project.profile_approved_at
      ? [
          { to: 'profile', label: t('project.tabs.profile') },
          { to: 'report', label: t('project.tabs.report') },
        ]
      : []),
    // T7, T9, T10 are proposals pending the team's review (brief §16.4): behind flags.
    ...(flags.uptake && passed.includes('G6') ? [{ to: 'uptake', label: t('project.tabs.uptake') }] : []),
    ...(flags.signals && project.status !== 'draft' ? [{ to: 'signals', label: t('project.tabs.signals') }] : []),
    ...(flags.learning && passed.includes('G7') ? [{ to: 'learning', label: t('project.tabs.learning') }] : []),
    ...(currentGate ? [{ to: `gates/${currentGate}`, label: t('project.tabs.gate', { gate: currentGate }) }] : []),
  ]

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          {t(`subjectType.${project.subjects.type}`)} · {t(`assessmentType.${project.assessment_type}`)}
          {project.subjects.country ? ` · ${project.subjects.country}` : ''}
        </p>
        <h1 className="text-3xl font-semibold">{project.subjects.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Chip>{t(`status.${project.status}`)}</Chip>
          {onHold && <Chip tone="alert">{t('journey.onHold')}</Chip>}
          {project.single_assessor && <Chip>{t('team.exploratory')}</Chip>}
          <span className="text-sm text-muted">
            {t('home.yourRoles', { roles: myRoles.map((r) => t(`role.${r}`)).join(', ') || t('project.noRole') })}
          </span>
        </div>
        <JourneyBar current={currentGate} passed={passed} onHold={onHold} linkTo={(g) => `gates/${g}`} />
        <StageBanner ctx={ctx} />
        {project.status === 'closed' && (
          <Alert title={t('project.closedTitle')}>{project.closed_reason}</Alert>
        )}
      </header>
      <nav aria-label={t('project.sections')} className="border-b border-line">
        <ul className="-mb-px flex flex-wrap gap-1">
          {tabs.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `inline-flex min-h-11 items-center border-b-2 px-3 ${isActive ? 'border-primary font-semibold' : 'border-transparent text-muted hover:text-ink'}`
                }
              >
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet context={ctx} />
    </div>
  )
}
