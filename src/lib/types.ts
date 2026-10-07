// Row shapes returned by the Supabase API for the tables the app reads.
import type {
  CriterionAnswer,
  Gate,
  GateDecision,
  ProjectRole,
  ProjectStatus,
  SuggestedDecision,
} from '../domain/types'

export type SubjectType = 'project' | 'programme' | 'portfolio' | 'investment' | 'policy'
export type AssessmentType = 'baseline' | 'midline' | 'endline' | 'rapid' | 'reassessment'
export type ActorCategory = 'funder' | 'implementer' | 'community' | 'government'
export type Level = 'low' | 'medium' | 'high'

export interface Subject {
  id: string
  type: SubjectType
  name: string
  country: string | null
  region: string | null
  description: string | null
}

export interface MemberRow {
  id: string
  user_id: string
  role: ProjectRole
  coi_declared_at: string | null
  coi_statement: string | null
}

export interface DecisionRecord {
  project_id: string
  decision_text: string | null
  decision_maker_name: string | null
  decision_maker_institution: string | null
  window_start: string | null
  window_end: string | null
  hr_screen_result: 'pass' | 'escalate' | null
  hr_screen_note: string | null
}

export interface ContextProfile {
  project_id: string
  financing: string | null
  governance: string | null
  target_population: string | null
  community_voice_plan: string | null
}

export interface Actor {
  id: string
  project_id: string
  category: ActorCategory
  name: string
  role: string | null
  influence: Level | null
  participation_level: string | null
}

export interface GateReviewRow {
  id: string
  gate: Gate
  attempt_number: number
  suggested_decision: SuggestedDecision
  suggestion_reasons: string[]
  owner_decision: GateDecision | null
  conditions: string | null
  rationale: string | null
  is_override: boolean
  decided_by: string | null
  decided_at: string | null
}

export interface ProjectBundle {
  id: string
  status: ProjectStatus
  assessment_type: AssessmentType
  single_assessor: boolean
  closed_reason: string | null
  created_at: string
  subjects: Subject
  project_members: MemberRow[]
  decision_records: DecisionRecord | null
  context_profiles: ContextProfile | null
  actors: Actor[]
  gate_reviews: Pick<GateReviewRow, 'gate' | 'owner_decision' | 'decided_at' | 'attempt_number'>[]
}

export interface GateCriterion {
  id: string
  gate: Gate
  sort: number
  text: string
  required: boolean
  auto_check_key: string | null
}

export interface CriterionResponse {
  criterion_id: string
  answer: CriterionAnswer
  note: string | null
  auto: boolean
  auto_evidence: Record<string, unknown> | null
}

export interface TeamMember {
  user_id: string
  full_name: string | null
  institution: string | null
  role: ProjectRole
}

export interface InvitationRow {
  id: string
  email: string
  role: ProjectRole
  expires_at: string
  accepted_at: string | null
  created_at: string
}
