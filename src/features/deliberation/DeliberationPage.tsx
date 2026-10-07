import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { divergence, needsDiscussion } from '../../domain/divergence'
import type { Rating } from '../../domain/types'
import { run, useTeam } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import {
  saveConsensus,
  useAssessments,
  useDeliberation,
  useFramework,
  useInvalidateWorkflow,
  useRpc,
  type Confidence,
  type DeliberationData,
  type Domain,
  type Framework,
} from '../../lib/workflowApi'
import { Button } from '../../ui/Button'
import { Checkbox, RadioGroup, SelectField, TextArea, TextField } from '../../ui/Field'
import { Alert, Card, Chip, EmptyState, Spinner } from '../../ui/Feedback'
import { RatingButtons } from '../../ui/RatingButtons'
import { useProjectContext } from '../project/ProjectLayout'

const CATEGORIES = ['full', 'substantial', 'with_reservations', 'no_consensus', 'deferred_pending_evidence']
const NO_RATING = ['no_consensus', 'deferred_pending_evidence']

/** T6 Deliberation & consensus (brief §6.4, §9.9). Visible only after G3 (invariant 4). */
export default function DeliberationPage() {
  const { t } = useTranslation()
  const { project, myRoles, passed, userId } = useProjectContext()
  const framework = useFramework(project.framework_version_id)
  const assessments = useAssessments(project.id)
  const delib = useDeliberation(project.id)
  const team = useTeam(project.id)
  const isCommunity = myRoles.includes('community_participant') && !myRoles.some((r) => ['pi', 'assessor', 'reviewer'].includes(r))
  const [showRatings, setShowRatings] = useState(!isCommunity)

  const submitted = useMemo(() => (assessments.data ?? []).filter((a) => a.status === 'submitted'), [assessments.data])
  if (!passed.includes('G3')) return <EmptyState title={t('deliberation.notYet')}>{t('deliberation.notYetBody')}</EmptyState>
  if (framework.isLoading || assessments.isLoading || delib.isLoading) return <Spinner label={t('common.loading')} />

  const nameOf = (id: string) => team.data?.find((m) => m.user_id === id)?.full_name ?? t('team.unnamed')
  const open = project.status === 'deliberation'
  const canTalk = open && myRoles.some((r) => ['pi', 'assessor', 'reviewer', 'external_expert', 'community_participant'].includes(r))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold">{t('deliberation.title')}</h2>
        <p className="text-muted">{t(isCommunity ? 'deliberation.introCommunity' : 'deliberation.intro')}</p>
      </div>
      {isCommunity && <Checkbox label={t('deliberation.showRatings')} checked={showRatings} onChange={(e) => setShowRatings(e.target.checked)} />}
      <Sessions data={delib.data!} />
      {framework.data!.domains.map((d) => (
        <DomainCard
          key={d.id}
          domain={d}
          framework={framework.data!}
          ratings={submitted.map((a) => ({ assessor: nameOf(a.assessor_id), row: a.domain_ratings.find((r) => r.domain_id === d.id) }))}
          data={delib.data!}
          nameOf={nameOf}
          showRatings={showRatings}
          canTalk={canTalk}
          isPi={myRoles.includes('pi') && open && !project.profile_approved_at}
          userId={userId}
        />
      ))}
      <Approval data={delib.data!} domains={framework.data!.domains} exploratory={project.single_assessor || submitted.length < 2} />
    </div>
  )
}

function DomainCard({
  domain, framework, ratings, data, nameOf, showRatings, canTalk, isPi, userId,
}: {
  domain: Domain
  framework: Framework
  ratings: { assessor: string; row: { rating: Rating; narrative: string | null; confidence: Confidence | null } | undefined }[]
  data: DeliberationData
  nameOf: (id: string) => string
  showRatings: boolean
  canTalk: boolean
  isPi: boolean
  userId: string
}) {
  const { t } = useTranslation()
  const { project } = useProjectContext()
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['deliberation', project.id] })
  const values = ratings.map((r) => r.row?.rating ?? null)
  const spread = divergence(values)
  const flagged = needsDiscussion(values)
  const consensus = data.consensus.find((c) => c.domain_id === domain.id)
  const notes = data.discussions.filter((x) => x.domain_id === domain.id)
  const dissent = data.dissent.filter((x) => x.domain_id === domain.id)
  const [note, setNote] = useState('')
  const [c, setC] = useState({
    category: consensus?.category ?? 'full',
    rating: (consensus?.rating ?? null) as Rating,
    rationale: consensus?.rationale ?? '',
    confidence: consensus?.confidence ?? null,
  })
  const [dis, setDis] = useState({ position: '', rationale: '' })
  const [error, setError] = useState<string | null>(null)
  const act = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      await invalidate()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const label = (v: number | null) => (v === null ? t('common.notRated') : `${v} – ${framework.ratingLevels.find((l) => l.value === v)?.label ?? ''}`)

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">
          {domain.code} {domain.name}
        </h3>
        {spread === null ? (
          <Chip>{t('deliberation.notComparable')}</Chip>
        ) : flagged ? (
          <Chip tone="alert">{t('deliberation.needsDiscussion', { points: spread })}</Chip>
        ) : (
          <Chip>{t('deliberation.agreement', { points: spread })}</Chip>
        )}
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      {showRatings && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t('deliberation.ratingsCaption', { domain: domain.name })}</caption>
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="p-2">{t('deliberation.assessor')}</th>
                <th scope="col" className="p-2">{t('deliberation.rating')}</th>
                <th scope="col" className="p-2">{t('assessment.confidence')}</th>
                <th scope="col" className="p-2">{t('assessment.narrative')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ratings.map((r) => (
                <tr key={r.assessor} className="align-top">
                  <th scope="row" className="p-2 font-medium">{r.assessor}</th>
                  <td className="p-2">{label(r.row?.rating ?? null)}</td>
                  <td className="p-2">{r.row?.confidence ? t(`level.${r.row.confidence}`) : '—'}</td>
                  <td className="p-2">{r.row?.narrative}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h4 className="font-semibold">{t('deliberation.discussion')}</h4>
        {notes.length === 0 ? (
          <p className="text-muted">{t('deliberation.noNotes')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {notes.map((n) => (
              <li key={n.id} className="rounded bg-canvas p-2">
                <span className="text-sm font-medium">{nameOf(n.created_by)}</span>: {n.note}
              </li>
            ))}
          </ul>
        )}
        {canTalk && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <TextArea label={t('deliberation.addNote')} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <Button
              variant="secondary"
              disabled={!note.trim()}
              onClick={() =>
                act(async () => {
                  await run(supabase.from('domain_discussions').insert({ project_id: project.id, domain_id: domain.id, note: note.trim() }))
                  setNote('')
                })
              }
            >
              {t('deliberation.post')}
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <h4 className="font-semibold">{t('deliberation.consensus')}</h4>
        {consensus && (
          <p>
            {t(`consensusCategory.${consensus.category}`)} · {label(consensus.rating)}
            {consensus.confidence ? ` · ${t(`level.${consensus.confidence}`)}` : ''}
            {consensus.reviewer_verified_at ? ` · ${t('deliberation.verified')}` : ''}
          </p>
        )}
        {isPi && (
          <div className="flex flex-col gap-3">
            <SelectField label={t('deliberation.category')} value={c.category} onChange={(e) => setC({ ...c, category: e.target.value, rating: NO_RATING.includes(e.target.value) ? null : c.rating })} options={CATEGORIES.map((x) => ({ value: x, label: t(`consensusCategory.${x}`) }))} />
            {!NO_RATING.includes(c.category) && (
              <RatingButtons domainName={`${domain.code} ${domain.name}`} levels={framework.ratingLevels} value={c.rating} onChange={(rating) => setC({ ...c, rating })} />
            )}
            <RadioGroup legend={t('assessment.confidence')} name={`cc-${domain.id}`} value={c.confidence} columns={3} onChange={(v) => setC({ ...c, confidence: v as Confidence })} options={(['low', 'medium', 'high'] as const).map((l) => ({ value: l, label: t(`level.${l}`) }))} />
            <TextArea label={t('deliberation.rationale')} rows={2} value={c.rationale} onChange={(e) => setC({ ...c, rationale: e.target.value })} />
            <div>
              <Button
                id={`save-consensus-${domain.id}`}
                disabled={!NO_RATING.includes(c.category) && c.rating === null}
                disabledReason={t('deliberation.needRating')}
                onClick={() => act(() => saveConsensus(project.id, domain.id, { ...c, rationale: c.rationale.trim() }))}
              >
                {t('deliberation.saveConsensus')}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <h4 className="font-semibold">{t('deliberation.dissent')}</h4>
        {dissent.length === 0 ? (
          <p className="text-muted">{t('deliberation.noDissent')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {dissent.map((d) => (
              <li key={d.id} className="rounded bg-canvas p-2">
                <span className="font-medium">{nameOf(d.member_id)}</span>: {d.position} — {d.rationale}
              </li>
            ))}
          </ul>
        )}
        {canTalk && (
          <details>
            <summary className="cursor-pointer text-primary underline">{t('deliberation.recordDissent')}</summary>
            <div className="mt-2 flex flex-col gap-2">
              <TextField label={t('deliberation.position')} value={dis.position} onChange={(e) => setDis({ ...dis, position: e.target.value })} />
              <TextArea label={t('deliberation.rationale')} rows={2} value={dis.rationale} onChange={(e) => setDis({ ...dis, rationale: e.target.value })} />
              <div>
                <Button
                  variant="secondary"
                  disabled={!dis.position.trim() || !dis.rationale.trim()}
                  onClick={() =>
                    act(async () => {
                      await run(supabase.from('dissent_records').insert({ project_id: project.id, domain_id: domain.id, member_id: userId, position: dis.position.trim(), rationale: dis.rationale.trim() }))
                      setDis({ position: '', rationale: '' })
                    })
                  }
                >
                  {t('deliberation.saveDissent')}
                </Button>
              </div>
              <p className="text-sm text-muted">{t('deliberation.dissentPermanent')}</p>
            </div>
          </details>
        )}
      </div>
    </Card>
  )
}

function Sessions({ data }: { data: DeliberationData }) {
  const { t } = useTranslation()
  const { project, isPi } = useProjectContext()
  const team = useTeam(project.id)
  const invalidate = useInvalidateWorkflow(project.id)
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [people, setPeople] = useState<string[]>([])
  const [external, setExternal] = useState('')
  const [error, setError] = useState<string | null>(null)
  const members = [...new Map((team.data ?? []).map((m) => [m.user_id, m])).values()]

  const add = async () => {
    setError(null)
    try {
      const rows = (await run(supabase.from('deliberation_sessions').insert({ project_id: project.id, held_on: date, notes: notes || null }).select('id'))) as { id: string }[]
      const participants = [
        ...people.map((user_id) => ({ session_id: rows[0]!.id, user_id, role: team.data?.find((m) => m.user_id === user_id)?.role })),
        ...external.split('\n').map((s) => s.trim()).filter(Boolean).map((external_name) => ({ session_id: rows[0]!.id, external_name, role: 'external' })),
      ]
      if (participants.length) await run(supabase.from('deliberation_participants').insert(participants))
      setDate('')
      setNotes('')
      setPeople([])
      setExternal('')
      await invalidate()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <details className="rounded border border-line bg-panel p-4">
      <summary className="cursor-pointer font-semibold">{t('deliberation.sessions', { count: data.sessions.length })}</summary>
      <ul className="mt-3 flex flex-col gap-2">
        {data.sessions.map((s) => (
          <li key={s.id}>
            {new Date(s.held_on).toLocaleDateString()} · {t('deliberation.participants', { count: s.participants.length })}
            {s.notes ? ` — ${s.notes}` : ''}
          </li>
        ))}
      </ul>
      {isPi && project.status === 'deliberation' && (
        <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
          <TextField label={t('deliberation.sessionDate')} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <fieldset className="flex flex-col gap-1">
            <legend className="font-medium">{t('deliberation.whoAttended')}</legend>
            {members.map((m) => (
              <Checkbox key={m.user_id} label={`${m.full_name ?? t('team.unnamed')} (${t(`role.${m.role}`)})`} checked={people.includes(m.user_id)} onChange={(e) => setPeople(e.target.checked ? [...people, m.user_id] : people.filter((p) => p !== m.user_id))} />
            ))}
          </fieldset>
          <TextArea label={t('deliberation.externalAttendees')} hint={t('deliberation.externalHint')} optional rows={2} value={external} onChange={(e) => setExternal(e.target.value)} />
          <TextArea label={t('deliberation.sessionNotes')} optional rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          {error && <Alert tone="error">{error}</Alert>}
          <div>
            <Button disabled={!date} onClick={() => void add()}>
              {t('deliberation.addSession')}
            </Button>
          </div>
        </div>
      )}
    </details>
  )
}

function Approval({ data, domains, exploratory }: { data: DeliberationData; domains: Domain[]; exploratory: boolean }) {
  const { t } = useTranslation()
  const { project, myRoles } = useProjectContext()
  const verify = useRpc<{ p_project: string }>(project.id, 'verify_consensus')
  const approve = useRpc<{ p_project: string }>(project.id, 'approve_profile')
  const stage = ['deliberation', 'validation'].includes(project.status)
  const missing = domains.filter((d) => !data.consensus.some((c) => c.domain_id === d.id))
  const unverified = domains.filter((d) => !data.consensus.find((c) => c.domain_id === d.id)?.reviewer_verified_at)
  const error = verify.error ?? approve.error

  if (project.profile_approved_at)
    return <Alert tone="success">{t('deliberation.approvedOn', { date: new Date(project.profile_approved_at).toLocaleDateString() })}</Alert>

  return (
    <Card className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold">{t('deliberation.approvalTitle')}</h3>
      <p className="text-muted">{exploratory ? t('deliberation.approvalExploratory') : t('deliberation.approvalIntro')}</p>
      {error && <Alert tone="error">{error.message}</Alert>}
      {!exploratory && myRoles.includes('reviewer') && stage && (
        <div>
          <Button id="verify-consensus" disabled={missing.length > 0} disabledReason={t('deliberation.missingConsensus', { domains: missing.map((d) => d.code).join(', ') })} busy={verify.isPending} onClick={() => verify.mutate({ p_project: project.id })}>
            {t('deliberation.verifyConsensus')}
          </Button>
        </div>
      )}
      {myRoles.includes('pi') && stage && (
        <div>
          <Button
            id="approve-profile"
            disabled={!exploratory && unverified.length > 0}
            disabledReason={t('deliberation.awaitingVerification', { domains: unverified.map((d) => d.code).join(', ') })}
            busy={approve.isPending}
            onClick={() => approve.mutate({ p_project: project.id })}
          >
            {t('deliberation.approveProfile')}
          </Button>
        </div>
      )}
    </Card>
  )
}
