import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { run } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { Button } from '../../ui/Button'
import { Alert, Card, Spinner } from '../../ui/Feedback'
import { ScrollArea } from '../../ui/ScrollArea'

/** Audit log (invariant 8): read-only, with a check that the hash chain is intact. */
export default function AuditPage() {
  const { t } = useTranslation()
  const log = useQuery({
    queryKey: ['audit-recent'],
    queryFn: async () => (await run(supabase.from('audit_log').select('id, at, actor_id, action, entity, entity_id, flags').order('id', { ascending: false }).limit(50))) as {
      id: number; at: string; actor_id: string | null; action: string; entity: string; entity_id: string | null; flags: string[]
    }[],
  })
  const [result, setResult] = useState<{ valid: boolean; entries: number; first_broken_id?: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('audit.verifyTitle')}</h2>
        <p className="text-muted">{t('audit.verifyIntro')}</p>
        {error && <Alert tone="error">{error}</Alert>}
        {result && (
          <Alert tone={result.valid ? 'success' : 'error'}>
            {result.valid ? t('audit.valid', { count: result.entries }) : t('audit.broken', { id: result.first_broken_id })}
          </Alert>
        )}
        <div>
          <Button busy={busy} onClick={async () => {
            setBusy(true); setError(null)
            try { setResult((await run(supabase.rpc('verify_audit_chain'))) as typeof result) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
          }}>{t('audit.verify')}</Button>
        </div>
      </Card>
      <h2 className="text-lg font-semibold">{t('audit.recent')}</h2>
      {log.isLoading ? <Spinner label={t('common.loading')} /> : (
        <ScrollArea label={t('audit.recent')} className="rounded border border-line bg-panel">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr><th scope="col" className="p-2">#</th><th scope="col" className="p-2">{t('audit.when')}</th><th scope="col" className="p-2">{t('audit.action')}</th><th scope="col" className="p-2">{t('audit.record')}</th><th scope="col" className="p-2">{t('audit.by')}</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(log.data ?? []).map((e) => (
                <tr key={e.id}>
                  <td className="p-2">{e.id}</td>
                  <td className="p-2">{new Date(e.at).toLocaleString()}</td>
                  <td className="p-2">{e.action}{e.flags.length ? ` (${e.flags.join(', ')})` : ''}</td>
                  <td className="p-2">{e.entity}</td>
                  <td className="p-2 font-mono text-xs">{e.actor_id?.slice(0, 8) ?? t('audit.system')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      )}
    </div>
  )
}
