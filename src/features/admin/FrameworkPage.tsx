import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { run } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { useFramework } from '../../lib/workflowApi'
import { Button } from '../../ui/Button'
import { Checkbox, SelectField, TextArea, TextField } from '../../ui/Field'
import { Alert, Card, Chip, Spinner } from '../../ui/Feedback'

interface Version { id: string; label: string; status: 'draft' | 'published' | 'retired'; published_at: string | null; created_at: string }

/** Framework versions (invariant 9): copy to a draft, edit the draft, publish. Published versions never change. */
export default function FrameworkPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const versions = useQuery({
    queryKey: ['framework-versions'],
    queryFn: async () => (await run(supabase.from('framework_versions').select('id, label, status, published_at, created_at').order('created_at'))) as Version[],
  })
  const lessons = useQuery({
    queryKey: ['framework-lessons'],
    queryFn: async () => (await run(supabase.from('framework_lessons').select('id, lesson, created_at, framework_version_id').order('created_at', { ascending: false }))) as { id: string; lesson: string; created_at: string; framework_version_id: string }[],
  })
  const [from, setFrom] = useState('')
  const [label, setLabel] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['framework-versions'] })
  const act = async (fn: () => Promise<unknown>) => {
    setError(null)
    try { await fn(); await refresh() } catch (e) { setError((e as Error).message) }
  }

  if (versions.isLoading) return <Spinner label={t('common.loading')} />
  const list = versions.data ?? []

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted">{t('framework.intro')}</p>
      {error && <Alert tone="error">{error}</Alert>}
      <ul className="flex flex-col gap-2">
        {list.map((v) => (
          <li key={v.id} className="flex flex-col gap-2 rounded border border-line bg-panel p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span><strong>{v.label}</strong> <Chip>{t(`framework.status.${v.status}`)}</Chip>{v.published_at && <span className="text-sm text-muted"> · {t('framework.publishedOn', { date: new Date(v.published_at).toLocaleDateString() })}</span>}</span>
              <span className="flex flex-wrap gap-2">
                {v.status === 'draft' && <Button variant="secondary" onClick={() => setEditing(editing === v.id ? null : v.id)}>{editing === v.id ? t('framework.closeEditor') : t('framework.edit')}</Button>}
                {v.status === 'draft' && <Button variant="secondary" onClick={() => setConfirm(v.id)}>{t('framework.publish')}</Button>}
                {v.status === 'published' && <Button variant="ghost" onClick={() => act(() => run(supabase.from('framework_versions').update({ status: 'retired' }).eq('id', v.id)))}>{t('framework.retire')}</Button>}
              </span>
            </div>
            {confirm === v.id && (
              <Alert title={t('framework.confirmTitle', { label: v.label })}>
                <p className="mb-2">{t('framework.confirmBody')}</p>
                <div className="flex gap-2">
                  <Button onClick={() => act(async () => { await run(supabase.from('framework_versions').update({ status: 'published' }).eq('id', v.id)); setConfirm(null); setEditing(null) })}>{t('framework.publishNow')}</Button>
                  <Button variant="secondary" onClick={() => setConfirm(null)}>{t('framework.cancel')}</Button>
                </div>
              </Alert>
            )}
            {editing === v.id && <DraftEditor versionId={v.id} />}
          </li>
        ))}
      </ul>

      <Card>
        <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={(e) => {
          e.preventDefault()
          if (!from || !label.trim()) return
          void act(async () => { await run(supabase.rpc('clone_framework_version', { p_from: from, p_label: label.trim() })); setLabel('') })
        }}>
          <SelectField label={t('framework.copyFrom')} value={from} placeholder={t('assessment.choose')} onChange={(e) => setFrom(e.target.value)} options={list.map((v) => ({ value: v.id, label: v.label }))} />
          <TextField label={t('framework.newLabel')} hint={t('framework.newLabelHint')} value={label} onChange={(e) => setLabel(e.target.value)} />
          <Button type="submit" disabled={!from || !label.trim()}>{t('framework.createDraft')}</Button>
        </form>
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{t('framework.lessonsTitle')}</h2>
        {(lessons.data ?? []).length === 0 ? <p className="text-muted">{t('learning.noLessons')}</p> : (
          <ul className="list-disc pl-6">{lessons.data!.map((l) => <li key={l.id}>{l.lesson} <span className="text-sm text-muted">({list.find((v) => v.id === l.framework_version_id)?.label})</span></li>)}</ul>
        )}
      </Card>
    </div>
  )
}

function DraftEditor({ versionId }: { versionId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const framework = useFramework(versionId)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  if (framework.isLoading || !framework.data) return <Spinner label={t('common.loading')} />
  const save = async (table: 'domains' | 'indicators' | 'rating_levels', id: string, patch: Record<string, unknown>, key = 'id') => {
    setError(null)
    try {
      await run(supabase.from(table).update(patch).eq(key, id))
      setStatus(t('common.saved'))
      await qc.invalidateQueries({ queryKey: ['framework', versionId] })
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <div className="flex flex-col gap-4 border-t border-line pt-3">
      {error && <Alert tone="error">{error}</Alert>}
      {status && <p role="status" className="text-sm text-muted">{status}</p>}
      <p className="text-sm text-muted">{t('framework.editorHint')}</p>
      {framework.data.domains.map((d) => (
        <details key={d.id} className="rounded border border-line p-3">
          <summary className="cursor-pointer font-medium">{d.code} {d.name}</summary>
          <div className="mt-3 flex flex-col gap-3">
            <TextField label={t('framework.domainName')} defaultValue={d.name} onBlur={(e) => e.target.value !== d.name && save('domains', d.id, { name: e.target.value })} />
            <TextArea label={t('framework.keyQuestion')} optional rows={2} defaultValue={d.key_question ?? ''} onBlur={(e) => save('domains', d.id, { key_question: e.target.value || null })} />
            <TextArea label={t('assessment.goodEvidence')} rows={2} defaultValue={d.evidence_to_look_for ?? ''} onBlur={(e) => save('domains', d.id, { evidence_to_look_for: e.target.value })} />
            <TextArea label={t('assessment.redFlags')} rows={2} defaultValue={d.red_flags ?? ''} onBlur={(e) => save('domains', d.id, { red_flags: e.target.value })} />
            {d.indicators.map((i, n) => (
              <div key={i.id} className="flex flex-col gap-2 border-t border-line pt-2">
                <TextArea label={t('framework.prompt', { n: n + 1 })} rows={2} defaultValue={i.prompt} onBlur={(e) => e.target.value !== i.prompt && save('indicators', i.id, { prompt: e.target.value })} />
                <TextArea label={t('framework.guidance')} optional rows={2} defaultValue={i.guidance ?? ''} onBlur={(e) => save('indicators', i.id, { guidance: e.target.value || null })} />
                <fieldset className="flex flex-wrap gap-3">
                  <legend className="text-sm font-medium">{t('framework.subjectTypes')}</legend>
                  {['project', 'programme', 'portfolio', 'investment', 'policy'].map((s) => (
                    <Checkbox key={s} label={t(`subjectType.${s}`)} defaultChecked={!i.subject_types || i.subject_types.includes(s)}
                      onChange={(e) => {
                        const current = i.subject_types ?? ['project', 'programme', 'portfolio', 'investment', 'policy']
                        const next = e.target.checked ? [...new Set([...current, s])] : current.filter((x) => x !== s)
                        void save('indicators', i.id, { subject_types: next.length === 5 ? null : next })
                      }} />
                  ))}
                </fieldset>
              </div>
            ))}
          </div>
        </details>
      ))}
      <details className="rounded border border-line p-3">
        <summary className="cursor-pointer font-medium">{t('framework.ratingScale')}</summary>
        <div className="mt-3 flex flex-col gap-3">
          {framework.data.ratingLevels.map((l) => (
            <div key={l.value} className="grid gap-2 sm:grid-cols-2">
              <TextField label={t('framework.levelLabel', { n: l.value })} defaultValue={l.label} onBlur={(e) => e.target.value !== l.label && run(supabase.from('rating_levels').update({ label: e.target.value }).eq('framework_version_id', versionId).eq('value', l.value)).then(() => setStatus(t('common.saved')), (er: Error) => setError(er.message))} />
              <TextField label={t('framework.levelDescriptor', { n: l.value })} optional defaultValue={l.descriptor ?? ''} onBlur={(e) => run(supabase.from('rating_levels').update({ descriptor: e.target.value || null }).eq('framework_version_id', versionId).eq('value', l.value)).then(() => setStatus(t('common.saved')), (er: Error) => setError(er.message))} />
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}
