import { useTranslation } from 'react-i18next'
import { nextActions } from '../../domain/nextActions'
import { useProjectRpc } from '../../lib/api'
import { Button } from '../../ui/Button'
import { Alert, Card } from '../../ui/Feedback'
import { NextActionList } from '../platform/NextActionList'
import { useProjectContext } from './ProjectLayout'
import { toSnapshot } from './snapshot'

export default function OverviewPage() {
  const { t } = useTranslation()
  const { project, userId, isPi } = useProjectContext()
  const startScoping = useProjectRpc<{ p_project: string }>(project.id, 'start_scoping')
  const actions = nextActions([toSnapshot(project, userId)], []).filter((a) => a.kind !== 'start_scoping')

  return (
    <div className="flex flex-col gap-6">
      {project.status === 'draft' && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">{t('overview.draftTitle')}</h2>
          <p>{t('overview.draftBody')}</p>
          {startScoping.error && <Alert tone="error">{startScoping.error.message}</Alert>}
          <div>
            <Button
              id="start-scoping"
              disabled={!isPi}
              disabledReason={!isPi ? t('overview.onlyPiStarts') : undefined}
              busy={startScoping.isPending}
              onClick={() => startScoping.mutate({ p_project: project.id })}
            >
              {t('overview.startScoping')}
            </Button>
          </div>
        </Card>
      )}
      <section aria-labelledby="project-next" className="flex flex-col gap-3">
        <h2 id="project-next" className="text-xl font-semibold">
          {t('home.nextTitle')}
        </h2>
        <NextActionList actions={actions} emptyBody={t('overview.nothingForYou')} />
      </section>
      {project.subjects.description && (
        <Card>
          <h2 className="mb-2 text-xl font-semibold">{t('overview.about')}</h2>
          <p className="whitespace-pre-line">{project.subjects.description}</p>
        </Card>
      )}
    </div>
  )
}
