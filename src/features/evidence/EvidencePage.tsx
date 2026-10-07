import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, FileUp } from 'lucide-react'
import { createEvidence, createGap, openEvidence, useEvidence, useFramework, useInvalidateWorkflow } from '../../lib/workflowApi'
import { Button } from '../../ui/Button'
import { Checkbox, SelectField, TextArea, TextField } from '../../ui/Field'
import { Alert, Card, Chip, EmptyState, Spinner } from '../../ui/Feedback'
import { useProjectContext } from '../project/ProjectLayout'
import { ScrollArea } from '../../ui/ScrollArea'

export const EVIDENCE_TYPES = ['document', 'interview', 'fgd', 'observation', 'admin_data', 'literature', 'financial', 'media', 'other']
export const ORIGINS = ['community', 'government', 'funder', 'implementer', 'independent']
const SOURCE_TYPES = ['primary', 'secondary', 'grey_literature', 'peer_reviewed', 'government_document', 'internal_document', 'media', 'website']
const LEVELS = ['public', 'restricted', 'confidential', 'highly_confidential']
const MAX_MB = 25

/** T5 Evidence repository: upload or link evidence, tag it to domains, log gaps (brief §4.3). */
export default function EvidencePage() {
  const { t } = useTranslation()
  const { project, myRoles } = useProjectContext()
  const canAdd = (myRoles.includes('pi') || myRoles.includes('assessor')) && project.status !== 'closed'
  const framework = useFramework(project.framework_version_id)
  const evidence = useEvidence(project.id)
  const invalidate = useInvalidateWorkflow(project.id)
  const [error, setError] = useState<string | null>(null)

  if (framework.isLoading || evidence.isLoading) return <Spinner label={t('common.loading')} />
  const domains = framework.data?.domains ?? []
  const { items = [], gaps = [] } = evidence.data ?? {}
  const code = (id: string) => domains.find((d) => d.id === id)?.code ?? '?'

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold">{t('evidence.title')}</h2>
        <p className="text-muted">{t('evidence.intro')}</p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      <section aria-labelledby="coverage" className="flex flex-col gap-2">
        <h3 id="coverage" className="text-lg font-semibold">
          {t('evidence.coverage')}
        </h3>
        <ScrollArea label={t('evidence.coverage')} className="rounded border border-line bg-panel">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="p-2">{t('evidence.domain')}</th>
                <th scope="col" className="p-2">{t('evidence.items')}</th>
                <th scope="col" className="p-2">{t('evidence.communityItems')}</th>
                <th scope="col" className="p-2">{t('evidence.gaps')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {domains.map((d) => {
                const linked = items.filter((i) => i.links.some((l) => l.domain_id === d.id))
                const n = linked.length
                const g = gaps.filter((x) => x.domain_id === d.id).length
                return (
                  <tr key={d.id}>
                    <th scope="row" className="p-2 font-medium">
                      {d.code} {d.name}
                    </th>
                    <td className="p-2">{n}</td>
                    <td className="p-2">{linked.filter((i) => i.origin === 'community').length}</td>
                    <td className="p-2">
                      {g}
                      {n + g === 0 && <span className="ml-2 text-alert">{t('evidence.nothingYet')}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </ScrollArea>
      </section>

      <section aria-labelledby="items" className="flex flex-col gap-3">
        <h3 id="items" className="text-lg font-semibold">
          {t('evidence.register')}
        </h3>
        {items.length === 0 ? (
          <EmptyState title={t('evidence.none')}>{t('evidence.noneBody')}</EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((i) => (
              <li key={i.id} className="flex flex-col gap-2 rounded border border-line bg-panel p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{i.title}</span>
                  <span className="flex flex-wrap gap-1 text-sm">
                    <Chip>{t(`evidenceType.${i.type}`)}</Chip>
                    <Chip>{t(`origin.${i.origin}`)}</Chip>
                    <Chip>{t(`confidentiality.${i.confidentiality}`)}</Chip>
                    {i.links.map((l) => (
                      <Chip key={l.domain_id}>{code(l.domain_id)}</Chip>
                    ))}
                  </span>
                </div>
                <Button variant="ghost" onClick={() => openEvidence(i).catch((e: Error) => setError(e.message))}>
                  <ExternalLink aria-hidden className="h-4 w-4" /> {t('evidence.open')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canAdd && <AddEvidenceForm domains={domains} onAdded={invalidate} projectId={project.id} />}

      <section aria-labelledby="gaps" className="flex flex-col gap-3">
        <h3 id="gaps" className="text-lg font-semibold">
          {t('evidence.gapsTitle')}
        </h3>
        <p className="text-muted">{t('evidence.gapsIntro')}</p>
        {gaps.length === 0 ? (
          <EmptyState title={t('evidence.noGaps')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {gaps.map((g) => (
              <li key={g.id} className="rounded border border-line bg-panel p-3">
                <span className="font-medium">{code(g.domain_id)}</span> — {g.description}
                {g.effect_on_confidence && <span className="text-muted"> · {g.effect_on_confidence}</span>}
              </li>
            ))}
          </ul>
        )}
        {canAdd && <AddGapForm domains={domains} projectId={project.id} onAdded={invalidate} />}
      </section>
    </div>
  )
}

function AddEvidenceForm({ domains, projectId, onAdded }: { domains: { id: string; code: string; name: string }[]; projectId: string; onAdded: () => unknown }) {
  const { t } = useTranslation()
  const empty = { title: '', type: 'document', origin: 'government', source: '', source_type: '', evidence_date: '', confidentiality: 'restricted', description: '', url: '' }
  const [v, setV] = useState(empty)
  const [file, setFile] = useState<File | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const tooBig = file && file.size > MAX_MB * 1024 * 1024
  const reason = !v.title.trim()
    ? t('evidence.needTitle')
    : !file && !v.url.trim()
      ? t('evidence.needFileOrLink')
      : tooBig
        ? t('evidence.tooBig', { mb: MAX_MB })
        : undefined

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (reason) return
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      await createEvidence(projectId, { ...v, source_type: v.source_type || null, evidence_date: v.evidence_date || null, url: v.url.trim() || null, file, domainIds: tags })
      setV(empty)
      setFile(null)
      setTags([])
      setDone(true)
      await onAdded()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold">{t('evidence.add')}</h3>
        <TextField label={t('evidence.titleField')} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label={t('evidence.type')} value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })} options={EVIDENCE_TYPES.map((x) => ({ value: x, label: t(`evidenceType.${x}`) }))} />
          <SelectField label={t('evidence.origin')} value={v.origin} onChange={(e) => setV({ ...v, origin: e.target.value })} options={ORIGINS.map((x) => ({ value: x, label: t(`origin.${x}`) }))} />
          <SelectField label={t('evidence.sourceType')} value={v.source_type} placeholder={t('context.notSet')} onChange={(e) => setV({ ...v, source_type: e.target.value })} options={SOURCE_TYPES.map((x) => ({ value: x, label: t(`sourceType.${x}`) }))} />
          <SelectField label={t('evidence.confidentialityLabel')} value={v.confidentiality} onChange={(e) => setV({ ...v, confidentiality: e.target.value })} options={LEVELS.map((x) => ({ value: x, label: t(`confidentiality.${x}`) }))} />
          <TextField label={t('evidence.source')} optional value={v.source} onChange={(e) => setV({ ...v, source: e.target.value })} />
          <TextField label={t('evidence.date')} optional type="date" value={v.evidence_date} onChange={(e) => setV({ ...v, evidence_date: e.target.value })} />
        </div>
        <p className="text-sm text-muted">{t(`confidentialityHelp.${v.confidentiality}`)}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="evidence-file" className="font-medium">
              <FileUp aria-hidden className="mr-1 inline h-4 w-4" />
              {t('evidence.file')}
            </label>
            <input id="evidence-file" type="file" className="min-h-11" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <span className="text-sm text-muted">{t('evidence.fileHint', { mb: MAX_MB })}</span>
          </div>
          <TextField label={t('evidence.link')} type="url" disabled={Boolean(file)} hint={t('evidence.linkHint')} value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} />
        </div>
        <TextArea label={t('evidence.description')} optional rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
        <fieldset className="flex flex-col gap-2">
          <legend className="font-medium">{t('evidence.tagDomains')}</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {domains.map((d) => (
              <Checkbox
                key={d.id}
                label={`${d.code} ${d.name}`}
                checked={tags.includes(d.id)}
                onChange={(e) => setTags(e.target.checked ? [...tags, d.id] : tags.filter((x) => x !== d.id))}
              />
            ))}
          </div>
        </fieldset>
        {error && <Alert tone="error">{error}</Alert>}
        {done && <Alert tone="success">{t('evidence.added')}</Alert>}
        <div>
          <Button id="add-evidence" type="submit" busy={busy} disabled={Boolean(reason)} disabledReason={reason}>
            {t('evidence.addButton')}
          </Button>
        </div>
      </form>
    </Card>
  )
}

function AddGapForm({ domains, projectId, onAdded }: { domains: { id: string; code: string; name: string }[]; projectId: string; onAdded: () => unknown }) {
  const { t } = useTranslation()
  const [domain, setDomain] = useState(domains[0]?.id ?? '')
  const [description, setDescription] = useState('')
  const [effect, setEffect] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <Card>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!description.trim()) return
          setBusy(true)
          try {
            await createGap(projectId, { domain_id: domain, description: description.trim(), effect_on_confidence: effect.trim() })
            setDescription('')
            setEffect('')
            await onAdded()
          } catch (err) {
            setError((err as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        <h3 className="font-semibold">{t('evidence.logGap')}</h3>
        <SelectField label={t('evidence.domain')} value={domain} onChange={(e) => setDomain(e.target.value)} options={domains.map((d) => ({ value: d.id, label: `${d.code} ${d.name}` }))} />
        <TextArea label={t('evidence.gapDescription')} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        <TextField label={t('evidence.gapEffect')} hint={t('evidence.gapEffectHint')} value={effect} onChange={(e) => setEffect(e.target.value)} />
        {error && <Alert tone="error">{error}</Alert>}
        <div>
          <Button id="add-gap" type="submit" busy={busy} disabled={!description.trim()} disabledReason={t('evidence.needGapDescription')}>
            {t('evidence.logGapButton')}
          </Button>
        </div>
      </form>
    </Card>
  )
}
