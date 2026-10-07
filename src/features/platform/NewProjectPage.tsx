import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useCreateProject } from '../../lib/api'
import type { AssessmentType, SubjectType } from '../../lib/types'
import { Button } from '../../ui/Button'
import { RadioGroup, SelectField, TextArea, TextField } from '../../ui/Field'
import { Alert, Card } from '../../ui/Feedback'

const SUBJECT_TYPES: SubjectType[] = ['programme', 'project', 'policy', 'investment', 'portfolio']
const ASSESSMENT_TYPES: AssessmentType[] = ['baseline', 'midline', 'endline', 'rapid']
// Brief §8: adapted prompts exist only for projects and programmes so far.
const ADAPTED_PROMPTS: SubjectType[] = ['programme', 'project']

/** Subject router (brief §4.2): pick what is being profiled, then name it. */
export default function NewProjectPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const create = useCreateProject()
  const [type, setType] = useState<SubjectType | null>(null)
  const [name, setName] = useState('')
  const [country, setCountry] = useState('')
  const [region, setRegion] = useState('')
  const [description, setDescription] = useState('')
  const [assessmentType, setAssessmentType] = useState<AssessmentType>('baseline')
  const [touched, setTouched] = useState(false)

  const nameError = touched && !name.trim() ? t('auth.validation.required') : undefined
  const typeError = touched && !type

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!type || !name.trim()) return
    create.mutate(
      { type, name: name.trim(), country, region, description, assessmentType },
      { onSuccess: (id) => navigate(`/projects/${id}`) },
    )
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold">{t('newProject.title')}</h1>
        <p className="text-muted">{t('newProject.intro')}</p>
      </div>
      {create.error && <Alert tone="error">{create.error.message}</Alert>}
      <Card>
        <form noValidate onSubmit={submit} className="flex flex-col gap-6">
          <RadioGroup
            legend={t('newProject.typeLabel')}
            name="subject-type"
            value={type}
            columns={2}
            onChange={(v) => setType(v as SubjectType)}
            options={SUBJECT_TYPES.map((s) => ({ value: s, label: t(`subjectType.${s}`), help: t(`subjectTypeHelp.${s}`) }))}
          />
          {typeError && <p className="text-sm font-medium text-alert">{t('newProject.chooseType')}</p>}
          {type && !ADAPTED_PROMPTS.includes(type) && <Alert>{t('newProject.promptsInDevelopment')}</Alert>}
          <TextField
            label={t('newProject.name')}
            hint={t('newProject.nameHint')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={nameError}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label={t('auth.country')} optional value={country} onChange={(e) => setCountry(e.target.value)} />
            <TextField label={t('newProject.region')} optional value={region} onChange={(e) => setRegion(e.target.value)} />
          </div>
          <TextArea
            label={t('newProject.description')}
            optional
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <SelectField
            label={t('newProject.assessmentType')}
            value={assessmentType}
            onChange={(e) => setAssessmentType(e.target.value as AssessmentType)}
            options={ASSESSMENT_TYPES.map((a) => ({ value: a, label: t(`assessmentType.${a}`) }))}
          />
          <p className="text-sm text-muted">{t('newProject.youArePi')}</p>
          <div>
            <Button type="submit" busy={create.isPending} busyLabel={t('newProject.creating')}>
              {t('newProject.create')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
