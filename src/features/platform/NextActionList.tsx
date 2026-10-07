import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { NextAction } from '../../domain/nextActions'
import { useAcceptInvitation } from '../../lib/api'
import { Button } from '../../ui/Button'
import { Alert, EmptyState } from '../../ui/Feedback'

function target(a: NextAction): string {
  switch (a.kind) {
    case 'invite_team':
    case 'declare_coi':
      return `/projects/${a.projectId}/team`
    case 'start_scoping':
      return `/projects/${a.projectId}`
    case 'record_decision':
      return `/projects/${a.projectId}/scoping`
    case 'complete_context':
      return `/projects/${a.projectId}/context`
    case 'review_gate':
    case 'verify_gate':
      return `/projects/${a.projectId}/gates/${a.gate}`
    case 'accept_invitation':
      return `/projects/${a.projectId}`
    case 'add_evidence':
      return `/projects/${a.projectId}/evidence`
    case 'complete_assessment':
      return `/projects/${a.projectId}/assessment`
    case 'join_deliberation':
      return `/projects/${a.projectId}/deliberation`
  }
}

/** One card per pending action, each with one primary button (brief §9.2). */
export function NextActionList({ actions, emptyBody }: { actions: NextAction[]; emptyBody: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const accept = useAcceptInvitation()

  if (actions.length === 0) return <EmptyState title={t('home.nothingYet')}>{emptyBody}</EmptyState>

  return (
    <div className="flex flex-col gap-3">
      {accept.error && <Alert tone="error">{accept.error.message}</Alert>}
      <ul className="flex flex-col gap-3">
        {actions.map((a) => {
          const vars = {
            name: a.subjectName,
            gate: 'gate' in a ? a.gate : '',
            role: 'role' in a ? t(`role.${a.role}`) : '',
          }
          const key =
            a.kind === 'accept_invitation' ? a.invitationId : `${a.kind}-${a.projectId}-${'gate' in a ? a.gate : ''}`
          return (
            <li key={key} className="flex flex-col gap-3 rounded border border-line bg-panel p-4 sm:flex-row sm:items-center sm:justify-between">
              <p>{t(`actions.${a.kind}`, vars)}</p>
              {a.kind === 'accept_invitation' ? (
                <Button
                  busy={accept.isPending && accept.variables?.invitationId === a.invitationId}
                  onClick={() =>
                    accept.mutate({ invitationId: a.invitationId }, { onSuccess: (id) => navigate(`/projects/${id}`) })
                  }
                >
                  {t('actions.button.accept_invitation')}
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => navigate(target(a))}>
                  {t(`actions.button.${a.kind}`)}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
