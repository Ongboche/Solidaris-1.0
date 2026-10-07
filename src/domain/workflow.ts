// Project status machine (brief §6.1). Mirrored by gate_for_status() / next_status() in SQL.
import type { Gate, GateDecision, ProjectRole, ProjectStatus } from './types'

const GATE_BY_STATUS: Partial<Record<ProjectStatus, Gate>> = {
  scoping: 'G0',
  context: 'G1',
  evidence: 'G2',
  assessment: 'G3',
  integrity: 'G4',
  deliberation: 'G5',
  validation: 'G6',
  uptake: 'G7',
  learning: 'G8',
}

const NEXT: Partial<Record<ProjectStatus, ProjectStatus>> = {
  scoping: 'context',
  context: 'evidence',
  evidence: 'assessment',
  assessment: 'integrity',
  integrity: 'deliberation',
  deliberation: 'validation',
  validation: 'uptake',
  uptake: 'learning',
  learning: 'closed',
}

/** The gate reviewed while a project is in this status, or null (draft, closed). */
export function gateForStatus(status: ProjectStatus): Gate | null {
  return GATE_BY_STATUS[status] ?? null
}

/** Status after a decision. Hold keeps the status; stop/redirect closes (PLAN D-5). */
export function nextStatus(status: ProjectStatus, decision: GateDecision): ProjectStatus {
  if (decision === 'stop_redirect') return 'closed'
  if (decision === 'hold') return status
  const next = NEXT[status]
  if (!next) throw new Error(`No gate is open while a project is ${status}`)
  return next
}

/** Gate owners (brief §6.3). G2 and G6 also need a reviewer verification first (PLAN D-12). */
export function gateOwner(gate: Gate): ProjectRole {
  if (gate === 'G4') return 'reviewer'
  if (gate === 'G7') return 'kt_lead'
  return 'pi'
}

export function needsReviewerVerification(gate: Gate): boolean {
  return gate === 'G2' || gate === 'G6'
}

/** Gates already behind a project, for the journey bar. */
export function passedGates(status: ProjectStatus): Gate[] {
  const order: ProjectStatus[] = ['scoping', 'context', 'evidence', 'assessment', 'integrity', 'deliberation', 'validation', 'uptake', 'learning']
  const index = order.indexOf(status)
  if (status === 'closed') return []
  return order.slice(0, Math.max(index, 0)).map((s) => GATE_BY_STATUS[s]!)
}
