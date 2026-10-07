import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { run } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { Button } from '../../ui/Button'
import { TextField } from '../../ui/Field'
import { Alert, Card, EmptyState, Spinner } from '../../ui/Feedback'

export default function InstitutionsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const list = useQuery({
    queryKey: ['institutions-full'],
    queryFn: async () => (await run(supabase.from('institutions').select('id, name, country, type').order('name'))) as { id: string; name: string; country: string | null; type: string | null }[],
  })
  const [v, setV] = useState({ name: '', country: '', type: '' })
  const [error, setError] = useState<string | null>(null)
  if (list.isLoading) return <Spinner label={t('common.loading')} />
  return (
    <div className="flex flex-col gap-4">
      {error && <Alert tone="error">{error}</Alert>}
      {(list.data ?? []).length === 0 ? <EmptyState title={t('admin.noInstitutions')} /> : (
        <ul className="flex flex-col gap-2">
          {list.data!.map((i) => <li key={i.id} className="rounded border border-line bg-panel p-3"><strong>{i.name}</strong> {[i.type, i.country].filter(Boolean).join(' · ')}</li>)}
        </ul>
      )}
      <Card>
        <form className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end" onSubmit={async (e) => {
          e.preventDefault()
          if (!v.name.trim()) return
          setError(null)
          try {
            await run(supabase.from('institutions').insert({ name: v.name.trim(), country: v.country || null, type: v.type || null }))
            setV({ name: '', country: '', type: '' })
            await Promise.all([qc.invalidateQueries({ queryKey: ['institutions-full'] }), qc.invalidateQueries({ queryKey: ['institutions'] })])
          } catch (err) {
            setError((err as Error).message)
          }
        }}>
          <TextField label={t('admin.institutionName')} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          <TextField label={t('auth.country')} optional value={v.country} onChange={(e) => setV({ ...v, country: e.target.value })} />
          <TextField label={t('admin.institutionType')} optional hint={t('admin.institutionTypeHint')} value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })} />
          <Button type="submit" disabled={!v.name.trim()}>{t('admin.addInstitution')}</Button>
        </form>
      </Card>
    </div>
  )
}
