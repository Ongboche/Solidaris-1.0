import type { TFunction } from 'i18next'

/** Plain-language explanation of an automatic check result (brief §6.3: "show the evidence"). */
export function describeEvidence(evidence: Record<string, unknown> | null, t: TFunction): string {
  if (!evidence) return ''
  const parts: string[] = []
  const list = (items: unknown, prefix: string) =>
    (items as string[]).map((i) => t(`${prefix}.${i}`, { defaultValue: i })).join(', ')

  if (Array.isArray(evidence.missing) && evidence.missing.length)
    parts.push(t('gate.evidence.missing', { items: list(evidence.missing, 'gate.field') }))
  if (Array.isArray(evidence.missing_categories) && evidence.missing_categories.length)
    parts.push(t('gate.evidence.missingCategories', { items: list(evidence.missing_categories, 'actorCategory') }))
  if (typeof evidence.assessors === 'number')
    parts.push(t('gate.evidence.assessors', { count: evidence.assessors }))
  if (typeof evidence.undeclared === 'number' && evidence.undeclared > 0)
    parts.push(t('gate.evidence.undeclared', { count: evidence.undeclared }))
  if (evidence.single_assessor === true) parts.push(t('gate.evidence.singleAssessor'))
  if (evidence.documented === false) parts.push(t('gate.evidence.notDocumented'))
  if (typeof evidence.open_conditions === 'number' && evidence.open_conditions > 0)
    parts.push(t('gate.evidence.openConditions', { count: evidence.open_conditions }))
  if (typeof evidence.subject_type === 'string') parts.push(t(`subjectType.${evidence.subject_type}`))
  if (typeof evidence.result === 'string') parts.push(t(`gate.evidence.hr_${evidence.result}`))
  return parts.join(' · ')
}
