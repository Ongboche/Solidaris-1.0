import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { run } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { useSignals } from '../../lib/phase6Api'
import { useFramework } from '../../lib/workflowApi'
import { Button } from '../../ui/Button'
import { RadioGroup, SelectField, TextArea, TextField } from '../../ui/Field'
import { Alert, Card, Chip, EmptyState, Spinner } from '../../ui/Feedback'
import { useProjectContext } from '../project/ProjectLayout'

/**
 * T7 Anticipatory signals: logged observations and reassessment triggers only.
 * Never probabilities, forecasts or computed risk (invariant 10).
 */
export default function SignalsPage() {
  const { t } = useTranslation()
  const { project, myRoles } = useProjectContext()
  const qc = useQueryClient()
  const framework = useFramework(project.framework_version_id)
  const signals = useSignals(project.subjects.id, project.framework_version_id)
  const [error, setError] = useState<string | null>(null)
  const [v, setV] = useState({ domain_id: '', observed_on: '', source: '', description: '', level: null as 'watch' | 'act' | null })
  const canLog = ['pi', 'assessor', 'kt_lead'].some((r) => myRoles.includes(r as never)) && project.status !== 'closed'
  const isPi = myRoles.includes('pi')

  if (framework.isLoading || signals.isLoading || !signals.data) return <Spinner label={t('common.loading')} />
  const domains = framework.data?.domains ?? []
  const name = (id: string) => {
    const d = domains.find((x) => x.id === id)
    return d ? `${d.code} ${d.name}` : '?'
  }
  const act = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      await qc.invalidateQueries({ queryKey: ['signals', project.subjects.id] })
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const actNow = signals.data.observations.filter((o) => o.level === 'act' && !o.reviewed_at)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold">{t('signals.title')}</h2>
        <p className="text-muted">{t('signals.intro')}</p>
        <p className="text-sm text-muted">{t('common.proposalNote')}</p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {actNow.length > 0 && <Alert tone="error" title={t('signals.actTitle')}>{t('signals.actBody', { count: actNow.length })}</Alert>}

      <section aria-labelledby="obs" className="flex flex-col gap-3">
        <h3 id="obs" className="text-lg font-semibold">{t('signals.logTitle')}</h3>
        {signals.data.observations.length === 0 ? <EmptyState title={t('signals.none')} /> : (
          <ul className="flex flex-col gap-2">
            {signals.data.observations.map((o) => (
              <li key={o.id} className="flex flex-col gap-2 rounded border border-line bg-panel p-3 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  <Chip tone={o.level === 'act' ? 'alert' : 'neutral'}>{t(`signals.level.${o.level}`)}</Chip> {name(o.domain_id)} · {o.observed_on} — {o.description}
                  {o.source && <span className="text-muted"> ({o.source})</span>}
                </span>
                {o.reviewed_at ? (
                  <Chip>{t('signals.reviewed')}</Chip>
                ) : isPi && o.project_id === project.id ? (
                  <Button variant="secondary" onClick={() => act(() => run(supabase.from('signal_observations').update({ reviewed_at: new Date().toISOString() }).eq('id', o.id)))}>
                    {t('signals.markReviewed')}
                  </Button>
                ) : (
                  <Chip tone="alert">{t('signals.notReviewed')}</Chip>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canLog && (
        <Card>
          <form
            className="flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!v.domain_id || !v.observed_on || !v.description.trim() || !v.level) return
              await act(() => run(supabase.from('signal_observations').insert({ ...v, source: v.source || null, subject_id: project.subjects.id, project_id: project.id })))
              setV({ domain_id: '', observed_on: '', source: '', description: '', level: null })
            }}
          >
            <h3 className="text-lg font-semibold">{t('signals.add')}</h3>
            <SelectField label={t('evidence.domain')} value={v.domain_id} placeholder={t('assessment.choose')} onChange={(e) => setV({ ...v, domain_id: e.target.value })} options={domains.map((d) => ({ value: d.id, label: `${d.code} ${d.name}` }))} />
            {v.domain_id && (
              <p className="text-sm text-muted">
                {t('signals.lookFor')}: {signals.data.definitions.filter((d) => d.domain_id === v.domain_id).map((d) => d.description).join('; ')}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label={t('signals.observedOn')} type="date" value={v.observed_on} onChange={(e) => setV({ ...v, observed_on: e.target.value })} />
              <TextField label={t('evidence.source')} optional value={v.source} onChange={(e) => setV({ ...v, source: e.target.value })} />
            </div>
            <TextArea label={t('signals.whatHappened')} rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
            <RadioGroup legend={t('signals.levelQuestion')} name="signal-level" value={v.level} columns={2} onChange={(l) => setV({ ...v, level: l as 'watch' | 'act' })}
              options={(['watch', 'act'] as const).map((l) => ({ value: l, label: t(`signals.level.${l}`), help: t(`signals.levelHelp.${l}`) }))} />
            <div>
              <Button type="submit" disabled={!v.domain_id || !v.observed_on || !v.description.trim() || !v.level}>{t('signals.save')}</Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  )
}
