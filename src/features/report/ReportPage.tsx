import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { run } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { recordDownload, useFramework, useInvalidateWorkflow, useRpc } from '../../lib/workflowApi'
import { useAutosave } from '../../lib/useAutosave'
import { Button } from '../../ui/Button'
import { RadioGroup, TextArea, TextField } from '../../ui/Field'
import { Alert, Card, Chip, EmptyState, Spinner } from '../../ui/Feedback'
import { SaveStatus } from '../../ui/SaveStatus'
import { useProjectContext } from '../project/ProjectLayout'
import { useReportData } from '../profile/useReportData'
import { buildNarrativeDraft, DRAFT_LABEL } from './narrative'
import { exportDocx, exportEvidenceCsv, exportPdf, exportRatingsCsv, toReportText } from './exporters'

/** T8 report (brief §10): sections, member-checks, the narrative draft, and exports. */
export default function ReportPage() {
  const { t } = useTranslation()
  const { project, myRoles, passed } = useProjectContext()
  const { data, loading, approved, evidence, extras } = useReportData(project, passed.includes('G6'))
  const framework = useFramework(project.framework_version_id)
  const invalidate = useInvalidateWorkflow(project.id)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const canEdit = (myRoles.includes('pi') || myRoles.includes('reviewer')) && project.status !== 'closed'

  if (!approved) return <EmptyState title={t('profileView.notYet')}>{t('profileView.notYetBody')}</EmptyState>
  if (loading || !data) return <Spinner label={t('common.loading')} />

  const draft = extras?.drafts[0]
  const exportAs = async (format: 'pdf' | 'docx' | 'csv', fn: () => unknown) => {
    setError(null)
    setBusy(format)
    try {
      await fn()
      await recordDownload(project.id, format)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  const text = () => toReportText(data, t)
  const base = data.subject.name.replace(/[^\w]+/g, '-').toLowerCase()
  const code = (id: string) => framework.data?.domains.find((d) => d.id === id)?.code ?? '?'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-semibold">{t('report.title')}</h2>
        <Chip tone={data.label === 'exploratory' ? 'alert' : 'neutral'}>{t(`profileView.label.${data.label}`)}</Chip>
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      <Card className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">{t('report.exports')}</h3>
        <p className="text-muted">{t('report.exportsIntro')}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" busy={busy === 'pdf'} onClick={() => exportAs('pdf', () => exportPdf(text(), `${base}-solidarity-profile.pdf`))}>
            <Download aria-hidden className="h-4 w-4" /> PDF
          </Button>
          <Button variant="secondary" busy={busy === 'docx'} onClick={() => exportAs('docx', () => exportDocx(text(), `${base}-solidarity-profile.docx`))}>
            <Download aria-hidden className="h-4 w-4" /> Word (DOCX)
          </Button>
          <Button variant="secondary" onClick={() => exportAs('csv', () => exportRatingsCsv(data))}>
            <Download aria-hidden className="h-4 w-4" /> {t('report.csvRatings')}
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              exportAs('csv', () =>
                exportEvidenceCsv(
                  data.subject.name,
                  (evidence?.items ?? []).map((i) => ({
                    title: i.title, type: i.type, origin: i.origin, source_type: i.source_type, evidence_date: i.evidence_date,
                    confidentiality: i.confidentiality, domains: i.links.map((l) => code(l.domain_id)), location: i.url ?? t('report.storedFile'),
                  })),
                ),
              )
            }
          >
            <Download aria-hidden className="h-4 w-4" /> {t('report.csvEvidence')}
          </Button>
        </div>
        {draft && !draft.approved_at && <p className="text-sm text-alert">{t('report.narrativeDraftWarning')}</p>}
      </Card>

      <NarrativeCard draft={draft} canEdit={canEdit} isPi={myRoles.includes('pi')} onCreate={async () => {
        await run(supabase.from('report_drafts').insert({ project_id: project.id, body: buildNarrativeDraft(data), produced_by: 'template' }))
        await invalidate()
      }} onChanged={invalidate} />

      <MemberChecks canEdit={canEdit} items={extras?.memberChecks ?? []} onChanged={invalidate} />

      <Card className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">{t('report.decisionSection')}</h3>
        <p>{data.decision?.decision_text ?? '—'}</p>
        <p className="text-sm text-muted">
          {data.decision?.decision_maker_name} · {data.decision?.window_start} – {data.decision?.window_end}
        </p>
      </Card>
      {data.gaps.length > 0 && (
        <Card className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold">{t('report.gapsSection')}</h3>
          <ul className="list-disc pl-6">
            {data.gaps.map((g, i) => (
              <li key={i}>
                {g.domainCode}: {g.description}
                {g.effect ? ` — ${g.effect}` : ''}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {data.dissent.length > 0 && (
        <Card className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold">{t('report.dissentSection')}</h3>
          <ul className="list-disc pl-6">
            {data.dissent.map((d, i) => (
              <li key={i}>
                {d.domainCode}: {d.position} — {d.rationale}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function NarrativeCard({ draft, canEdit, isPi, onCreate, onChanged }: {
  draft: { id: string; body: string; produced_by: string; approved_at: string | null } | undefined
  canEdit: boolean
  isPi: boolean
  onCreate: () => Promise<unknown>
  onChanged: () => unknown
}) {
  const { t } = useTranslation()
  const { project } = useProjectContext()
  const approve = useRpc<{ p_draft: string }>(project.id, 'approve_report_draft')
  const [body, setBody] = useState(draft?.body ?? '')
  const [creating, setCreating] = useState(false)
  const autosave = useAutosave<string>({
    backupKey: `narrative:${draft?.id ?? 'none'}`,
    save: async (v) => {
      await run(supabase.from('report_drafts').update({ body: v }).eq('id', draft!.id))
      await onChanged()
    },
  })
  const editable = canEdit && draft && !draft.approved_at

  return (
    <Card className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold">{t('report.narrativeSection')}</h3>
      {!draft ? (
        <>
          <p className="text-muted">{t('report.noDraft')}</p>
          {canEdit && (
            <div>
              <Button busy={creating} onClick={async () => { setCreating(true); try { await onCreate() } finally { setCreating(false) } }}>
                {t('report.createDraft')}
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-sm">
            <Chip>{t(`report.producedBy.${draft.produced_by}`)}</Chip>{' '}
            {draft.approved_at ? t('report.approvedOn', { date: new Date(draft.approved_at).toLocaleDateString() }) : DRAFT_LABEL}
          </p>
          <TextArea label={t('report.narrativeLabel')} rows={16} readOnly={!editable} value={body} onChange={(e) => { setBody(e.target.value); autosave.queue(e.target.value) }} />
          {editable && <SaveStatus state={autosave.state} />}
          {approve.error && <Alert tone="error">{approve.error.message}</Alert>}
          {isPi && !draft.approved_at && (
            <div>
              <Button busy={approve.isPending} onClick={() => approve.mutate({ p_draft: draft.id })}>
                {t('report.approveNarrative')}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  )
}

function MemberChecks({ canEdit, items, onChanged }: {
  canEdit: boolean
  items: { id: string; stakeholder_group: string; response: string | null; relevance: number | null; checked_on: string | null }[]
  onChanged: () => unknown
}) {
  const { t } = useTranslation()
  const { project } = useProjectContext()
  const [v, setV] = useState({ group: '', response: '', relevance: null as string | null, date: '' })
  const [error, setError] = useState<string | null>(null)
  return (
    <Card className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold">{t('report.memberCheckSection')}</h3>
      <p className="text-muted">{t('report.memberCheckIntro')}</p>
      {items.length === 0 ? (
        <p className="text-muted">{t('report.noMemberChecks')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((m) => (
            <li key={m.id} className="rounded bg-canvas p-2">
              <strong>{m.stakeholder_group}</strong>
              {m.checked_on ? ` (${m.checked_on})` : ''}: {m.response}
              {m.relevance ? ` — ${t('report.relevance')} ${m.relevance}/5` : ''}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form
          className="flex flex-col gap-3 border-t border-line pt-3"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!v.group.trim()) return
            setError(null)
            try {
              await run(supabase.from('member_checks').insert({
                project_id: project.id, stakeholder_group: v.group.trim(), response: v.response || null,
                relevance: v.relevance ? Number(v.relevance) : null, checked_on: v.date || null,
              }))
              setV({ group: '', response: '', relevance: null, date: '' })
              await onChanged()
            } catch (err) {
              setError((err as Error).message)
            }
          }}
        >
          <TextField label={t('report.stakeholderGroup')} value={v.group} onChange={(e) => setV({ ...v, group: e.target.value })} />
          <TextArea label={t('report.response')} optional rows={2} value={v.response} onChange={(e) => setV({ ...v, response: e.target.value })} />
          <RadioGroup legend={t('report.relevanceQuestion')} name="relevance" value={v.relevance} columns={4} onChange={(r) => setV({ ...v, relevance: r })} options={['1', '2', '3', '4', '5'].map((r) => ({ value: r, label: r }))} />
          <TextField label={t('report.checkedOn')} type="date" optional value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
          {error && <Alert tone="error">{error}</Alert>}
          <div>
            <Button type="submit" disabled={!v.group.trim()}>
              {t('report.addMemberCheck')}
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}
