import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Link2, Unlink } from 'lucide-react'
import { missingForCompletion } from '../../domain/completeness'
import { DEFAULTS } from '../../domain/config'
import type { Rating } from '../../domain/types'
import { useAutosave } from '../../lib/useAutosave'
import {
  createEvidence,
  createGap,
  linkEvidence,
  linkGap,
  saveIndicatorResponse,
  saveRating,
  unlinkEvidence,
  unlinkGap,
  type AssessmentRow,
  type Confidence,
  type Domain,
  type EvidenceGap,
  type EvidenceItem,
  type Framework,
  type RatingRow,
} from '../../lib/workflowApi'
import { Button } from '../../ui/Button'
import { RadioGroup, SelectField, TextArea, TextField } from '../../ui/Field'
import { Alert, Card, Chip } from '../../ui/Feedback'
import { RatingButtons } from '../../ui/RatingButtons'
import { SaveStatus } from '../../ui/SaveStatus'
import { EVIDENCE_TYPES, ORIGINS } from '../evidence/EvidencePage'

interface Props {
  projectId: string
  subjectType: string
  assessment: AssessmentRow
  domain: Domain
  rating: RatingRow
  framework: Framework
  evidence: EvidenceItem[]
  gaps: EvidenceGap[]
  editable: boolean
  onChanged: () => unknown
}

type Draft = { rating: Rating; narrative: string; confidence: Confidence | null }
const ADAPTED = ['programme', 'project']

/** One domain per screen (brief §9.3): prompts, evidence panel, then rating, narrative, confidence. */
export function DomainEditor({ projectId, subjectType, assessment, domain, rating, framework, evidence, gaps, editable, onChanged }: Props) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<Draft>({ rating: rating.rating, narrative: rating.narrative ?? '', confidence: rating.confidence })
  const [responses, setResponses] = useState<Record<string, string>>(() =>
    Object.fromEntries(domain.indicators.map((i) => [i.id, assessment.indicator_responses.find((r) => r.indicator_id === i.id)?.response ?? ''])),
  )
  const [error, setError] = useState<string | null>(null)
  const counts = { evidenceCount: rating.evidence.length, gapCount: rating.gaps.length }
  const missing = missingForCompletion({ ...draft, ...counts })

  // A complete rating stays complete only while it still satisfies invariant 3.
  const ratingSave = useAutosave<Draft>({
    backupKey: `rating:${rating.id}`,
    save: async (v) => {
      const stillComplete = rating.is_complete && missingForCompletion({ ...v, ...counts }).length === 0
      await saveRating(rating.id, { ...v, narrative: v.narrative, is_complete: stillComplete })
      await onChanged()
    },
  })
  const responseSave = useAutosave<Record<string, string>>({
    backupKey: `responses:${assessment.id}:${domain.id}`,
    save: async (v) => {
      for (const [indicator, text] of Object.entries(v)) await saveIndicatorResponse(assessment.id, indicator, text)
    },
  })
  const update = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch }
    setDraft(next)
    ratingSave.queue(next)
  }
  const act = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      await onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const linked = evidence.filter((e) => rating.evidence.some((l) => l.evidence_id === e.id))
  const linkable = evidence
    .filter((e) => !rating.evidence.some((l) => l.evidence_id === e.id))
    .sort((a, b) => Number(b.links.some((l) => l.domain_id === domain.id)) - Number(a.links.some((l) => l.domain_id === domain.id)))
  const linkedGaps = gaps.filter((g) => rating.gaps.some((l) => l.gap_id === g.id))
  const lastLink = rating.is_complete && counts.evidenceCount + counts.gapCount <= 1
  const color = `var(--color-${domain.dimension.color_token})`

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide" style={{ color }}>
          {domain.dimension.label} · {domain.dimension.sub_label}
        </p>
        <h2 className="text-2xl font-semibold">
          {domain.code} {domain.name}
        </h2>
        {domain.key_question && <p className="text-muted">{domain.key_question}</p>}
        {rating.is_complete && (
          <p className="mt-1 flex items-center gap-1 font-medium text-primary">
            <CheckCircle2 aria-hidden className="h-5 w-5" /> {t('assessment.complete')}
          </p>
        )}
      </div>
      {!ADAPTED.includes(subjectType) && <Alert>{t('newProject.promptsInDevelopment')}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-4">
          <details className="rounded border border-line bg-panel p-4">
            <summary className="cursor-pointer font-medium">{t('assessment.goodEvidence')}</summary>
            <p className="mt-2">{domain.evidence_to_look_for}</p>
            <p className="mt-2 font-medium">{t('assessment.redFlags')}</p>
            <p>{domain.red_flags}</p>
          </details>
          {domain.indicators.map((i, n) => (
            <TextArea
              key={i.id}
              label={`${n + 1}. ${i.prompt}`}
              optional
              rows={3}
              readOnly={!editable}
              value={responses[i.id] ?? ''}
              onChange={(e) => {
                const next = { ...responses, [i.id]: e.target.value }
                setResponses(next)
                responseSave.queue(next)
              }}
            />
          ))}
          {editable && <SaveStatus state={responseSave.state} />}
        </div>

        <aside aria-labelledby={`evidence-${domain.id}`} className="flex flex-col gap-3">
          <Card className="flex flex-col gap-3">
            <h3 id={`evidence-${domain.id}`} className="text-lg font-semibold">
              {t('assessment.evidencePanel')}
            </h3>
            {linked.length + linkedGaps.length === 0 && <p className="text-muted">{t('assessment.noLinks')}</p>}
            <ul className="flex flex-col gap-2">
              {linked.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2">
                  <span>
                    {e.title} <Chip>{t(`origin.${e.origin}`)}</Chip>
                  </span>
                  {editable && (
                    <Button variant="ghost" disabled={lastLink} aria-label={t('assessment.unlinkNamed', { name: e.title })} onClick={() => act(() => unlinkEvidence(rating.id, e.id))}>
                      <Unlink aria-hidden className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
              {linkedGaps.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-2">
                  <span>
                    <Chip tone="alert">{t('assessment.gap')}</Chip> {g.description}
                  </span>
                  {editable && (
                    <Button variant="ghost" disabled={lastLink} aria-label={t('assessment.unlinkNamed', { name: g.description })} onClick={() => act(() => unlinkGap(rating.id, g.id))}>
                      <Unlink aria-hidden className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {lastLink && editable && <p className="text-sm text-muted">{t('assessment.lastLink')}</p>}
            {editable && (
              <>
                <LinkExisting
                  options={linkable.map((e) => ({ value: e.id, label: `${e.title}${e.links.some((l) => l.domain_id === domain.id) ? ` (${domain.code})` : ''}` }))}
                  onLink={(id) => act(() => linkEvidence(rating.id, id))}
                />
                <QuickAdd domainId={domain.id} projectId={projectId} onAdd={(id) => act(() => linkEvidence(rating.id, id))} />
                <LogGap
                  existing={gaps.filter((g) => g.domain_id === domain.id && !rating.gaps.some((l) => l.gap_id === g.id))}
                  onLinkExisting={(id) => act(() => linkGap(rating.id, id))}
                  onCreate={(description, effect) =>
                    act(async () => linkGap(rating.id, await createGap(projectId, { domain_id: domain.id, description, effect_on_confidence: effect })))
                  }
                />
              </>
            )}
          </Card>
        </aside>
      </div>

      <Card className="flex flex-col gap-5">
        <RatingButtons domainName={`${domain.code} ${domain.name}`} levels={framework.ratingLevels} value={draft.rating} disabled={!editable} onChange={(rating) => update({ rating })} />
        <TextArea
          label={t('assessment.narrative')}
          hint={t('assessment.narrativeHint', { count: Math.max(0, DEFAULTS.minNarrativeLength - draft.narrative.trim().length), min: DEFAULTS.minNarrativeLength })}
          rows={5}
          readOnly={!editable}
          value={draft.narrative}
          onChange={(e) => update({ narrative: e.target.value })}
        />
        <RadioGroup
          legend={t('assessment.confidence')}
          name={`confidence-${rating.id}`}
          value={draft.confidence}
          columns={3}
          disabled={!editable}
          onChange={(v) => update({ confidence: v as Confidence })}
          options={(['low', 'medium', 'high'] as const).map((l) => ({ value: l, label: t(`level.${l}`), help: t(`confidenceHelp.${l}`) }))}
        />
        {editable && <SaveStatus state={ratingSave.state} />}
        {editable && !rating.is_complete && (
          <Button
            id={`complete-${rating.id}`}
            disabled={missing.length > 0}
            disabledReason={missing.length ? t('assessment.toComplete', { items: missing.map((m) => t(`assessment.missing.${m}`)).join(', ') }) : undefined}
            onClick={() => act(() => saveRating(rating.id, { ...draft, is_complete: true }))}
          >
            {t('assessment.markComplete')}
          </Button>
        )}
      </Card>
    </div>
  )
}

function LinkExisting({ options, onLink }: { options: { value: string; label: string }[]; onLink: (id: string) => unknown }) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  if (options.length === 0) return null
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <SelectField label={t('assessment.linkExisting')} value={value} placeholder={t('assessment.choose')} onChange={(e) => setValue(e.target.value)} options={options} />
      </div>
      <Button variant="secondary" disabled={!value} onClick={() => { void onLink(value); setValue('') }}>
        <Link2 aria-hidden className="h-4 w-4" /> {t('assessment.link')}
      </Button>
    </div>
  )
}

function QuickAdd({ projectId, domainId, onAdd }: { projectId: string; domainId: string; onAdd: (id: string) => unknown }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [v, setV] = useState({ title: '', url: '', type: 'document', origin: 'government' })
  const [busy, setBusy] = useState(false)
  if (!open)
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        {t('assessment.quickAdd')}
      </Button>
    )
  return (
    <form
      className="flex flex-col gap-3 border-t border-line pt-3"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!v.title.trim() || !v.url.trim()) return
        setBusy(true)
        try {
          const id = await createEvidence(projectId, {
            ...v, source: '', source_type: null, evidence_date: null, confidentiality: 'restricted', description: '', file: null, domainIds: [domainId],
          })
          await onAdd(id)
          setV({ ...v, title: '', url: '' })
          setOpen(false)
        } finally {
          setBusy(false)
        }
      }}
    >
      <TextField label={t('evidence.titleField')} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
      <TextField label={t('evidence.link')} type="url" value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} />
      <SelectField label={t('evidence.type')} value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })} options={EVIDENCE_TYPES.map((x) => ({ value: x, label: t(`evidenceType.${x}`) }))} />
      <SelectField label={t('evidence.origin')} value={v.origin} onChange={(e) => setV({ ...v, origin: e.target.value })} options={ORIGINS.map((x) => ({ value: x, label: t(`origin.${x}`) }))} />
      <p className="text-sm text-muted">{t('assessment.quickAddHint')}</p>
      <div>
        <Button type="submit" busy={busy} disabled={!v.title.trim() || !v.url.trim()}>
          {t('assessment.addAndLink')}
        </Button>
      </div>
    </form>
  )
}

function LogGap({ existing, onLinkExisting, onCreate }: { existing: EvidenceGap[]; onLinkExisting: (id: string) => unknown; onCreate: (d: string, e: string) => unknown }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [effect, setEffect] = useState('')
  return (
    <div className="flex flex-col gap-2">
      {existing.length > 0 && (
        <LinkExisting options={existing.map((g) => ({ value: g.id, label: `${t('assessment.gap')}: ${g.description}` }))} onLink={onLinkExisting} />
      )}
      {!open ? (
        <Button variant="ghost" onClick={() => setOpen(true)}>
          {t('assessment.logGap')}
        </Button>
      ) : (
        <form
          className="flex flex-col gap-3 border-t border-line pt-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!description.trim()) return
            void onCreate(description.trim(), effect.trim())
            setDescription('')
            setEffect('')
            setOpen(false)
          }}
        >
          <TextArea label={t('evidence.gapDescription')} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          <TextField label={t('evidence.gapEffect')} value={effect} onChange={(e) => setEffect(e.target.value)} />
          <div>
            <Button type="submit" disabled={!description.trim()}>
              {t('assessment.logGapButton')}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
