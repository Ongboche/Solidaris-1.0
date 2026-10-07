import type { TFunction } from 'i18next'

/** "3 of 4 (75%)" — always shows the counts behind a toolkit percentage. */
export function share(part: number, whole: number, t: TFunction): string {
  if (!whole) return t('me.noneYet')
  return t('me.share', { part, whole, pct: Math.round((part / whole) * 100) })
}
