// One report model feeds the screen, PDF, DOCX and CSV exports (brief §10), so every
// output passes the same no-composite check (invariant 1).
import { assertNoComposite, ratedCount } from '../../domain/noComposite'

export interface ProfileRow {
  domain_id: string
  code: string
  name: string
  dimension_code: string
  dimension_label: string
  dimension_sort: number
  domain_sort: number
  rating: number | null
  confidence: 'low' | 'medium' | 'high' | null
  category: string | null
  narrative: string | null
  source: 'consensus' | 'single_assessor'
}

export type ProfileLabel = 'exploratory' | 'validated' | 'awaiting_validation'

export interface ReportInput {
  subject: { name: string; type: string; country: string | null; region: string | null; description: string | null }
  decision: {
    decision_text: string | null
    decision_maker_name: string | null
    decision_maker_institution: string | null
    window_start: string | null
    window_end: string | null
  } | null
  context: { financing: string | null; governance: string | null; target_population: string | null } | null
  exploratory: boolean
  g6Passed: boolean
  profile: ProfileRow[]
  evidenceByDomain: Record<string, string[]>
  flags: { flag: string; level: string; explanation: string | null }[]
  solidarityType: { primary: string | null; secondary: string | null; evidence: string | null }
  dissent: { domainCode: string; position: string; rationale: string }[]
  gaps: { domainCode: string; description: string; effect: string | null }[]
  memberChecks: { group: string; response: string | null; relevance: number | null; date: string | null }[]
  narrative: { body: string; producedBy: string; approved: boolean } | null
  ratingLabels: Record<number, string>
}

export interface ReportDomain {
  code: string
  name: string
  dimension: string
  rating: number | null
  ratingLabel: string | null
  confidence: string | null
  consensusCategory: string | null
  narrative: string | null
  keyEvidence: string[]
}

export interface ReportData {
  subject: ReportInput['subject']
  decision: ReportInput['decision']
  context: ReportInput['context']
  label: ProfileLabel
  domains: ReportDomain[]
  ratedDomains: { rated: number; of: number }
  flags: ReportInput['flags']
  solidarityType: ReportInput['solidarityType']
  dissent: ReportInput['dissent']
  gaps: ReportInput['gaps']
  memberChecks: ReportInput['memberChecks']
  narrative: ReportInput['narrative']
}

export function profileLabel(exploratory: boolean, g6Passed: boolean): ProfileLabel {
  // Brief §16.2: single-assessor profiles are Exploratory and never Validated.
  if (exploratory) return 'exploratory'
  return g6Passed ? 'validated' : 'awaiting_validation'
}

export function buildReportData(input: ReportInput): ReportData {
  const domains = [...input.profile]
    .sort((a, b) => a.dimension_sort - b.dimension_sort || a.domain_sort - b.domain_sort)
    .map((p) => ({
      code: p.code,
      name: p.name,
      dimension: p.dimension_label,
      rating: p.rating,
      ratingLabel: p.rating === null ? null : (input.ratingLabels[p.rating] ?? null),
      confidence: p.confidence,
      consensusCategory: p.category,
      narrative: p.narrative,
      keyEvidence: input.evidenceByDomain[p.domain_id] ?? [],
    }))
  const data: ReportData = {
    subject: input.subject,
    decision: input.decision,
    context: input.context,
    label: profileLabel(input.exploratory, input.g6Passed),
    domains,
    ratedDomains: ratedCount(domains.map((d) => d.rating)),
    flags: input.flags,
    solidarityType: input.solidarityType,
    dissent: input.dissent,
    gaps: input.gaps,
    memberChecks: input.memberChecks,
    narrative: input.narrative,
  }
  assertNoComposite(data)
  return data
}
