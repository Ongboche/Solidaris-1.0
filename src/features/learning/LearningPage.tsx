import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { run, useProjectRpc } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { useLearning } from '../../lib/phase6Api'
import { Button } from '../../ui/Button'
import { RadioGroup, TextArea, TextField } from '../../ui/Field'
import { Alert, Card, Chip, EmptyState, Spinner } from '../../ui/Feedback'
import { useProjectContext } from '../project/ProjectLayout'

/** T10 Learning & reassessment: follow-up, reassessment decision, lessons for the framework. */
export default function LearningPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { project, isPi, passed } = useProjectContext()
  const qc = useQueryClient()
  const learning = useLearning(project.id)
  const reassess = useProjectRpc<{ p_project: string }>(project.id, 'start_reassessment')
  const [review, setReview] = useState({ reviewed_on: '', notes: '', reassessment_decision: null as string | null })
  const [lesson, setLesson] = useState('')
  const [error, setError] = useState<string | null>(null)
  const act = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      await qc.invalidateQueries({ queryKey: ['learning', project.id] })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (!passed.includes('G7')) return <EmptyState title={t('learning.notYet')}>{t('learning.notYetBody')}</EmptyState>
  if (learning.isLoading || !learning.data) return <Spinner label={t('common.loading')} />
  const { reviews, lessons } = learning.data
  const decidedReassess = reviews.find((r) => r.reassessment_decision === 'reassess')
  const editable = isPi && project.status === 'learning'

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold">{t('learning.title')}</h2>
        <p className="text-muted">{t('learning.intro')}</p>
        <p className="text-sm text-muted">{t('common.proposalNote')}</p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      <Card className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">{t('learning.followUpTitle')}</h3>
        {reviews.length === 0 ? <p className="text-muted">{t('learning.noReviews')}</p> : (
          <ul className="flex flex-col gap-2">
            {reviews.map((r) => (
              <li key={r.id} className="rounded bg-canvas p-2">
                {r.reviewed_on} — {r.notes}
                {r.reassessment_decision && <> · <Chip>{t(`learning.decision.${r.reassessment_decision}`)}</Chip></>}
                {r.next_project_id && <> · <Link className="text-primary underline" to={`/projects/${r.next_project_id}`}>{t('learning.openReassessment')}</Link></>}
              </li>
            ))}
          </ul>
        )}
        {editable && (
          <form className="flex flex-col gap-3 border-t border-line pt-3" onSubmit={async (e) => {
            e.preventDefault()
            if (!review.reviewed_on) return
            await act(() => run(supabase.from('follow_up_reviews').insert({ project_id: project.id, ...review, notes: review.notes || null })))
            setReview({ reviewed_on: '', notes: '', reassessment_decision: null })
          }}>
            <TextField label={t('learning.reviewedOn')} type="date" value={review.reviewed_on} onChange={(e) => setReview({ ...review, reviewed_on: e.target.value })} />
            <TextArea label={t('learning.followUpNotes')} hint={t('learning.followUpHint')} rows={3} value={review.notes} onChange={(e) => setReview({ ...review, notes: e.target.value })} />
            <RadioGroup legend={t('learning.reassessQuestion')} name="reassess" value={review.reassessment_decision} columns={2} onChange={(d) => setReview({ ...review, reassessment_decision: d })}
              options={(['reassess', 'no_reassess'] as const).map((d) => ({ value: d, label: t(`learning.decision.${d}`) }))} />
            <div><Button type="submit" disabled={!review.reviewed_on}>{t('learning.saveReview')}</Button></div>
          </form>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">{t('learning.lessonsTitle')}</h3>
        <p className="text-muted">{t('learning.lessonsIntro')}</p>
        {lessons.length === 0 ? <p className="text-muted">{t('learning.noLessons')}</p> : (
          <ul className="list-disc pl-6">{lessons.map((l) => <li key={l.id}>{l.lesson}</li>)}</ul>
        )}
        {isPi && project.status !== 'closed' && (
          <form className="flex flex-col gap-3 border-t border-line pt-3 sm:flex-row sm:items-end" onSubmit={async (e) => {
            e.preventDefault()
            if (!lesson.trim()) return
            await act(() => run(supabase.from('framework_lessons').insert({ project_id: project.id, framework_version_id: project.framework_version_id, lesson: lesson.trim() })))
            setLesson('')
          }}>
            <div className="flex-1"><TextArea label={t('learning.lesson')} rows={2} value={lesson} onChange={(e) => setLesson(e.target.value)} /></div>
            <Button type="submit" disabled={!lesson.trim()}>{t('learning.addLesson')}</Button>
          </form>
        )}
      </Card>

      {isPi && project.status === 'closed' && passed.includes('G8') && decidedReassess && !decidedReassess.next_project_id && (
        <Card className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold">{t('learning.startTitle')}</h3>
          <p>{t('learning.startBody')}</p>
          {reassess.error && <Alert tone="error">{reassess.error.message}</Alert>}
          <div>
            <Button busy={reassess.isPending} onClick={() => reassess.mutate({ p_project: project.id }, { onSuccess: (id) => navigate(`/projects/${id as string}`) })}>
              {t('learning.startButton')}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
