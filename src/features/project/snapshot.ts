import type { ProjectSnapshot } from '../../domain/nextActions'
import type { Gate } from '../../domain/types'
import type { Bundle } from '../../lib/api'
import type { ActorCategory } from '../../lib/types'

const has = (v: string | null | undefined) => Boolean(v && v.trim())

export const ACTOR_CATEGORIES: ActorCategory[] = ['funder', 'implementer', 'community', 'government']

/** Mirrors the decision_recorded + hr_screen_answered automatic checks (G0). */
export function decisionComplete(p: Bundle): boolean {
  const d = p.decision_records
  return Boolean(d && has(d.decision_text) && has(d.decision_maker_name) && d.window_start && d.window_end && d.hr_screen_result)
}

/** Mirrors the context_complete + community_voice_plan automatic checks (G1). */
export function contextComplete(p: Bundle): boolean {
  const c = p.context_profiles
  return Boolean(c && has(c.financing) && has(c.governance) && has(c.target_population) && has(c.community_voice_plan))
}

export function missingActorCategories(p: Bundle): ActorCategory[] {
  return ACTOR_CATEGORIES.filter((cat) => !p.actors.some((a) => a.category === cat))
}

export function toSnapshot(p: Bundle, userId: string): ProjectSnapshot {
  const mine = p.project_members.filter((m) => m.user_id === userId)
  const assessorRow = mine.find((m) => m.role === 'assessor')
  return {
    id: p.id,
    subjectName: p.subjects.name,
    status: p.status,
    myRoles: mine.map((m) => m.role),
    myCoiDeclared: assessorRow ? Boolean(assessorRow.coi_declared_at) : null,
    decisionComplete: decisionComplete(p),
    contextComplete: contextComplete(p),
    actorsComplete: missingActorCategories(p).length === 0,
    myAssessmentStatus: p.assessments?.find((a) => a.assessor_id === userId)?.status ?? null,
  }
}

/** Gates decided go / conditional go, and whether the current gate's latest attempt was a hold. */
export function gateProgress(p: Bundle, current: Gate | null) {
  const passed = [...new Set(p.gate_reviews.filter((g) => g.owner_decision === 'go' || g.owner_decision === 'conditional_go').map((g) => g.gate))]
  const currentAttempts = p.gate_reviews
    .filter((g) => g.gate === current && g.owner_decision)
    .sort((a, b) => b.attempt_number - a.attempt_number)
  return { passed, onHold: currentAttempts[0]?.owner_decision === 'hold' }
}
