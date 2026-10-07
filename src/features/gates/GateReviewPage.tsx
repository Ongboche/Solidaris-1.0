import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, XCircle } from 'lucide-react'
import { GATES, type CriterionAnswer, type Gate, type GateDecision, type SuggestedDecision } from '../../domain/types'
import { decisionProblems, isUpwardOverride } from '../../domain/gates'
import { gateOwner, needsReviewerVerification } from '../../domain/workflow'
import { useGate, useGateMutations, type GateView } from '../../lib/api'
import type { GateCriterion } from '../../lib/types'
import { Button } from '../../ui/Button'
import { RadioGroup, TextArea } from '../../ui/Field'
import { Alert, Card, Chip, Spinner } from '../../ui/Feedback'
import { Term } from '../../ui/Term'
import { useProjectContext } from '../project/ProjectLayout'
import { describeEvidence } from './evidence'

const ANSWERS: CriterionAnswer[] = ['yes', 'partial', 'no', 'na']
const DECISIONS: GateDecision[] = ['go', 'conditional_go', 'hold', 'stop_redirect']
type Review = GateView['reviews'][number]

/** Generic gate review screen used by every gate (brief §9.10). */
export default function GateReviewPage() {
  const { t } = useTranslation()
  const { gate: gateParam } = useParams()
  const ctx = useProjectContext()
  const gate = (GATES as readonly string[]).includes(gateParam ?? '') ? (gateParam as Gate) : null
  const isOpen = Boolean(gate && ctx.currentGate === gate)
  const view = useGate(ctx.project, gate ?? 'G0', isOpen)

  if (!gate) return <Alert tone="error">{t('gate.unknown')}</Alert>
  if (view.isLoading) return <Spinner label={t('common.loading')} />
  if (view.error) return <Alert tone="error">{view.error.message}</Alert>

  const reviews = view.data!.reviews
  const open = reviews.find((r) => !r.owner_decision)
  const decided = reviews.filter((r) => r.owner_decision)

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold">{t('gate.title', { gate })}</h2>
        <p className="text-muted">{t(`gate.purpose.${gate}`)}</p>
        <p className="text-sm text-muted">{t('gate.owner', { role: t(`role.${gateOwner(gate)}`) })}</p>
      </div>
      {isOpen && open && <OpenReview gate={gate} review={open} criteria={view.data!.criteria} />}
      {!isOpen && decided.length === 0 && <Alert>{t('gate.notReached')}</Alert>}
      {decided.length > 0 && (
        <section aria-labelledby="history" className="flex flex-col gap-3">
          <h3 id="history" className="text-xl font-semibold">
            {t('gate.history')}
          </h3>
          {decided.map((r) => (
            <DecidedReview key={r.attempt_number} review={r} criteria={view.data!.criteria} />
          ))}
        </section>
      )}
    </div>
  )
}

function Suggestion({ suggested, reasons, criteria }: { suggested: SuggestedDecision; reasons: string[]; criteria: GateCriterion[] }) {
  const { t } = useTranslation()
  const text = (id: string) => criteria.find((c) => c.id === id)?.text ?? id
  return (
    <Card className="flex flex-col gap-2">
      <h3 className="text-lg font-semibold">{t('gate.suggestionTitle')}</h3>
      <p>
        <strong>{t(`gate.suggested.${suggested}`)}</strong> — {t(`gate.suggestedHelp.${suggested}`)}
      </p>
      {reasons.length > 0 && (
        <>
          <p>{t('gate.reasonsIntro', { count: reasons.length })}</p>
          <ul className="list-disc pl-6">
            {reasons.map((r) => {
              const [code, id] = r.split(':')
              return <li key={r}>{t(`gate.reason.${code}`, { criterion: text(id ?? '') })}</li>
            })}
          </ul>
        </>
      )}
      <p className="text-sm text-muted">{t('gate.suggestionOnly')}</p>
    </Card>
  )
}

function OpenReview({ gate, review, criteria }: { gate: Gate; review: Review; criteria: GateCriterion[] }) {
  const { t } = useTranslation()
  const { project, myRoles } = useProjectContext()
  const isOwner = myRoles.includes(gateOwner(gate))
  const isReviewer = myRoles.includes('reviewer')
  const m = useGateMutations(project.id, gate)
  const responses = useMemo(() => new Map(review.responses.map((r) => [r.criterion_id, r])), [review.responses])

  const [drafts, setDrafts] = useState<Record<string, { answer: CriterionAnswer | null; note: string }>>({})
  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        criteria.map((c) => [c.id, { answer: responses.get(c.id)?.answer ?? null, note: responses.get(c.id)?.note ?? '' }]),
      ),
    )
  }, [criteria, responses])

  const save = (id: string, answer: CriterionAnswer | null, note: string) => {
    setDrafts((d) => ({ ...d, [id]: { answer, note } }))
    if (!answer || (answer === 'na' && !note.trim())) return // N/A needs a note first
    m.saveAnswers.mutate([{ criterion_id: id, answer, note: note.trim() || null }])
  }

  const unanswered = criteria.filter((c) => !responses.get(c.id))
  const latestVerification = review.verifications.slice().sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  const verified = !needsReviewerVerification(gate) || latestVerification?.outcome === 'verified'

  const [decision, setDecision] = useState<GateDecision | null>(null)
  const [conditions, setConditions] = useState('')
  const [rationale, setRationale] = useState('')
  const problems = decision ? decisionProblems({ suggested: review.suggested_decision, decision, conditions, rationale }) : []
  const override = decision ? isUpwardOverride(review.suggested_decision, decision) : false
  const blockedReason =
    unanswered.length > 0
      ? t('gate.blockUnanswered', { count: unanswered.length })
      : !verified
        ? t('gate.blockVerification')
        : !decision
          ? t('gate.blockChoose')
          : problems.length > 0
            ? t(`gate.problem.${problems[0]}`)
            : undefined

  const [vOutcome, setVOutcome] = useState<'verified' | 'returned' | null>(null)
  const [vNotes, setVNotes] = useState('')

  return (
    <div className="flex flex-col gap-6">
      {review.attempt_number > 1 && <Alert>{t('gate.attempt', { n: review.attempt_number })}</Alert>}
      <section aria-labelledby="checklist" className="flex flex-col gap-3">
        <h3 id="checklist" className="text-xl font-semibold">
          {t('gate.checklist')}
        </h3>
        {m.saveAnswers.error && <Alert tone="error">{m.saveAnswers.error.message}</Alert>}
        <ol className="flex flex-col gap-3">
          {criteria.map((c) => {
            const r = responses.get(c.id)
            const draft = drafts[c.id] ?? { answer: null, note: '' }
            return (
              <li key={c.id} className="flex flex-col gap-3 rounded border border-line bg-panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium">{c.text}</p>
                  <Chip>{c.required ? t('gate.required') : t('gate.advisory')}</Chip>
                </div>
                {r?.auto ? (
                  <div className="flex flex-col gap-1">
                    <p className={`flex items-center gap-2 font-medium ${r.answer === 'yes' ? 'text-primary' : 'text-alert'}`}>
                      {r.answer === 'yes' ? <CheckCircle2 aria-hidden className="h-5 w-5" /> : <XCircle aria-hidden className="h-5 w-5" />}
                      <Term term="autoCheck">{t('gate.autoChecked')}</Term>: {t(`gate.answer.${r.answer}`)}
                    </p>
                    {describeEvidence(r.auto_evidence, t) && <p className="text-sm text-muted">{describeEvidence(r.auto_evidence, t)}</p>}
                    {isOwner && (
                      <TextArea
                        label={t('gate.note')}
                        optional
                        rows={2}
                        defaultValue={r.note ?? ''}
                        onBlur={(e) => e.target.value !== (r.note ?? '') && save(c.id, r.answer, e.target.value)}
                      />
                    )}
                  </div>
                ) : isOwner ? (
                  <>
                    <RadioGroup
                      legend={t('gate.yourAnswer')}
                      name={`answer-${c.id}`}
                      value={draft.answer}
                      columns={4}
                      onChange={(v) => save(c.id, v as CriterionAnswer, draft.note)}
                      options={ANSWERS.map((a) => ({ value: a, label: t(`gate.answer.${a}`) }))}
                    />
                    <TextArea
                      label={t('gate.note')}
                      optional={draft.answer !== 'na'}
                      rows={2}
                      value={draft.note}
                      error={draft.answer === 'na' && !draft.note.trim() ? t('gate.naNeedsNote') : undefined}
                      onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: { ...draft, note: e.target.value } }))}
                      onBlur={() => draft.answer && save(c.id, draft.answer, draft.note)}
                    />
                  </>
                ) : (
                  <p>{r ? t(`gate.answer.${r.answer}`) : t('gate.notAnswered')}{r?.note ? ` — ${r.note}` : ''}</p>
                )}
              </li>
            )
          })}
        </ol>
      </section>

      <Suggestion suggested={review.suggested_decision} reasons={review.suggestion_reasons} criteria={criteria} />

      {needsReviewerVerification(gate) && (
        <Card className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold">{t('gate.verificationTitle')}</h3>
          {latestVerification ? (
            <Alert tone={latestVerification.outcome === 'verified' ? 'success' : 'error'}>
              {t(`gate.verification.${latestVerification.outcome}`)}
              {latestVerification.notes ? ` — ${latestVerification.notes}` : ''}
            </Alert>
          ) : (
            <p className="text-muted">{t('gate.verificationPending')}</p>
          )}
          {isReviewer && (
            <>
              <RadioGroup
                legend={t('gate.verificationQuestion')}
                name="verification"
                value={vOutcome}
                columns={2}
                onChange={(v) => setVOutcome(v as 'verified' | 'returned')}
                options={[
                  { value: 'verified', label: t('gate.verification.verify') },
                  { value: 'returned', label: t('gate.verification.return') },
                ]}
              />
              <TextArea label={t('gate.verificationNotes')} optional={vOutcome !== 'returned'} rows={2} value={vNotes} onChange={(e) => setVNotes(e.target.value)} />
              {m.verify.error && <Alert tone="error">{m.verify.error.message}</Alert>}
              <div>
                <Button
                  disabled={!vOutcome || (vOutcome === 'returned' && !vNotes.trim())}
                  busy={m.verify.isPending}
                  onClick={() => vOutcome && m.verify.mutate({ outcome: vOutcome, notes: vNotes })}
                >
                  {t('gate.verificationSubmit')}
                </Button>
              </div>
            </>
          )}
        </Card>
      )}

      {isOwner ? (
        <Card className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold">{t('gate.decisionTitle')}</h3>
          <p className="text-muted">{t('gate.decisionIntro')}</p>
          <RadioGroup
            legend={t('gate.yourDecision')}
            name="decision"
            value={decision}
            onChange={(v) => setDecision(v as GateDecision)}
            options={DECISIONS.map((d) => ({ value: d, label: t(`gate.decision.${d}`), help: t(`gate.decisionHelp.${d}`) }))}
          />
          <p className="text-sm">
            <Term term="conditionalGo">{t('gate.decision.conditional_go')}</Term> · <Term term="hold">{t('gate.decision.hold')}</Term> ·{' '}
            <Term term="stopRedirect">{t('gate.decision.stop_redirect')}</Term>
          </p>
          {decision === 'conditional_go' && (
            <TextArea label={t('gate.conditions')} hint={t('gate.conditionsHint')} rows={3} value={conditions} onChange={(e) => setConditions(e.target.value)} />
          )}
          {(decision === 'hold' || decision === 'stop_redirect' || override) && (
            <TextArea
              label={override ? t('gate.justification') : t('gate.reasonLabel')}
              hint={override ? t('gate.justificationHint') : undefined}
              rows={3}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
            />
          )}
          {m.decide.error && <Alert tone="error">{m.decide.error.message}</Alert>}
          <div>
            <Button
              id="record-decision"
              disabled={Boolean(blockedReason)}
              disabledReason={blockedReason}
              busy={m.decide.isPending}
              onClick={() => decision && m.decide.mutate({ decision, conditions, rationale })}
            >
              {t('gate.recordDecision')}
            </Button>
          </div>
        </Card>
      ) : (
        <Alert>{t('gate.notOwner', { role: t(`role.${gateOwner(gate)}`) })}</Alert>
      )}
    </div>
  )
}

function DecidedReview({ review, criteria }: { review: Review; criteria: GateCriterion[] }) {
  const { t } = useTranslation()
  const responses = new Map(review.responses.map((r) => [r.criterion_id, r]))
  return (
    <details className="rounded border border-line bg-panel p-4">
      <summary className="cursor-pointer font-medium">
        {t('gate.attemptSummary', {
          n: review.attempt_number,
          decision: t(`gate.decision.${review.owner_decision}`),
          date: review.decided_at ? new Date(review.decided_at).toLocaleDateString() : '',
        })}
        {review.is_override ? ` · ${t('gate.overrideFlag')}` : ''}
      </summary>
      <div className="mt-3 flex flex-col gap-2">
        <p>{t('gate.suggestedWas', { decision: t(`gate.suggested.${review.suggested_decision}`) })}</p>
        {review.conditions && <p className="whitespace-pre-line">{t('gate.conditions')}: {review.conditions}</p>}
        {review.rationale && <p className="whitespace-pre-line">{t('gate.reasonLabel')}: {review.rationale}</p>}
        <ul className="list-disc pl-6 text-sm">
          {criteria.map((c) => {
            const r = responses.get(c.id)
            return (
              <li key={c.id}>
                {c.text}: <strong>{r ? t(`gate.answer.${r.answer}`) : t('gate.notAnswered')}</strong>
                {r?.auto ? ` (${t('gate.autoChecked')})` : ''}
                {r?.note ? ` — ${r.note}` : ''}
              </li>
            )
          })}
        </ul>
      </div>
    </details>
  )
}
