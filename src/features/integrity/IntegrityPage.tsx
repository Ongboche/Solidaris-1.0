import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTeam } from '../../lib/api'
import { RISK_FLAGS, useAssessments, useIntegrity, useInvalidateWorkflow, useRpc } from '../../lib/workflowApi'
import { Button } from '../../ui/Button'
import { TextArea } from '../../ui/Field'
import { Alert, Card, Chip, EmptyState, Spinner } from '../../ui/Feedback'
import { useProjectContext } from '../project/ProjectLayout'
import { IntegrityForm } from './IntegrityForm'

/** T4 at project level: the team consolidates one review; the reviewer QAs it for G4 (PLAN D-7). */
export default function IntegrityPage() {
  const { t } = useTranslation()
  const { project, myRoles, passed } = useProjectContext()
  const integrity = useIntegrity(project.id)
  const assessments = useAssessments(project.id)
  const team = useTeam(project.id)
  const invalidate = useInvalidateWorkflow(project.id)
  const qa = useRpc<{ p_project: string; p_notes: string }>(project.id, 'record_integrity_qa')
  const [notes, setNotes] = useState('')

  if (!passed.includes('G3')) return <EmptyState title={t('integrity.notYet')}>{t('integrity.notYetBody')}</EmptyState>
  if (integrity.isLoading) return <Spinner label={t('common.loading')} />

  const projectReview = integrity.data?.find((r) => r.scope === 'project')
  const assessorReviews = (integrity.data ?? []).filter((r) => r.scope === 'assessor')
  const nameOf = (assessmentId: string | null) => {
    const a = assessments.data?.find((x) => x.id === assessmentId)
    return team.data?.find((m) => m.user_id === a?.assessor_id)?.full_name ?? t('team.unnamed')
  }
  const editable = project.status === 'integrity' && ['pi', 'assessor', 'reviewer'].some((r) => myRoles.includes(r as never))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold">{t('integrity.title')}</h2>
        <p className="text-muted">{t('integrity.intro')}</p>
      </div>

      <section aria-labelledby="by-assessor" className="flex flex-col gap-3">
        <h3 id="by-assessor" className="text-lg font-semibold">
          {t('integrity.byAssessor')}
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          {assessorReviews.map((r) => (
            <Card key={r.id} className="flex flex-col gap-2">
              <p className="font-medium">{nameOf(r.assessment_id)}</p>
              <div className="flex flex-wrap gap-1">
                {RISK_FLAGS.map((f) => {
                  const x = r.integrity_flags.find((y) => y.flag === f)
                  return (
                    <Chip key={f} tone={x?.level === 'high' ? 'alert' : 'neutral'}>
                      {t(`integrity.flag.${f}`)}: {x ? t(`level.${x.level}`) : '—'}
                    </Chip>
                  )
                })}
              </div>
              {r.primary_type && <p className="text-sm">{t('integrity.primaryType')}: {t(`solidarityType.${r.primary_type}`)}</p>}
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="consolidated" className="flex flex-col gap-3">
        <h3 id="consolidated" className="text-lg font-semibold">
          {t('integrity.consolidated')}
        </h3>
        <IntegrityForm key={projectReview?.id ?? 'new'} projectId={project.id} scope="project" assessmentId={null} review={projectReview} editable={editable} onSaved={invalidate} />
      </section>

      <Card className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">{t('integrity.qaTitle')}</h3>
        {projectReview?.qa_at ? (
          <Alert tone="success">
            {t('integrity.qaDone', { date: new Date(projectReview.qa_at).toLocaleDateString() })}
            {projectReview.qa_notes ? ` — ${projectReview.qa_notes}` : ''}
          </Alert>
        ) : (
          <p className="text-muted">{t('integrity.qaPending')}</p>
        )}
        {myRoles.includes('reviewer') && project.status === 'integrity' && (
          <>
            <TextArea label={t('integrity.qaNotes')} optional rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            {qa.error && <Alert tone="error">{qa.error.message}</Alert>}
            <div>
              <Button id="record-qa" disabled={!projectReview} disabledReason={t('integrity.qaNeedsReview')} busy={qa.isPending} onClick={() => qa.mutate({ p_project: project.id, p_notes: notes })}>
                {t('integrity.recordQa')}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
