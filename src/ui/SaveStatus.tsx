import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SaveState } from '../lib/useAutosave'

/** "Saved · 2 seconds ago" (brief §9.5). Announced politely to screen readers. */
export function SaveStatus({ state }: { state: SaveState }) {
  const { t } = useTranslation()
  const [, tick] = useState(0)
  useEffect(() => {
    if (state.kind !== 'saved') return
    const id = setInterval(() => tick((n) => n + 1), 5_000)
    return () => clearInterval(id)
  }, [state])

  let text = ''
  if (state.kind === 'pending' || state.kind === 'saving') text = t('common.saving')
  if (state.kind === 'saved') {
    const seconds = Math.max(1, Math.round((Date.now() - state.at) / 1000))
    text =
      seconds < 60
        ? t('autosave.savedSeconds', { count: seconds })
        : t('autosave.savedMinutes', { count: Math.round(seconds / 60) })
  }
  if (state.kind === 'error') text = t('autosave.retrying')

  return (
    <p aria-live="polite" className={`min-h-6 text-sm ${state.kind === 'error' ? 'text-alert' : 'text-muted'}`}>
      {text}
    </p>
  )
}
