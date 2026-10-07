// Data access for evidence (T5), assessment (T3), integrity (T4), deliberation (T6)
// and profile/report (T8). Every read and write is checked by row-level security.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { keys, run } from './api'
import type { ProfileRow } from '../features/report/reportData'

export type Confidence = 'low' | 'medium' | 'high'

export interface Domain {
  id: string
  code: string
  name: string
  key_question: string | null
  evidence_to_look_for: string | null
  red_flags: string | null
  sort: number
  dimension: { code: string; label: string; sub_label: string | null; color_token: string; sort: number }
  indicators: { id: string; sort: number; prompt: string; guidance: string | null; subject_types: string[] | null }[]
}

export interface Framework {
  domains: Domain[]
  ratingLevels: { value: 1 | 2 | 3 | 4 | 5; label: string; descriptor: string | null }[]
}

export function useFramework(frameworkVersionId: string) {
  return useQuery({
    queryKey: ['framework', frameworkVersionId],
    staleTime: Infinity, // published versions never change (invariant 9)
    queryFn: async (): Promise<Framework> => {
      const domains = (await run(
        supabase
          .from('domains')
          .select('id, code, name, key_question, evidence_to_look_for, red_flags, sort, dimension:dimensions(code, label, sub_label, color_token, sort), indicators(id, sort, prompt, guidance, subject_types)')
          .eq('framework_version_id', frameworkVersionId)
          .order('sort'),
      )) as unknown as Domain[]
      domains.forEach((d) => d.indicators.sort((a, b) => a.sort - b.sort))
      const ratingLevels = (await run(
        supabase.from('rating_levels').select('value, label, descriptor').eq('framework_version_id', frameworkVersionId).order('value'),
      )) as Framework['ratingLevels']
      return { domains, ratingLevels }
    },
  })
}

// Evidence (T5) ---------------------------------------------------------------------

export interface EvidenceItem {
  id: string
  title: string
  type: string
  source: string | null
  source_type: string | null
  evidence_date: string | null
  storage_path: string | null
  url: string | null
  description: string | null
  confidentiality: string
  origin: string
  created_by: string
  links: { domain_id: string }[]
}

export interface EvidenceGap {
  id: string
  domain_id: string
  description: string
  effect_on_confidence: string | null
}

export function useEvidence(projectId: string) {
  return useQuery({
    queryKey: ['evidence', projectId],
    queryFn: async () => {
      const items = (await run(
        supabase.from('evidence_items').select('*, links:evidence_domain_links(domain_id)').eq('project_id', projectId).order('created_at'),
      )) as EvidenceItem[]
      const gaps = (await run(
        supabase.from('evidence_gaps').select('id, domain_id, description, effect_on_confidence').eq('project_id', projectId).order('created_at'),
      )) as EvidenceGap[]
      return { items, gaps }
    },
  })
}

export interface NewEvidence {
  title: string
  type: string
  origin: string
  source: string
  source_type: string | null
  evidence_date: string | null
  confidentiality: string
  description: string
  url: string | null
  file: File | null
  domainIds: string[]
}

/** Uploads to <project>/<evidence id>/<file>, then records the item and its domain tags. */
export async function createEvidence(projectId: string, e: NewEvidence): Promise<string> {
  const id = crypto.randomUUID()
  let storage_path: string | null = null
  if (e.file) {
    const safe = e.file.name.replace(/[^\w.-]+/g, '_').slice(-120)
    storage_path = `${projectId}/${id}/${safe}`
    const { error } = await supabase.storage.from('evidence').upload(storage_path, e.file, { upsert: false })
    if (error) throw new Error(error.message)
  }
  await run(
    supabase.from('evidence_items').insert({
      id,
      project_id: projectId,
      title: e.title,
      type: e.type,
      origin: e.origin,
      source: e.source || null,
      source_type: e.source_type || null,
      evidence_date: e.evidence_date || null,
      confidentiality: e.confidentiality,
      description: e.description || null,
      url: storage_path ? null : e.url,
      storage_path,
    }),
  )
  if (e.domainIds.length)
    await run(supabase.from('evidence_domain_links').insert(e.domainIds.map((domain_id) => ({ evidence_id: id, domain_id }))))
  return id
}

export async function openEvidence(item: EvidenceItem) {
  if (item.url) return window.open(item.url, '_blank', 'noopener')
  const { data, error } = await supabase.storage.from('evidence').createSignedUrl(item.storage_path!, 60)
  if (error) throw new Error(error.message)
  window.open(data.signedUrl, '_blank', 'noopener')
}

export async function createGap(projectId: string, g: { domain_id: string; description: string; effect_on_confidence: string }) {
  const rows = (await run(
    supabase.from('evidence_gaps').insert({ project_id: projectId, ...g }).select('id'),
  )) as { id: string }[]
  return rows[0]!.id
}

// Assessment (T3) ---------------------------------------------------------------------

export interface RatingRow {
  id: string
  domain_id: string
  rating: 1 | 2 | 3 | 4 | 5 | null
  narrative: string | null
  confidence: Confidence | null
  is_complete: boolean
  evidence: { evidence_id: string }[]
  gaps: { gap_id: string }[]
}

export interface AssessmentRow {
  id: string
  assessor_id: string
  status: 'draft' | 'submitted' | 'reopened' | 'withdrawn'
  submitted_at: string | null
  reopened_reason: string | null
  domain_ratings: RatingRow[]
  indicator_responses: { indicator_id: string; response: string | null }[]
}

const ASSESSMENT = `id, assessor_id, status, submitted_at, reopened_reason,
  domain_ratings(id, domain_id, rating, narrative, confidence, is_complete,
    evidence:rating_evidence_links(evidence_id), gaps:rating_gap_links(gap_id)),
  indicator_responses(indicator_id, response)`

/** All assessments the user may see: their own always; others only after G3 (invariant 4). */
export function useAssessments(projectId: string) {
  return useQuery({
    queryKey: ['assessments', projectId],
    queryFn: async () =>
      (await run(supabase.from('assessments').select(ASSESSMENT).eq('project_id', projectId))) as AssessmentRow[],
  })
}

export interface ProgressRow {
  assessment_id: string
  assessor_id: string
  assessor_name: string | null
  status: AssessmentRow['status']
  submitted_at: string | null
  complete_domains: number
  total_domains: number
}

export function useAssessmentProgress(projectId: string) {
  return useQuery({
    queryKey: ['assessment-progress', projectId],
    queryFn: async () => (await run(supabase.rpc('assessment_progress', { p_project: projectId }))) as ProgressRow[],
  })
}

export function useInvalidateWorkflow(projectId: string) {
  const qc = useQueryClient()
  return () =>
    Promise.all(
      [
        ['assessments', projectId],
        ['assessment-progress', projectId],
        ['evidence', projectId],
        ['integrity', projectId],
        ['deliberation', projectId],
        ['profile', projectId],
        ['report', projectId],
        keys.project(projectId),
        keys.projects,
      ].map((queryKey) => qc.invalidateQueries({ queryKey })),
    )
}

export function useRpc<TArgs extends Record<string, unknown>>(projectId: string, fn: string) {
  const invalidate = useInvalidateWorkflow(projectId)
  return useMutation({
    mutationFn: async (args: TArgs) => run(supabase.rpc(fn, args)),
    onSuccess: () => invalidate(),
  })
}

export async function saveRating(id: string, patch: Partial<Pick<RatingRow, 'rating' | 'narrative' | 'confidence' | 'is_complete'>>) {
  await run(supabase.from('domain_ratings').update(patch).eq('id', id))
}

export async function saveIndicatorResponse(assessmentId: string, indicatorId: string, response: string) {
  await run(
    supabase
      .from('indicator_responses')
      .upsert({ assessment_id: assessmentId, indicator_id: indicatorId, response }, { onConflict: 'assessment_id,indicator_id' }),
  )
}

export async function linkEvidence(ratingId: string, evidenceId: string) {
  await run(supabase.from('rating_evidence_links').insert({ domain_rating_id: ratingId, evidence_id: evidenceId }))
}
export async function unlinkEvidence(ratingId: string, evidenceId: string) {
  await run(supabase.from('rating_evidence_links').delete().eq('domain_rating_id', ratingId).eq('evidence_id', evidenceId))
}
export async function linkGap(ratingId: string, gapId: string) {
  await run(supabase.from('rating_gap_links').insert({ domain_rating_id: ratingId, gap_id: gapId }))
}
export async function unlinkGap(ratingId: string, gapId: string) {
  await run(supabase.from('rating_gap_links').delete().eq('domain_rating_id', ratingId).eq('gap_id', gapId))
}

// Integrity (T4) ---------------------------------------------------------------------

export const INTEGRITY_FIELDS = [
  'alignment_goal_contradictions',
  'alignment_funder_portfolio',
  'alignment_values_vs_allocation',
  'cost_who_bears',
  'cost_transaction_proportionate',
  'cost_shifted_to_local',
  'cost_indirect_covered',
  'voice_actual_involvement',
  'voice_veto_power',
  'voice_grievance_mechanisms',
  'voice_input_led_to_change',
] as const
export type IntegrityField = (typeof INTEGRITY_FIELDS)[number]
export const RISK_FLAGS = ['washing', 'power', 'sustainability', 'inclusion'] as const
export const SOLIDARITY_TYPES = ['symbolic', 'instrumental', 'substantive', 'transformative'] as const

export type IntegrityReview = {
  id: string
  scope: 'assessor' | 'project'
  assessment_id: string | null
  primary_type: string | null
  secondary_type: string | null
  type_evidence: string | null
  qa_by: string | null
  qa_at: string | null
  qa_notes: string | null
  integrity_flags: { flag: string; level: Confidence; explanation: string | null }[]
} & Record<IntegrityField, string | null>

export function useIntegrity(projectId: string) {
  return useQuery({
    queryKey: ['integrity', projectId],
    queryFn: async () =>
      (await run(
        supabase.from('integrity_reviews').select('*, integrity_flags(flag, level, explanation)').eq('project_id', projectId),
      )) as IntegrityReview[],
  })
}

export type IntegrityPatch = Partial<Record<IntegrityField | 'primary_type' | 'secondary_type' | 'type_evidence', string | null>>

/** Creates the review on first save, then updates the editable columns. */
export async function saveIntegrity(
  projectId: string,
  scope: 'assessor' | 'project',
  assessmentId: string | null,
  reviewId: string | null,
  patch: IntegrityPatch,
): Promise<string> {
  if (reviewId) {
    await run(supabase.from('integrity_reviews').update(patch).eq('id', reviewId))
    return reviewId
  }
  const rows = (await run(
    supabase
      .from('integrity_reviews')
      .insert({ project_id: projectId, scope, assessment_id: assessmentId, ...patch })
      .select('id'),
  )) as { id: string }[]
  return rows[0]!.id
}

export async function saveFlag(reviewId: string, flag: string, level: Confidence, explanation: string | null) {
  await run(
    supabase
      .from('integrity_flags')
      .upsert({ integrity_review_id: reviewId, flag, level, explanation }, { onConflict: 'integrity_review_id,flag' }),
  )
}

// Deliberation (T6) -------------------------------------------------------------------

export interface DeliberationData {
  consensus: {
    id: string
    domain_id: string
    rating: number | null
    category: string
    rationale: string | null
    confidence: Confidence | null
    reviewer_verified_at: string | null
    pi_approved_at: string | null
  }[]
  dissent: { id: string; domain_id: string; member_id: string; position: string; rationale: string; created_at: string }[]
  discussions: { id: string; domain_id: string; note: string; created_by: string; created_at: string }[]
  sessions: { id: string; held_on: string; notes: string | null; participants: { user_id: string | null; external_name: string | null }[] }[]
}

export function useDeliberation(projectId: string) {
  return useQuery({
    queryKey: ['deliberation', projectId],
    queryFn: async (): Promise<DeliberationData> => {
      const [consensus, dissent, discussions, sessions] = await Promise.all([
        run(supabase.from('consensus_ratings').select('id, domain_id, rating, category, rationale, confidence, reviewer_verified_at, pi_approved_at').eq('project_id', projectId)),
        run(supabase.from('dissent_records').select('id, domain_id, member_id, position, rationale, created_at').eq('project_id', projectId).order('created_at')),
        run(supabase.from('domain_discussions').select('id, domain_id, note, created_by, created_at').eq('project_id', projectId).order('created_at')),
        run(supabase.from('deliberation_sessions').select('id, held_on, notes, participants:deliberation_participants(user_id, external_name)').eq('project_id', projectId).order('held_on')),
      ])
      return { consensus, dissent, discussions, sessions } as DeliberationData
    },
  })
}

export async function saveConsensus(
  projectId: string,
  domainId: string,
  v: { rating: number | null; category: string; rationale: string; confidence: Confidence | null },
) {
  await run(
    supabase.from('consensus_ratings').upsert({ project_id: projectId, domain_id: domainId, ...v }, { onConflict: 'project_id,domain_id' }),
  )
}

// Profile & report (T8) ---------------------------------------------------------------

export function useProfile(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['profile', projectId],
    enabled,
    queryFn: async () => (await run(supabase.rpc('profile_ratings', { p_project: projectId }))) as ProfileRow[],
  })
}

export interface ReportExtras {
  memberChecks: { id: string; stakeholder_group: string; response: string | null; relevance: number | null; checked_on: string | null }[]
  drafts: { id: string; body: string; produced_by: string; approved_at: string | null; created_at: string }[]
}

export function useReportExtras(projectId: string) {
  return useQuery({
    queryKey: ['report', projectId],
    queryFn: async (): Promise<ReportExtras> => {
      const [memberChecks, drafts] = await Promise.all([
        run(supabase.from('member_checks').select('id, stakeholder_group, response, relevance, checked_on').eq('project_id', projectId).order('created_at')),
        run(supabase.from('report_drafts').select('id, body, produced_by, approved_at, created_at').eq('project_id', projectId).order('created_at', { ascending: false })),
      ])
      return { memberChecks, drafts } as ReportExtras
    },
  })
}

export async function recordDownload(projectId: string, format: 'pdf' | 'docx' | 'csv') {
  await supabase.from('report_downloads').insert({ project_id: projectId, format })
}
