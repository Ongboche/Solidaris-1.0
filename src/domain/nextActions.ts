// "What to do next" (brief §9.2): each user's pending actions across projects,
// derived from data. Pure, so it is unit tested and shared by home and project pages.
import { gateForStatus, gateOwner, needsReviewerVerification } from './workflow'
import type { Gate, ProjectRole, ProjectStatus } from './types'

export interface ProjectSnapshot {
  id: string
  subjectName: string
  status: ProjectStatus
  myRoles: ProjectRole[]
  /** null when the user is not an assessor */
  myCoiDeclared: boolean | null
  decisionComplete: boolean
  contextComplete: boolean
  actorsComplete: boolean
  /** The user's own assessment status, or null if not started */
  myAssessmentStatus?: 'draft' | 'submitted' | 'reopened' | 'withdrawn' | null
  /** Open actions owned by the user that are due within two weeks or overdue */
  myDueActions?: number
}

export interface PendingInvitation {
  id: string
  projectId: string
  subjectName: string
  role: ProjectRole
}

export type NextAction =
  | { kind: 'accept_invitation'; invitationId: string; projectId: string; subjectName: string; role: ProjectRole }
  | { kind: 'invite_team'; projectId: string; subjectName: string }
  | { kind: 'start_scoping'; projectId: string; subjectName: string }
  | { kind: 'record_decision'; projectId: string; subjectName: string }
  | { kind: 'complete_context'; projectId: string; subjectName: string }
  | { kind: 'declare_coi'; projectId: string; subjectName: string }
  | { kind: 'add_evidence'; projectId: string; subjectName: string }
  | { kind: 'complete_assessment'; projectId: string; subjectName: string }
  | { kind: 'join_deliberation'; projectId: string; subjectName: string }
  | { kind: 'action_due'; projectId: string; subjectName: string; count: number }
  | { kind: 'verify_gate'; projectId: string; subjectName: string; gate: Gate }
  | { kind: 'review_gate'; projectId: string; subjectName: string; gate: Gate }

export function nextActions(projects: ProjectSnapshot[], invitations: PendingInvitation[]): NextAction[] {
  const actions: NextAction[] = invitations.map((i) => ({
    kind: 'accept_invitation',
    invitationId: i.id,
    projectId: i.projectId,
    subjectName: i.subjectName,
    role: i.role,
  }))

  for (const p of projects) {
    const base = { projectId: p.id, subjectName: p.subjectName }
    // Action-plan reminders (T9) continue after a project closes.
    if (p.myDueActions) actions.push({ kind: 'action_due', ...base, count: p.myDueActions })
    if (p.status === 'closed') continue
    const isPi = p.myRoles.includes('pi')

    if (p.myRoles.includes('assessor') && p.myCoiDeclared === false) actions.push({ kind: 'declare_coi', ...base })
    if (p.myRoles.includes('assessor')) {
      if (p.status === 'evidence') actions.push({ kind: 'add_evidence', ...base })
      const s = p.myAssessmentStatus ?? null
      if (p.status === 'assessment' && (s === null || s === 'draft' || s === 'reopened'))
        actions.push({ kind: 'complete_assessment', ...base })
    }
    if (p.status === 'deliberation' && !p.myRoles.includes('pi') &&
        p.myRoles.some((r) => ['assessor', 'reviewer', 'external_expert', 'community_participant'].includes(r)))
      actions.push({ kind: 'join_deliberation', ...base })

    if (p.status === 'draft') {
      if (isPi) actions.push({ kind: 'invite_team', ...base }, { kind: 'start_scoping', ...base })
      continue
    }

    const gate = gateForStatus(p.status)
    if (!gate) continue

    if (needsReviewerVerification(gate) && p.myRoles.includes('reviewer')) {
      actions.push({ kind: 'verify_gate', ...base, gate })
    }
    if (!p.myRoles.includes(gateOwner(gate))) continue

    // Point the owner at the work that feeds the gate before the gate itself.
    if (p.status === 'scoping' && !p.decisionComplete) actions.push({ kind: 'record_decision', ...base })
    else if (p.status === 'context' && !(p.contextComplete && p.actorsComplete))
      actions.push({ kind: 'complete_context', ...base })
    else actions.push({ kind: 'review_gate', ...base, gate })
  }
  return actions
}
