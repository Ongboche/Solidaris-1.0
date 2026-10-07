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
  // G2–G6 checks
  const codes = (key: string, label: string) => {
    if (Array.isArray(evidence[key]) && (evidence[key] as unknown[]).length)
      parts.push(t(label, { items: (evidence[key] as string[]).join(', ') }))
  }
  codes('domains_without_evidence', 'gate.evidence.domainsWithoutEvidence')
  codes('domains_without_community_evidence', 'gate.evidence.noCommunityEvidence')
  codes('undiscussed_domains', 'gate.evidence.undiscussed')
  codes('domains_missing', 'gate.evidence.consensusMissing')
  if (Array.isArray(evidence.evidence_types))
    parts.push(t('gate.evidence.evidenceTypes', { count: evidence.evidence_types.length, items: list(evidence.evidence_types, 'evidenceType') }))
  if (typeof evidence.without_effect === 'number' && evidence.without_effect > 0)
    parts.push(t('gate.evidence.gapsWithoutEffect', { count: evidence.without_effect }))
  if (typeof evidence.outstanding === 'number')
    parts.push(t('gate.evidence.submission', { submitted: evidence.submitted, withdrawn: evidence.withdrawn, outstanding: evidence.outstanding }))
  if (typeof evidence.incomplete_ratings === 'number' && evidence.incomplete_ratings > 0)
    parts.push(t('gate.evidence.incompleteRatings', { count: evidence.incomplete_ratings }))
  if (evidence.review_started === false) parts.push(t('gate.evidence.reviewNotStarted'))
  if (Array.isArray(evidence.missing_sections) && evidence.missing_sections.length)
    parts.push(t('gate.evidence.missingSections', { count: evidence.missing_sections.length }))
  if (Array.isArray(evidence.missing_flags) && evidence.missing_flags.length)
    parts.push(t('gate.evidence.missingFlags', { items: list(evidence.missing_flags, 'integrity.flag') }))
  if ('primary_type' in evidence && !evidence.primary_type) parts.push(t('gate.evidence.noType'))
  if (evidence.type_evidence === false) parts.push(t('gate.evidence.noTypeEvidence'))
  if (typeof evidence.community_participants === 'number')
    parts.push(t('gate.evidence.communityParticipants', { count: evidence.community_participants }))
  if (evidence.exploratory === true) parts.push(t('gate.evidence.exploratory'))
  if ('verification' in evidence) parts.push(evidence.verification ? t(`gate.verification.${evidence.verification}`) : t('gate.verificationPending'))
  if (typeof evidence.member_checks === 'number') parts.push(t('gate.evidence.memberChecks', { count: evidence.member_checks }))
  if (evidence.by_design === true) parts.push(t('gate.evidence.byDesign'))
  return parts.join(' · ')
}
