import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { run, useTeam } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { useUptake } from '../../lib/phase6Api'
import { Button } from '../../ui/Button'
import { RadioGroup, SelectField, TextArea, TextField } from '../../ui/Field'
import { Alert, Card, Chip, EmptyState, Spinner } from '../../ui/Feedback'
import { useProjectContext } from '../project/ProjectLayout'

const USE_TYPES = ['instrumental', 'conceptual', 'symbolic']

/** T9 Knowledge translation & uptake (proposal behind a feature flag, brief §16.4). */
export default function UptakePage() {
  const { t } = useTranslation()
  const { project, myRoles, passed, userId } = useProjectContext()
  const qc = useQueryClient()
  const uptake = useUptake(project.id)
  const team = useTeam(project.id)
  const [error, setError] = useState<string | null>(null)
  const canEdit = (myRoles.includes('pi') || myRoles.includes('kt_lead')) && project.status !== 'closed'
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['uptake', project.id] }), qc.invalidateQueries({ queryKey: ['projects'] })])
  const act = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (!passed.includes('G6')) return <EmptyState title={t('uptake.notYet')}>{t('uptake.notYetBody')}</EmptyState>
  if (uptake.isLoading || !uptake.data) return <Spinner label={t('common.loading')} />
  const { products, response, actions, events } = uptake.data
  const members = [...new Map((team.data ?? []).map((m) => [m.user_id, m])).values()]
  const nameOf = (id: string | null) => members.find((m) => m.user_id === id)?.full_name ?? t('uptake.unassigned')
  const planActions = actions.filter((a) => !a.source_gate_review_id)
  const conditions = actions.filter((a) => a.source_gate_review_id)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold">{t('uptake.title')}</h2>
        <p className="text-muted">{t('uptake.intro')}</p>
        <p className="text-sm text-muted">{t('common.proposalNote')}</p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      <Card className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">{t('uptake.productsTitle')}</h3>
        {products.length === 0 ? <p className="text-muted">{t('uptake.noProducts')}</p> : (
          <ul className="flex flex-col gap-2">
            {products.map((p) => (
              <li key={p.id} className="rounded bg-canvas p-2">
                <strong>{p.format}</strong> {t('uptake.for')} {p.audience}
                {p.delivered_to && ` · ${t('uptake.deliveredTo', { who: p.delivered_to, date: p.delivered_on ?? '—' })}`}
              </li>
            ))}
          </ul>
        )}
        {canEdit && <ProductForm onSave={(v) => act(() => run(supabase.from('kt_products').insert({ project_id: project.id, ...v })))} />}
      </Card>

      <Card className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">{t('uptake.responseTitle')}</h3>
        {response && (
          <p>
            <Chip>{t(`uptake.responseType.${response.response_type}`)}</Chip> {response.summary}
            {response.follow_up_on && ` · ${t('uptake.followUpOn', { date: response.follow_up_on })}`}
          </p>
        )}
        {canEdit && (
          <ResponseForm
            initial={response}
            onSave={(v) => act(() => run(supabase.from('decision_responses').upsert({ project_id: project.id, ...v }, { onConflict: 'project_id' })))}
          />
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">{t('uptake.actionsTitle')}</h3>
        {[...planActions, ...conditions].length === 0 ? <p className="text-muted">{t('uptake.noActions')}</p> : (
          <ul className="flex flex-col gap-2">
            {[...planActions, ...conditions].map((a) => (
              <li key={a.id} className="flex flex-col gap-2 rounded bg-canvas p-2 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  {a.source_gate_review_id && <Chip>{t('uptake.gateCondition')}</Chip>} {a.description} · {nameOf(a.owner_id)}
                  {a.due_on && ` · ${t('uptake.due', { date: a.due_on })}`}
                </span>
                <span className="flex items-center gap-2">
                  <Chip tone={a.status === 'open' && a.due_on && a.due_on < new Date().toISOString().slice(0, 10) ? 'alert' : 'neutral'}>
                    {t(`uptake.status.${a.status}`)}
                  </Chip>
                  {(canEdit || a.owner_id === userId) && a.status === 'open' && (
                    <>
                      <Button variant="ghost" onClick={() => act(() => run(supabase.from('action_items').update({ status: 'done' }).eq('id', a.id)))}>{t('uptake.markDone')}</Button>
                      {canEdit && <Button variant="ghost" onClick={() => act(() => run(supabase.from('action_items').update({ status: 'cancelled' }).eq('id', a.id)))}>{t('uptake.cancel')}</Button>}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {canEdit && <ActionForm members={members.map((m) => ({ value: m.user_id, label: m.full_name ?? m.user_id }))} onSave={(v) => act(() => run(supabase.from('action_items').insert({ project_id: project.id, ...v })))} />}
      </Card>

      <Card className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">{t('uptake.eventsTitle')}</h3>
        <p className="text-muted">{t('uptake.eventsIntro')}</p>
        {events.length === 0 ? <p className="text-muted">{t('uptake.noEvents')}</p> : (
          <ul className="flex flex-col gap-2">
            {events.map((e) => (
              <li key={e.id} className="rounded bg-canvas p-2">
                {e.event_date} · {e.decision_body} · <Chip>{t(`uptake.useType.${e.use_type}`)}</Chip>
                {e.evidence_link && <> · <a className="text-primary underline" href={e.evidence_link} target="_blank" rel="noopener noreferrer">{t('uptake.evidenceLink')}</a></>}
              </li>
            ))}
          </ul>
        )}
        {canEdit && <EventForm onSave={(v) => act(() => run(supabase.from('uptake_events').insert({ project_id: project.id, ...v })))} />}
      </Card>
    </div>
  )
}

function ProductForm({ onSave }: { onSave: (v: Record<string, string | null>) => Promise<unknown> }) {
  const { t } = useTranslation()
  const [v, setV] = useState({ audience: '', format: '', delivered_to: '', delivered_on: '' })
  return (
    <form className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); await onSave({ ...v, delivered_on: v.delivered_on || null }); setV({ audience: '', format: '', delivered_to: '', delivered_on: '' }) }}>
      <TextField label={t('uptake.format')} hint={t('uptake.formatHint')} value={v.format} onChange={(e) => setV({ ...v, format: e.target.value })} />
      <TextField label={t('uptake.audience')} value={v.audience} onChange={(e) => setV({ ...v, audience: e.target.value })} />
      <TextField label={t('uptake.deliveredToLabel')} optional value={v.delivered_to} onChange={(e) => setV({ ...v, delivered_to: e.target.value })} />
      <TextField label={t('uptake.deliveredOn')} type="date" optional value={v.delivered_on} onChange={(e) => setV({ ...v, delivered_on: e.target.value })} />
      <div><Button type="submit" disabled={!v.format.trim()}>{t('uptake.addProduct')}</Button></div>
    </form>
  )
}

function ResponseForm({ initial, onSave }: { initial: { response_type: string; summary: string | null; follow_up_on: string | null } | null; onSave: (v: Record<string, string | null>) => Promise<unknown> }) {
  const { t } = useTranslation()
  const [v, setV] = useState({ response_type: initial?.response_type ?? null, summary: initial?.summary ?? '', follow_up_on: initial?.follow_up_on ?? '' })
  const reason = !v.response_type ? t('uptake.chooseResponse') : v.response_type === 'no_action' && !v.summary.trim() ? t('uptake.explainNoAction') : undefined
  return (
    <form className="flex flex-col gap-3 border-t border-line pt-3" onSubmit={async (e) => { e.preventDefault(); if (!reason) await onSave({ response_type: v.response_type, summary: v.summary || null, follow_up_on: v.follow_up_on || null }) }}>
      <RadioGroup legend={t('uptake.responseQuestion')} name="response" value={v.response_type} columns={2} onChange={(r) => setV({ ...v, response_type: r })}
        options={[{ value: 'action_plan', label: t('uptake.responseType.action_plan') }, { value: 'no_action', label: t('uptake.responseType.no_action') }]} />
      <TextArea label={t('uptake.summary')} optional={v.response_type !== 'no_action'} rows={2} value={v.summary} onChange={(e) => setV({ ...v, summary: e.target.value })} />
      <TextField label={t('uptake.followUpDate')} type="date" value={v.follow_up_on} onChange={(e) => setV({ ...v, follow_up_on: e.target.value })} />
      <div><Button id="save-response" type="submit" disabled={Boolean(reason)} disabledReason={reason}>{t('uptake.saveResponse')}</Button></div>
    </form>
  )
}

function ActionForm({ members, onSave }: { members: { value: string; label: string }[]; onSave: (v: Record<string, string | null>) => Promise<unknown> }) {
  const { t } = useTranslation()
  const [v, setV] = useState({ description: '', owner_id: '', due_on: '' })
  return (
    <form className="grid gap-3 border-t border-line pt-3 sm:grid-cols-3" onSubmit={async (e) => { e.preventDefault(); await onSave({ description: v.description.trim(), owner_id: v.owner_id || null, due_on: v.due_on || null }); setV({ description: '', owner_id: '', due_on: '' }) }}>
      <TextField label={t('uptake.action')} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
      <SelectField label={t('uptake.owner')} value={v.owner_id} placeholder={t('uptake.unassigned')} onChange={(e) => setV({ ...v, owner_id: e.target.value })} options={members} />
      <TextField label={t('uptake.dueDate')} type="date" optional value={v.due_on} onChange={(e) => setV({ ...v, due_on: e.target.value })} />
      <div><Button type="submit" disabled={!v.description.trim()}>{t('uptake.addAction')}</Button></div>
    </form>
  )
}

function EventForm({ onSave }: { onSave: (v: Record<string, string | null>) => Promise<unknown> }) {
  const { t } = useTranslation()
  const [v, setV] = useState({ event_date: '', decision_body: '', use_type: null as string | null, evidence_link: '' })
  return (
    <form className="flex flex-col gap-3 border-t border-line pt-3" onSubmit={async (e) => { e.preventDefault(); if (!v.event_date || !v.use_type) return; await onSave({ ...v, evidence_link: v.evidence_link || null }); setV({ event_date: '', decision_body: '', use_type: null, evidence_link: '' }) }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={t('uptake.eventDate')} type="date" value={v.event_date} onChange={(e) => setV({ ...v, event_date: e.target.value })} />
        <TextField label={t('uptake.decisionBody')} value={v.decision_body} onChange={(e) => setV({ ...v, decision_body: e.target.value })} />
      </div>
      <RadioGroup legend={t('uptake.useTypeQuestion')} name="use-type" value={v.use_type} columns={3} onChange={(u) => setV({ ...v, use_type: u })}
        options={USE_TYPES.map((u) => ({ value: u, label: t(`uptake.useType.${u}`), help: t(`uptake.useTypeHelp.${u}`) }))} />
      <TextField label={t('uptake.evidenceLink')} type="url" optional value={v.evidence_link} onChange={(e) => setV({ ...v, evidence_link: e.target.value })} />
      <div><Button type="submit" disabled={!v.event_date || !v.use_type}>{t('uptake.addEvent')}</Button></div>
    </form>
  )
}
