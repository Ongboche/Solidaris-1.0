// Suggested gate decision (brief §6.2). Mirrored by public.suggest_decision() in SQL;
// tests/fixtures/suggest-decision.json keeps the two in step.
import type { CriterionAnswer, GateDecision, SuggestedDecision } from './types'

export interface CriterionState {
  criterionId: string
  required: boolean
  answer: CriterionAnswer | null
  note?: string | null
}

export type ReasonCode = 'required_unanswered' | 'required_no' | 'required_partial' | 'na_missing_note'

export interface Reason {
  code: ReasonCode
  criterionId: string
}

export interface Suggestion {
  decision: SuggestedDecision
  reasons: Reason[]
}

const hasText = (value?: string | null) => (value ?? '').trim().length > 0

/**
 * - no criterion answered → not_started
 * - any REQUIRED criterion "no" → hold
 * - every REQUIRED criterion "yes", or "na" with a note → go
 * - otherwise → conditional_go
 * "partial" never counts as met; "na" without a note does not count as met.
 */
export function suggestDecision(criteria: CriterionState[]): Suggestion {
  const answered = criteria.filter((c) => c.answer !== null).length
  if (answered === 0) return { decision: 'not_started', reasons: [] }

  const reasons: Reason[] = []
  let anyNo = false
  for (const c of criteria) {
    if (!c.required) continue
    if (c.answer === null) reasons.push({ code: 'required_unanswered', criterionId: c.criterionId })
    else if (c.answer === 'no') {
      anyNo = true
      reasons.push({ code: 'required_no', criterionId: c.criterionId })
    } else if (c.answer === 'partial') reasons.push({ code: 'required_partial', criterionId: c.criterionId })
    else if (c.answer === 'na' && !hasText(c.note)) reasons.push({ code: 'na_missing_note', criterionId: c.criterionId })
  }

  const decision: SuggestedDecision = anyNo ? 'hold' : reasons.length === 0 ? 'go' : 'conditional_go'
  return { decision, reasons }
}

const RANK: Record<string, number> = { hold: 0, conditional_go: 1, go: 2 }

/** Recording a more favourable decision than suggested needs a written justification (§6.2). */
export function isUpwardOverride(suggested: SuggestedDecision, decided: GateDecision): boolean {
  return (RANK[decided] ?? -1) > (RANK[suggested] ?? -1)
}

export interface DecisionInput {
  suggested: SuggestedDecision
  decision: GateDecision
  conditions?: string | null
  rationale?: string | null
}

export type DecisionProblem = 'conditions_required' | 'rationale_required' | 'justification_required'

/** The same checks decide_gate() applies on the server, for instant feedback in the UI. */
export function decisionProblems(input: DecisionInput): DecisionProblem[] {
  const problems: DecisionProblem[] = []
  if (input.decision === 'conditional_go' && !hasText(input.conditions)) problems.push('conditions_required')
  if ((input.decision === 'hold' || input.decision === 'stop_redirect') && !hasText(input.rationale))
    problems.push('rationale_required')
  if (isUpwardOverride(input.suggested, input.decision) && !hasText(input.rationale))
    problems.push('justification_required')
  return problems
}
