import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  INTEGRITY_FIELDS,
  RISK_FLAGS,
  SOLIDARITY_TYPES,
  saveFlag,
  saveIntegrity,
  type Confidence,
  type IntegrityField,
  type IntegrityReview,
} from '../../lib/workflowApi'
import { useAutosave } from '../../lib/useAutosave'
import { RadioGroup, TextArea } from '../../ui/Field'
import { Alert, Card } from '../../ui/Feedback'
import { SaveStatus } from '../../ui/SaveStatus'

const GROUPS: { key: 'alignment' | 'cost' | 'voice'; fields: IntegrityField[] }[] = [
  { key: 'alignment', fields: INTEGRITY_FIELDS.slice(0, 3) },
  { key: 'cost', fields: INTEGRITY_FIELDS.slice(3, 7) },
  { key: 'voice', fields: INTEGRITY_FIELDS.slice(7) },
]

interface Props {
  projectId: string
  scope: 'assessor' | 'project'
  assessmentId: string | null
  review: IntegrityReview | undefined
  editable: boolean
  onSaved: () => unknown
}

/** T4 integrity & anti-capture (brief Appendix A): alignment, cost/burden, voice reality, 4 flags, type. */
export function IntegrityForm({ projectId, scope, assessmentId, review, editable, onSaved }: Props) {
  const { t } = useTranslation()
  const reviewId = useRef<string | null>(review?.id ?? null)
  const [text, setText] = useState<Record<string, string>>(() =>
    Object.fromEntries([...INTEGRITY_FIELDS, 'type_evidence'].map((f) => [f, (review?.[f as IntegrityField] as string | null) ?? ''])),
  )
  const [primary, setPrimary] = useState(review?.primary_type ?? null)
  const [secondary, setSecondary] = useState(review?.secondary_type ?? null)
  const [flags, setFlags] = useState<Record<string, { level: Confidence | null; explanation: string }>>(() =>
    Object.fromEntries(
      RISK_FLAGS.map((f) => {
        const x = review?.integrity_flags.find((y) => y.flag === f)
        return [f, { level: x?.level ?? null, explanation: x?.explanation ?? '' }]
      }),
    ),
  )
  const [error, setError] = useState<string | null>(null)

  // The review row is created once, even if several fields save at the same moment.
  const creating = useRef<Promise<string> | null>(null)
  const ensure = async (patch: Parameters<typeof saveIntegrity>[4]) => {
    if (!reviewId.current) {
      creating.current ??= saveIntegrity(projectId, scope, assessmentId, null, {})
      reviewId.current = await creating.current
    }
    if (Object.keys(patch).length) await saveIntegrity(projectId, scope, assessmentId, reviewId.current, patch)
    return reviewId.current
  }
  const autosave = useAutosave<Record<string, string>>({
    backupKey: `integrity:${scope}:${assessmentId ?? projectId}`,
    save: async (v) => {
      await ensure(v)
      await onSaved()
    },
  })
  const immediate = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      await onSaved()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const setFlag = (flag: string, level: Confidence | null, explanation: string) => {
    setFlags((f) => ({ ...f, [flag]: { level, explanation } }))
    if (!level || (level === 'high' && !explanation.trim())) return // High needs an explanation first
    void immediate(async () => saveFlag(await ensure({}), flag, level, explanation.trim() || null))
  }

  return (
    <div className="flex flex-col gap-6">
      {!editable && <Alert>{t('integrity.readOnly')}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {GROUPS.map((g) => (
        <Card key={g.key} className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold">{t(`integrity.group.${g.key}`)}</h3>
          {g.fields.map((f) => (
            <TextArea
              key={f}
              label={t(`integrity.field.${f}`)}
              optional={scope === 'assessor'}
              rows={3}
              readOnly={!editable}
              value={text[f]}
              onChange={(e) => {
                const next = { ...text, [f]: e.target.value }
                setText(next)
                autosave.queue(next)
              }}
            />
          ))}
        </Card>
      ))}
      {editable && <SaveStatus state={autosave.state} />}

      <Card className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold">{t('integrity.flagsTitle')}</h3>
        <p className="text-muted">{t('integrity.flagsIntro')}</p>
        {RISK_FLAGS.map((f) => {
          const v = flags[f]!
          return (
            <div key={f} className="flex flex-col gap-2 border-t border-line pt-3">
              <RadioGroup
                legend={t(`integrity.flag.${f}`)}
                name={`flag-${scope}-${f}`}
                value={v.level}
                columns={3}
                disabled={!editable}
                onChange={(level) => setFlag(f, level as Confidence, v.explanation)}
                options={(['low', 'medium', 'high'] as const).map((l) => ({ value: l, label: t(`level.${l}`) }))}
              />
              {(v.level === 'high' || v.explanation) && (
                <TextArea
                  label={t('integrity.explanation')}
                  optional={v.level !== 'high'}
                  rows={2}
                  readOnly={!editable}
                  value={v.explanation}
                  error={v.level === 'high' && !v.explanation.trim() ? t('integrity.highNeedsExplanation') : undefined}
                  onChange={(e) => setFlags((x) => ({ ...x, [f]: { ...v, explanation: e.target.value } }))}
                  onBlur={() => setFlag(f, v.level, v.explanation)}
                />
              )}
            </div>
          )
        })}
      </Card>

      <Card className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold">{t('integrity.typeTitle')}</h3>
        <RadioGroup
          legend={t('integrity.primaryType')}
          name={`primary-${scope}`}
          value={primary}
          columns={2}
          disabled={!editable}
          onChange={(v) => {
            setPrimary(v)
            void immediate(() => ensure({ primary_type: v }))
          }}
          options={SOLIDARITY_TYPES.map((s) => ({ value: s, label: t(`solidarityType.${s}`) }))}
        />
        <RadioGroup
          legend={`${t('integrity.secondaryType')} (${t('common.optional')})`}
          name={`secondary-${scope}`}
          value={secondary}
          columns={2}
          disabled={!editable}
          onChange={(v) => {
            setSecondary(v)
            void immediate(() => ensure({ secondary_type: v }))
          }}
          options={SOLIDARITY_TYPES.map((s) => ({ value: s, label: t(`solidarityType.${s}`) }))}
        />
        <TextArea
          label={t('integrity.typeEvidence')}
          optional={scope === 'assessor'}
          rows={2}
          readOnly={!editable}
          value={text.type_evidence}
          onChange={(e) => {
            const next = { ...text, type_evidence: e.target.value }
            setText(next)
            autosave.queue(next)
          }}
        />
      </Card>
    </div>
  )
}

/** What the server requires before an assessor can submit (PLAN D-36). */
export function assessorIntegrityMissing(review: IntegrityReview | undefined): ('flags' | 'type')[] {
  const missing: ('flags' | 'type')[] = []
  if (!review || RISK_FLAGS.some((f) => !review.integrity_flags.some((x) => x.flag === f))) missing.push('flags')
  if (!review?.primary_type) missing.push('type')
  return missing
}
