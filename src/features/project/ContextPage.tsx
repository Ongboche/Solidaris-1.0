import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { keys, saveContextProfile, useActorMutations } from '../../lib/api'
import type { ActorCategory, ContextProfile, Level } from '../../lib/types'
import { useAutosave } from '../../lib/useAutosave'
import { Button } from '../../ui/Button'
import { SelectField, TextArea, TextField } from '../../ui/Field'
import { Alert, Card, Chip, EmptyState } from '../../ui/Feedback'
import { SaveStatus } from '../../ui/SaveStatus'
import { Term } from '../../ui/Term'
import { useProjectContext } from './ProjectLayout'
import { ACTOR_CATEGORIES, missingActorCategories } from './snapshot'

type Fields = Omit<ContextProfile, 'project_id'>
const LEVELS: Level[] = ['low', 'medium', 'high']

/** T2 Context profiler: financing, governance, population, community voice, and the actor map. */
export default function ContextPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { project, isPi } = useProjectContext()
  const editable = isPi && ['draft', 'scoping', 'context'].includes(project.status)
  const autosave = useAutosave<Fields>({
    backupKey: `context:${project.id}`,
    save: async (v) => {
      await saveContextProfile(project.id, v)
      await qc.invalidateQueries({ queryKey: keys.project(project.id) })
    },
  })
  const [values, setValues] = useState<Fields>(() => {
    // Only the editable columns go back to the server (never id, created_by, timestamps).
    const merged: Partial<Fields> = { ...(project.context_profiles ?? {}), ...(editable ? (autosave.backup() ?? {}) : {}) }
    return {
      financing: merged.financing ?? '',
      governance: merged.governance ?? '',
      target_population: merged.target_population ?? '',
      community_voice_plan: merged.community_voice_plan ?? '',
    }
  })
  const set = (key: keyof Fields, value: string) => {
    const next = { ...values, [key]: value }
    setValues(next)
    autosave.queue(next)
  }

  const actors = useActorMutations(project.id)
  const [actor, setActor] = useState({ category: 'funder' as ActorCategory, name: '', role: '', influence: '' as Level | '', participation_level: '' })
  const missing = missingActorCategories(project)

  const addActor = (e: React.FormEvent) => {
    e.preventDefault()
    if (!actor.name.trim()) return
    actors.add.mutate(
      {
        category: actor.category,
        name: actor.name.trim(),
        role: actor.role || null,
        influence: actor.influence || null,
        participation_level: actor.participation_level || null,
      },
      { onSuccess: () => setActor({ ...actor, name: '', role: '', participation_level: '' }) },
    )
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold">{t('context.title')}</h2>
        <p className="text-muted">{t('context.intro')}</p>
      </div>
      {!editable && <Alert>{isPi ? t('context.lockedAfterG1') : t('common.readOnlyPi')}</Alert>}
      <Card className="flex flex-col gap-4">
        <TextArea label={t('context.financing')} hint={t('context.financingHint')} readOnly={!editable} value={values.financing ?? ''} onChange={(e) => set('financing', e.target.value)} />
        <TextArea label={t('context.governance')} hint={t('context.governanceHint')} readOnly={!editable} value={values.governance ?? ''} onChange={(e) => set('governance', e.target.value)} />
        <TextArea label={t('context.population')} hint={t('context.populationHint')} readOnly={!editable} value={values.target_population ?? ''} onChange={(e) => set('target_population', e.target.value)} />
        <TextArea
          label={t('context.voicePlan')}
          hint={t('context.voicePlanHint')}
          readOnly={!editable}
          value={values.community_voice_plan ?? ''}
          onChange={(e) => set('community_voice_plan', e.target.value)}
        />
        {editable && <SaveStatus state={autosave.state} />}
      </Card>

      <section aria-labelledby="actor-title" className="flex flex-col gap-3">
        <h2 id="actor-title" className="text-xl font-semibold">
          <Term term="actorMap">{t('context.actorsTitle')}</Term>
        </h2>
        {missing.length > 0 ? (
          <Alert>{t('context.actorsMissing', { categories: missing.map((c) => t(`actorCategory.${c}`)).join(', ') })}</Alert>
        ) : (
          <Alert tone="success">{t('context.actorsComplete')}</Alert>
        )}
        {actors.remove.error && <Alert tone="error">{actors.remove.error.message}</Alert>}
        {project.actors.length === 0 ? (
          <EmptyState title={t('context.noActors')}>{t('context.noActorsBody')}</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded border border-line bg-panel">
            <table className="w-full text-left">
              <caption className="sr-only">{t('context.actorsTitle')}</caption>
              <thead className="border-b border-line text-sm text-muted">
                <tr>
                  <th scope="col" className="p-3">{t('context.actorName')}</th>
                  <th scope="col" className="p-3">{t('context.category')}</th>
                  <th scope="col" className="p-3">{t('context.actorRole')}</th>
                  <th scope="col" className="p-3">{t('context.influence')}</th>
                  <th scope="col" className="p-3">{t('context.participation')}</th>
                  {editable && <th scope="col" className="p-3"><span className="sr-only">{t('context.actions')}</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {project.actors.map((a) => (
                  <tr key={a.id}>
                    <td className="p-3 font-medium">{a.name}</td>
                    <td className="p-3"><Chip>{t(`actorCategory.${a.category}`)}</Chip></td>
                    <td className="p-3">{a.role}</td>
                    <td className="p-3">{a.influence ? t(`level.${a.influence}`) : ''}</td>
                    <td className="p-3">{a.participation_level}</td>
                    {editable && (
                      <td className="p-3">
                        <Button variant="ghost" onClick={() => actors.remove.mutate(a.id)} aria-label={t('context.removeActor', { name: a.name })}>
                          <Trash2 aria-hidden className="h-4 w-4" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {editable && (
          <Card>
            <form noValidate onSubmit={addActor} className="flex flex-col gap-4">
              <h3 className="font-semibold">{t('context.addActor')}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label={t('context.category')}
                  value={actor.category}
                  onChange={(e) => setActor({ ...actor, category: e.target.value as ActorCategory })}
                  options={ACTOR_CATEGORIES.map((c) => ({ value: c, label: t(`actorCategory.${c}`) }))}
                />
                <TextField label={t('context.actorName')} value={actor.name} onChange={(e) => setActor({ ...actor, name: e.target.value })} />
                <TextField label={t('context.actorRole')} optional value={actor.role} onChange={(e) => setActor({ ...actor, role: e.target.value })} />
                <SelectField
                  label={t('context.influence')}
                  value={actor.influence}
                  placeholder={t('context.notSet')}
                  onChange={(e) => setActor({ ...actor, influence: e.target.value as Level | '' })}
                  options={LEVELS.map((l) => ({ value: l, label: t(`level.${l}`) }))}
                />
                <TextField label={t('context.participation')} optional hint={t('context.participationHint')} value={actor.participation_level} onChange={(e) => setActor({ ...actor, participation_level: e.target.value })} />
              </div>
              {actors.add.error && <Alert tone="error">{actors.add.error.message}</Alert>}
              <div>
                <Button type="submit" busy={actors.add.isPending} disabled={!actor.name.trim()} disabledReason={t('context.nameNeeded')} id="add-actor">
                  {t('context.addActorButton')}
                </Button>
              </div>
            </form>
          </Card>
        )}
      </section>
      {project.status === 'context' && isPi && (
        <p>
          <Link className="text-primary underline" to="../gates/G1">
            {t('context.goToGate')}
          </Link>
        </p>
      )}
    </div>
  )
}
