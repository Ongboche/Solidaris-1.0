// Vocabularies shared with the database enums (supabase/migrations/*_foundation.sql).

export const PROJECT_STATUSES = [
  'draft',
  'scoping',
  'context',
  'evidence',
  'assessment',
  'integrity',
  'deliberation',
  'validation',
  'uptake',
  'learning',
  'closed',
] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const GATES = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8'] as const
export type Gate = (typeof GATES)[number]

export type CriterionAnswer = 'yes' | 'partial' | 'no' | 'na'
export type GateDecision = 'go' | 'conditional_go' | 'hold' | 'stop_redirect'
export type SuggestedDecision = 'not_started' | 'hold' | 'conditional_go' | 'go'

export type ProjectRole =
  | 'pi'
  | 'assessor'
  | 'reviewer'
  | 'observer'
  | 'external_expert'
  | 'kt_lead'
  | 'community_participant'

export type ConfidenceLevel = 'low' | 'medium' | 'high'

/** A rating is an integer 1–5 or null. There is no 0 (invariant 2). */
export type Rating = 1 | 2 | 3 | 4 | 5 | null
