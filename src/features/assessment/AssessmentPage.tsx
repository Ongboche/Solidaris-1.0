import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Circle, CircleDot } from 'lucide-react'
import {
  useAssessmentProgress,
  useAssessments,
  useEvidence,
  useFramework,
  useIntegrity,
  useInvalidateWorkflow,
  useRpc,
  type AssessmentRow,
  type Framework,
} from '../../lib/workflowApi'
import { Button } from '../../ui/Button'
import { Checkbox, TextField } from '../../ui/Field'
import { Alert, Card, EmptyState, Spinner } from '../../ui/Feedback'
import { useProjectContext } from '../project/ProjectLayout'
import { assessorIntegrityMissing, IntegrityForm } from '../integrity/IntegrityForm'
import { DomainEditor } from './DomainEditor'

/** T3 Solidarity profiling: each assessor rates D1–D9 independently (invariant 4). */
export default function AssessmentPage() {
  const { t } = useTranslation()
  const { project, myRoles, userId, passed } = useProjectContext()
  const framework = useFramework(project.framework_version_id)
  const assessments = useAssessments(project.id)
  const isAssessor = myRoles.includes('assessor')
  const mine = assessments.data?.find((a) => a.assessor_id === userId)
  const start = useRpc<{ p_project: string }>(project.id, 'start_assessment')

  if (framework.isLoading || assessments.isLoading) return <Spinner label={t('common.loading')} />
  const atStage = project.status === 'assessment'

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold">{t('assessment.title')}</h2>
        <p className="text-muted">{t('assessment.intro')}</p>
      </div>
      {passed.includes('G3') && (
        <Alert>
          {t('assessment.afterG3')}{' '}
          <Link className="text-primary underline" to="../deliberation">
            {t('assessment.goToDeliberation')}
          </Link>
        </Alert>
      )}
      {(myRoles.includes('pi') || myRoles.includes('reviewer')) && <ProgressTable />}
      {isAssessor && !mine && (
        atStage ? (
          <Card className="flex flex-col gap-3">
            <p>{t('assessment.startIntro')}</p>
            {start.error && <Alert tone="error">{start.error.message}</Alert>}
            <div>
              <Button busy={start.isPending} onClick={() => start.mutate({ p_project: project.id })}>
                {t('assessment.start')}
              </Button>
            </div>
          </Card>
        ) : (
          <EmptyState title={t('assessment.notOpen')}>{t('assessment.notOpenBody')}</EmptyState>
        )
      )}
      {mine && framework.data && <Workspace assessment={mine} framework={framework.data} />}
      {!isAssessor && !myRoles.includes('pi') && !myRoles.includes('reviewer') && <Alert>{t('assessment.notAssessor')}</Alert>}
    </div>
  )
}

function Workspace({ assessment, framework }: { assessment: AssessmentRow; framework: Framework }) {
  const { t } = useTranslation()
  const { project } = useProjectContext()
  const [params, setParams] = useSearchParams()
  const evidence = useEvidence(project.id)
  const integrity = useIntegrity(project.id)
  const invalidate = useInvalidateWorkflow(project.id)
  const editable = (assessment.status === 'draft' || assessment.status === 'reopened') && project.status === 'assessment'
  const steps = [...framework.domains.map((d) => d.code), 'integrity', 'submit']
  const step = steps.includes(params.get('step') ?? '') ? params.get('step')! : steps[0]!
  const go = (s: string) => setParams({ step: s })
  const myIntegrity = integrity.data?.find((r) => r.scope === 'assessor' && r.assessment_id === assessment.id)
  const domain = framework.domains.find((d) => d.code === step)
  const rating = domain && assessment.domain_ratings.find((r) => r.domain_id === domain.id)
  const index = steps.indexOf(step)

  const stateOf = (code: string) => {
    if (code === 'integrity') return assessorIntegrityMissing(myIntegrity).length === 0 ? 'complete' : myIntegrity ? 'started' : 'empty'
    const d = framework.domains.find((x) => x.code === code)
    const r = assessment.domain_ratings.find((x) => x.domain_id === d?.id)
    return r?.is_complete ? 'complete' : r && (r.rating !== null || r.narrative) ? 'started' : 'empty'
  }

  return (
    <div className="grid gap-6 md:grid-cols-[14rem_1fr]">
      <nav aria-label={t('assessment.checklist')} className="md:sticky md:top-4 md:self-start">
        {assessment.status === 'submitted' && <Alert tone="success">{t('assessment.submittedOn', { date: new Date(assessment.submitted_at!).toLocaleDateString() })}</Alert>}
        {assessment.status === 'reopened' && <Alert>{t('assessment.reopened', { reason: assessment.reopened_reason })}</Alert>}
        <ol className="mt-2 flex flex-col gap-1">
          {steps.map((s) => {
            const state = s === 'submit' ? null : stateOf(s)
            const Icon = state === 'complete' ? CheckCircle2 : state === 'started' ? CircleDot : Circle
            const label = s === 'integrity' ? t('assessment.integrityStep') : s === 'submit' ? t('assessment.submitStep') : `${s} ${framework.domains.find((d) => d.code === s)?.name}`
            return (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => go(s)}
                  aria-current={s === step ? 'step' : undefined}
                  className={`flex w-full min-h-11 items-center gap-2 rounded px-2 text-left ${s === step ? 'bg-success-bg font-semibold' : 'hover:bg-panel'}`}
                >
                  {state && <Icon aria-hidden className={`h-4 w-4 shrink-0 ${state === 'complete' ? 'text-primary' : 'text-muted'}`} />}
                  <span>{label}</span>
                  {state && <span className="sr-only">: {t(`assessment.state.${state}`)}</span>}
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      <div className="flex flex-col gap-4">
        {domain && rating && evidence.data && (
          <DomainEditor
            key={rating.id}
            projectId={project.id}
            subjectType={project.subjects.type}
            assessment={assessment}
            domain={domain}
            rating={rating}
            framework={framework}
            evidence={evidence.data.items}
            gaps={evidence.data.gaps}
            editable={editable}
            onChanged={invalidate}
          />
        )}
        {step === 'integrity' && !integrity.isLoading && (
          <>
            <div>
              <h2 className="text-2xl font-semibold">{t('assessment.integrityStep')}</h2>
              <p className="text-muted">{t('assessment.integrityIntro')}</p>
            </div>
            <IntegrityForm projectId={project.id} scope="assessor" assessmentId={assessment.id} review={myIntegrity} editable={editable} onSaved={invalidate} />
          </>
        )}
        {step === 'submit' && <SubmitStep assessment={assessment} framework={framework} integrityMissing={assessorIntegrityMissing(myIntegrity)} editable={editable} onJump={go} />}
        <div className="flex justify-between">
          <Button variant="secondary" disabled={index === 0} onClick={() => go(steps[index - 1]!)}>
            {t('common.back')}
          </Button>
          {index < steps.length - 1 && <Button variant="secondary" onClick={() => go(steps[index + 1]!)}>{t('assessment.next')}</Button>}
        </div>
      </div>
    </div>
  )
}

function SubmitStep({ assessment, framework, integrityMissing, editable, onJump }: { assessment: AssessmentRow; framework: Framework; integrityMissing: string[]; editable: boolean; onJump: (s: string) => void }) {
  const { t } = useTranslation()
  const { project } = useProjectContext()
  const submit = useRpc<{ p_assessment: string }>(project.id, 'submit_assessment')
  const [certified, setCertified] = useState(false)
  const incomplete = framework.domains.filter((d) => !assessment.domain_ratings.find((r) => r.domain_id === d.id)?.is_complete)
  // SRS §8.17: descriptive counts only — no average.
  const confidence = (['low', 'medium', 'high'] as const).map((l) => ({ l, n: assessment.domain_ratings.filter((r) => r.confidence === l).length }))
  const reason = incomplete.length
    ? t('assessment.blockIncomplete', { domains: incomplete.map((d) => d.code).join(', ') })
    : integrityMissing.length
      ? t('assessment.blockIntegrity')
      : !certified
        ? t('assessment.blockCertify')
        : undefined

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold">{t('assessment.submitStep')}</h2>
      <p>{t('assessment.completeCount', { done: framework.domains.length - incomplete.length, of: framework.domains.length })}</p>
      {incomplete.length > 0 && (
        <ul className="list-disc pl-6">
          {incomplete.map((d) => (
            <li key={d.id}>
              <button type="button" className="text-primary underline" onClick={() => onJump(d.code)}>
                {d.code} {d.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {integrityMissing.length > 0 && (
        <p>
          <button type="button" className="text-primary underline" onClick={() => onJump('integrity')}>
            {t('assessment.finishIntegrity')}
          </button>
        </p>
      )}
      <p className="text-sm text-muted">{t('assessment.confidenceSpread', { low: confidence[0]!.n, medium: confidence[1]!.n, high: confidence[2]!.n })}</p>
      {editable && (
        <>
          <Checkbox label={t('assessment.certify')} checked={certified} onChange={(e) => setCertified(e.target.checked)} />
          {submit.error && <Alert tone="error">{submit.error.message}</Alert>}
          <div>
            <Button id="submit-assessment" disabled={Boolean(reason)} disabledReason={reason} busy={submit.isPending} onClick={() => submit.mutate({ p_assessment: assessment.id })}>
              {t('assessment.submit')}
            </Button>
          </div>
          <p className="text-sm text-muted">{t('assessment.lockNotice')}</p>
        </>
      )}
    </Card>
  )
}

function ProgressTable() {
  const { t } = useTranslation()
  const { project, isPi } = useProjectContext()
  const progress = useAssessmentProgress(project.id)
  const withdraw = useRpc<{ p_assessment: string; p_reason: string }>(project.id, 'withdraw_assessment')
  const reopen = useRpc<{ p_assessment: string; p_reason: string }>(project.id, 'reopen_assessment')
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const canAct = isPi && project.status === 'assessment'
  const error = withdraw.error ?? reopen.error

  return (
    <section aria-labelledby="progress" className="flex flex-col gap-3">
      <h3 id="progress" className="text-lg font-semibold">
        {t('assessment.progressTitle')}
      </h3>
      <p className="text-sm text-muted">{t('assessment.progressPrivacy')}</p>
      {error && <Alert tone="error">{error.message}</Alert>}
      {(progress.data ?? []).length === 0 ? (
        <EmptyState title={t('assessment.noneStarted')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {(progress.data ?? []).map((p) => (
            <li key={p.assessment_id} className="flex flex-col gap-2 rounded border border-line bg-panel p-3">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">{p.assessor_name ?? t('team.unnamed')}</span>
                <span>
                  {t(`assessmentStatus.${p.status}`)} · {t('assessment.completeCount', { done: p.complete_domains, of: p.total_domains })}
                </span>
              </div>
              {canAct && p.status !== 'withdrawn' && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <TextField label={t('assessment.reason')} value={reasons[p.assessment_id] ?? ''} onChange={(e) => setReasons({ ...reasons, [p.assessment_id]: e.target.value })} />
                  </div>
                  {p.status === 'submitted' ? (
                    <Button variant="secondary" disabled={!reasons[p.assessment_id]?.trim()} onClick={() => reopen.mutate({ p_assessment: p.assessment_id, p_reason: reasons[p.assessment_id]! })}>
                      {t('assessment.reopen')}
                    </Button>
                  ) : (
                    <Button variant="secondary" disabled={!reasons[p.assessment_id]?.trim()} onClick={() => withdraw.mutate({ p_assessment: p.assessment_id, p_reason: reasons[p.assessment_id]! })}>
                      {t('assessment.withdraw')}
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
