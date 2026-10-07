import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/Button'
import { Card, EmptyState } from '../../ui/Feedback'

const LEGACY_KEY = 'solidaris:db:v1'

type LegacyDb = { users?: Array<Record<string, unknown>>; projects?: unknown[] }

/** Reads the old prototype's browser storage for the migration script (brief §13). Passwords are dropped. */
export function readLegacyExport(storage: Pick<Storage, 'getItem'>): LegacyDb | null {
  const raw = storage.getItem(LEGACY_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as LegacyDb
    return {
      projects: parsed.projects ?? [],
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      users: (parsed.users ?? []).map(({ password, ...rest }) => rest),
    }
  } catch {
    return null
  }
}

export default function LegacyExportPage() {
  const { t } = useTranslation()
  const data = useMemo(() => readLegacyExport(window.localStorage), [])

  const download = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'solidaris-legacy-export.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-3xl font-semibold">{t('legacy.title')}</h1>
      <p>{t('legacy.intro')}</p>
      {data ? (
        <Card>
          <p className="mb-4">
            {t('legacy.found', { projects: data.projects?.length ?? 0, users: data.users?.length ?? 0 })}
          </p>
          <Button onClick={download}>{t('legacy.download')}</Button>
        </Card>
      ) : (
        <EmptyState title={t('legacy.none')} />
      )}
    </div>
  )
}
