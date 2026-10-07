import { useTranslation } from 'react-i18next'
import { nextActions } from '../../domain/nextActions'
import { Card } from '../../ui/Feedback'
import { NextActionList } from '../platform/NextActionList'
import { useProjectContext } from './ProjectLayout'
import { toSnapshot } from './snapshot'

// Starting scoping lives in the stage banner shown on every project tab.
export default function OverviewPage() {
  const { t } = useTranslation()
  const { project, userId } = useProjectContext()
  const actions = nextActions([toSnapshot(project, userId)], []).filter((a) => a.kind !== 'start_scoping')

  return (
    <div className="flex flex-col gap-6">
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
