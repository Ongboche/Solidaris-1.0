import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { run } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../app/auth'
import { Button } from '../../ui/Button'
import { SelectField } from '../../ui/Field'
import { Alert, Chip, Spinner } from '../../ui/Feedback'

interface UserRow {
  id: string
  full_name: string | null
  email: string | null
  institution_id: string | null
  institution_name: string | null
  platform_role: 'platform_admin' | 'institution_admin' | 'member'
  created_at: string
}

const ROLES = ['member', 'institution_admin', 'platform_admin'] as const

/** Users (brief §7). Roles change only here, never by users themselves. */
export default function UsersPage() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const qc = useQueryClient()
  const isPlatform = profile?.platform_role === 'platform_admin'
  const users = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => (await run(supabase.from('profiles').select('id, full_name, email, institution_id, institution_name, platform_role, created_at').order('created_at', { ascending: false }))) as UserRow[],
  })
  const institutions = useQuery({
    queryKey: ['institutions'],
    queryFn: async () => (await run(supabase.from('institutions').select('id, name').order('name'))) as { id: string; name: string }[],
  })
  const [edits, setEdits] = useState<Record<string, { role: string; institution: string }>>({})
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  if (users.isLoading) return <Spinner label={t('common.loading')} />

  const save = async (u: UserRow) => {
    const e = edits[u.id]!
    setError(null)
    try {
      await run(supabase.rpc('admin_set_user', { p_user: u.id, p_role: e.role, p_institution: e.institution || null }))
      setSaved(u.id)
      await qc.invalidateQueries({ queryKey: ['admin-users'] })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted">{t('admin.usersIntro')}</p>
      {error && <Alert tone="error">{error}</Alert>}
      <ul className="flex flex-col gap-2">
        {(users.data ?? []).map((u) => {
          const e = edits[u.id] ?? { role: u.platform_role, institution: u.institution_id ?? '' }
          const dirty = e.role !== u.platform_role || e.institution !== (u.institution_id ?? '')
          return (
            <li key={u.id} className="flex flex-col gap-3 rounded border border-line bg-panel p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-medium">{u.full_name ?? t('team.unnamed')}</span> <span className="text-muted">{u.email}</span>
                  {u.institution_name && <span className="block text-sm text-muted">{t('admin.selfReported')}: {u.institution_name}</span>}
                </span>
                <Chip>{t(`admin.role.${u.platform_role}`)}</Chip>
              </div>
              {isPlatform && (
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <SelectField label={t('admin.platformRole')} value={e.role} onChange={(ev) => setEdits({ ...edits, [u.id]: { ...e, role: ev.target.value } })} options={ROLES.map((r) => ({ value: r, label: t(`admin.role.${r}`) }))} />
                  <SelectField label={t('me.institution')} value={e.institution} placeholder={t('admin.noInstitution')} onChange={(ev) => setEdits({ ...edits, [u.id]: { ...e, institution: ev.target.value } })} options={(institutions.data ?? []).map((i) => ({ value: i.id, label: i.name }))} />
                  <Button variant="secondary" disabled={!dirty} onClick={() => void save(u)}>{saved === u.id && !dirty ? t('common.saved') : t('common.save')}</Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
