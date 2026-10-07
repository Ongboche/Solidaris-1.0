import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { keys, saveDecisionRecord } from '../../lib/api'
import type { DecisionRecord } from '../../lib/types'
import { useAutosave } from '../../lib/useAutosave'
import { RadioGroup, TextArea, TextField } from '../../ui/Field'
import { Alert, Card } from '../../ui/Feedback'
import { SaveStatus } from '../../ui/SaveStatus'
import { Term } from '../../ui/Term'
import { useProjectContext } from './ProjectLayout'

type Fields = Omit<DecisionRecord, 'project_id'>

const EMPTY: Fields = {
  decision_text: '',
  decision_maker_name: '',
  decision_maker_institution: '',
  window_start: null,
  window_end: null,
  hr_screen_result: null,
  hr_screen_note: '',
}

/** Only the editable columns go back to the server (never id, created_by, timestamps). */
const pickFields = (row: Partial<Fields>): Fields =>
  Object.fromEntries(Object.keys(EMPTY).map((k) => [k, row[k as keyof Fields] ?? EMPTY[k as keyof Fields]])) as Fields

/** T1 Scoping & triage: the decision the profile will inform, and the human-rights floor screen. */
export default function ScopingPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { project, isPi } = useProjectContext()
  const editable = isPi && (project.status === 'draft' || project.status === 'scoping')
  const autosave = useAutosave<Fields>({
    backupKey: `decision:${project.id}`,
    save: async (v) => {
      await saveDecisionRecord(project.id, v)
      await qc.invalidateQueries({ queryKey: keys.project(project.id) })
    },
  })
  const [values, setValues] = useState<Fields>(() =>
    pickFields({ ...EMPTY, ...(project.decision_records ?? {}), ...(editable ? (autosave.backup() ?? {}) : {}) }),
  )

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => {
    const next = { ...values, [key]: value === '' && key.startsWith('window') ? null : value }
    setValues(next)
    autosave.queue(next)
  }
  const windowError =
    values.window_start && values.window_end && values.window_end < values.window_start ? t('scoping.windowOrder') : undefined

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold">{t('scoping.title')}</h2>
        <p className="text-muted">{t('scoping.intro')}</p>
      </div>
      {!editable && <Alert>{isPi ? t('scoping.lockedAfterG0') : t('common.readOnlyPi')}</Alert>}
      <Card className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold">{t('scoping.decisionTitle')}</h3>
        <TextArea
          label={t('scoping.decision')}
          hint={t('scoping.decisionHint')}
          rows={3}
          readOnly={!editable}
          value={values.decision_text ?? ''}
          onChange={(e) => set('decision_text', e.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t('scoping.decisionMaker')} readOnly={!editable} value={values.decision_maker_name ?? ''} onChange={(e) => set('decision_maker_name', e.target.value)} />
          <TextField label={t('scoping.decisionMakerInstitution')} optional readOnly={!editable} value={values.decision_maker_institution ?? ''} onChange={(e) => set('decision_maker_institution', e.target.value)} />
          <TextField label={t('scoping.windowStart')} type="date" readOnly={!editable} value={values.window_start ?? ''} onChange={(e) => set('window_start', e.target.value)} />
          <TextField label={t('scoping.windowEnd')} type="date" readOnly={!editable} value={values.window_end ?? ''} onChange={(e) => set('window_end', e.target.value)} error={windowError} />
        </div>
      </Card>
      <Card className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold">
          <Term term="hrScreen">{t('scoping.hrTitle')}</Term>
        </h3>
        <p className="text-muted">{t('scoping.hrIntro')}</p>
        <RadioGroup
          legend={t('scoping.hrQuestion')}
          name="hr-screen"
          disabled={!editable}
          value={values.hr_screen_result}
          onChange={(v) => set('hr_screen_result', v as Fields['hr_screen_result'])}
          options={[
            { value: 'pass', label: t('scoping.hrPass'), help: t('scoping.hrPassHelp') },
            { value: 'escalate', label: t('scoping.hrEscalate'), help: t('scoping.hrEscalateHelp') },
          ]}
        />
        {values.hr_screen_result === 'escalate' && <Alert tone="error">{t('scoping.escalateNotice')}</Alert>}
        <TextArea label={t('scoping.hrNote')} optional rows={2} readOnly={!editable} value={values.hr_screen_note ?? ''} onChange={(e) => set('hr_screen_note', e.target.value)} />
      </Card>
      {editable && <SaveStatus state={autosave.state} />}
      {project.status === 'scoping' && isPi && (
        <p>
          <Link className="text-primary underline" to="../gates/G0">
            {t('scoping.goToGate')}
          </Link>
        </p>
      )}
    </div>
  )
}
