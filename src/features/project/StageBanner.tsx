import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight } from 'lucide-react'
import { nextActions } from '../../domain/nextActions'
import { gateOwner, needsReviewerVerification } from '../../domain/workflow'
import { useProjectRpc } from '../../lib/api'
import { Button } from '../../ui/Button'
import { Alert } from '../../ui/Feedback'
import { toSnapshot } from './snapshot'
import type { ProjectContextValue } from './ProjectLayout'

const ACTION_PATH: Record<string, (gate?: string) => string> = {
  invite_team: () => 'team',
  declare_coi: () => 'team',
  record_decision: () => 'scoping',
  complete_context: () => 'context',
  add_evidence: () => 'evidence',
  complete_assessment: () => 'assessment',
  join_deliberation: () => 'deliberation',
  review_gate: (g) => `gates/${g}`,
  verify_gate: (g) => `gates/${g}`,
  action_due: () => 'uptake',
}

/**
 * "Where am I, what happens next, and who is it waiting for?" on every project tab
 * (brief §9: users always know where they are, what to do next, and why something is blocked).
 * Filling in forms never moves a project: only gate decisions do, so this says so.
 */
export function StageBanner({ ctx }: { ctx: ProjectContextValue }) {
  const { t } = useTranslation()
  const { project, userId, isPi, currentGate } = ctx
  const start = useProjectRpc<{ p_project: string }>(project.id, 'start_scoping')

  if (project.status === 'closed') return null

  if (project.status === 'draft') {
    return (
      <Alert title={t('stage.draftTitle')}>
        <p className="mb-2">{t('stage.draftBody')}</p>
        {start.error && <p className="mb-2 font-medium text-alert">{start.error.message}</p>}
        {isPi ? (
          <Button busy={start.isPending} onClick={() => start.mutate({ p_project: project.id })}>
            {t('overview.startScoping')}
          </Button>
        ) : (
          <p className="font-medium">{t('stage.waitingForPi')}</p>
        )}
      </Alert>
    )
  }

  const mine = nextActions([toSnapshot(project, userId)], []).filter((a) => a.kind !== 'start_scoping')
  const first = mine[0]
  const gate = currentGate!
  const owner = t(`role.${gateOwner(gate)}`)

  return (
    <Alert title={t('stage.currentTitle', { stage: t(`status.${project.status}`) })}>
      <p className="mb-2">{t('stage.howToMove', { gate, owner })}{needsReviewerVerification(gate) ? ` ${t('stage.needsReviewer')}` : ''}</p>
      {first ? (
        <Link to={ACTION_PATH[first.kind]!('gate' in first ? first.gate : undefined)} className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary underline">
          {t(`actions.${first.kind}`, { name: project.subjects.name, gate: 'gate' in first ? first.gate : '', count: 'count' in first ? first.count : 0 })}
          <ArrowRight aria-hidden className="h-4 w-4" />
        </Link>
      ) : (
        <p className="font-medium">{t('stage.waitingFor', { owner, gate })}</p>
      )}
    </Alert>
  )
}
