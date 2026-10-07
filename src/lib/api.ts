import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Gate, GateDecision, ProjectRole } from '../domain/types'
import type {
  Actor,
  AssessmentType,
  ContextProfile,
  CriterionResponse,
  DecisionRecord,
  GateCriterion,
  GateReviewRow,
  InvitationRow,
  ProjectBundle,
  SubjectType,
  TeamMember,
} from './types'

/** Throws Supabase errors so TanStack Query and error boundaries see them. */
export async function run<T>(promise: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await promise
  if (error) throw new Error(error.message)
  return data
}

const BUNDLE = `id, status, assessment_type, single_assessor, closed_reason, created_at, framework_version_id, profile_approved_at,
  subjects(*), project_members(id, user_id, role, coi_declared_at, coi_statement),
  decision_records(*), context_profiles(*), actors(*),
  gate_reviews(gate, owner_decision, decided_at, attempt_number), assessments(assessor_id, status),
  action_items(owner_id, status, due_on)`

export type Bundle = ProjectBundle & {
  framework_version_id: string
  profile_approved_at: string | null
  /** RLS returns only the user's own assessment before G3 (invariant 4). */
  assessments?: { assessor_id: string; status: 'draft' | 'submitted' | 'reopened' | 'withdrawn' }[]
  action_items?: { owner_id: string | null; status: 'open' | 'done' | 'cancelled'; due_on: string | null }[]
}

/** One-to-one embeds may arrive as an object or a one-item array depending on the API version. */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function normalise(row: Bundle): Bundle {
  return { ...row, decision_records: one(row.decision_records), context_profiles: one(row.context_profiles) }
}

export const keys = {
  projects: ['projects'] as const,
  project: (id: string) => ['project', id] as const,
  invitations: ['my-invitations'] as const,
  team: (id: string) => ['team', id] as const,
  projectInvitations: (id: string) => ['project-invitations', id] as const,
  gate: (id: string, gate: Gate) => ['gate', id, gate] as const,
}

export function useProjects() {
  return useQuery({
    queryKey: keys.projects,
    queryFn: async () =>
      (
        (await run(
          supabase.from('assessment_projects').select(BUNDLE).order('created_at', { ascending: false }),
        )) ?? []
      ).map((r) => normalise(r as unknown as Bundle)),
  })
}

export function useProject(id: string) {
  return useQuery({
    queryKey: keys.project(id),
    queryFn: async () =>
      normalise((await run(supabase.from('assessment_projects').select(BUNDLE).eq('id', id).single())) as unknown as Bundle),
  })
}

export interface MyInvitation {
  invitation_id: string
  project_id: string
  subject_name: string
  subject_type: SubjectType
  role: ProjectRole
  invited_by_name: string | null
  expires_at: string
}

export function useMyInvitations() {
  return useQuery({
    queryKey: keys.invitations,
    queryFn: async () => (await run(supabase.rpc('my_invitations'))) as MyInvitation[],
  })
}

export function useTeam(projectId: string) {
  return useQuery({
    queryKey: keys.team(projectId),
    queryFn: async () =>
      (await run(supabase.rpc('project_member_profiles', { p_project: projectId }))) as TeamMember[],
  })
}

export function useProjectInvitations(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.projectInvitations(projectId),
    enabled,
    queryFn: async () =>
      (await run(
        supabase
          .from('invitations')
          .select('id, email, role, expires_at, accepted_at, created_at')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
      )) as InvitationRow[],
  })
}

export interface GateView {
  criteria: GateCriterion[]
  reviews: (GateReviewRow & { responses: CriterionResponse[]; verifications: { outcome: string; notes: string | null; created_at: string }[] })[]
}

/** For the open gate this also refreshes the automatic checks on the server. */
export function useGate(project: Bundle | undefined, gate: Gate, isOpen: boolean) {
  return useQuery({
    queryKey: keys.gate(project?.id ?? '', gate),
    enabled: Boolean(project),
    queryFn: async (): Promise<GateView> => {
      if (isOpen) await run(supabase.rpc('refresh_gate_review', { p_project: project!.id, p_gate: gate }))
      const criteria = (await run(
        supabase
          .from('gate_criteria')
          .select('id, gate, sort, text, required, auto_check_key')
          .eq('framework_version_id', project!.framework_version_id)
          .eq('gate', gate)
          .order('sort'),
      )) as GateCriterion[]
      const reviews = (await run(
        supabase
          .from('gate_reviews')
          .select(
            '*, responses:gate_criterion_responses(criterion_id, answer, note, auto, auto_evidence), verifications:gate_verifications(outcome, notes, created_at)',
          )
          .eq('project_id', project!.id)
          .eq('gate', gate)
          .order('attempt_number', { ascending: false }),
      )) as GateView['reviews']
      return { criteria, reviews }
    },
  })
}

// Mutations -------------------------------------------------------------------------------

function useInvalidate() {
  const qc = useQueryClient()
  return (...queryKeys: readonly (readonly unknown[])[]) =>
    Promise.all(queryKeys.map((k) => qc.invalidateQueries({ queryKey: k as unknown[] })))
}

export function useCreateProject() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (v: {
      type: SubjectType
      name: string
      country?: string
      region?: string
      description?: string
      assessmentType: AssessmentType
    }) =>
      (await run(
        supabase.rpc('create_project', {
          p_subject_type: v.type,
          p_subject_name: v.name,
          p_country: v.country || null,
          p_region: v.region || null,
          p_description: v.description || null,
          p_assessment_type: v.assessmentType,
        }),
      )) as string,
    onSuccess: () => invalidate(keys.projects),
  })
}

export function useProjectRpc<TArgs extends Record<string, unknown>>(projectId: string, fn: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (args: TArgs) => run(supabase.rpc(fn, args)),
    onSuccess: () => invalidate(keys.project(projectId), keys.projects, keys.team(projectId), keys.projectInvitations(projectId)),
  })
}

export function useAcceptInvitation() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (v: { token?: string; invitationId?: string }) =>
      (await run(
        v.token
          ? supabase.rpc('accept_invitation', { p_token: v.token })
          : supabase.rpc('accept_invitation_by_id', { p_invitation: v.invitationId }),
      )) as string,
    onSuccess: () => invalidate(keys.projects, keys.invitations),
  })
}

export function useInvite(projectId: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (v: { email: string; role: ProjectRole }) =>
      (await run(supabase.rpc('invite_member', { p_project: projectId, p_email: v.email, p_role: v.role }))) as string,
    onSuccess: () => invalidate(keys.projectInvitations(projectId)),
  })
}

export function useUpdateMember(projectId: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (v: { membershipId: string; coi_statement: string }) =>
      run(
        supabase
          .from('project_members')
          .update({ coi_declared_at: new Date().toISOString(), coi_statement: v.coi_statement })
          .eq('id', v.membershipId),
      ),
    onSuccess: () => invalidate(keys.project(projectId), keys.projects),
  })
}

export function useSetSingleAssessor(projectId: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (value: boolean) =>
      run(supabase.from('assessment_projects').update({ single_assessor: value }).eq('id', projectId)),
    onSuccess: () => invalidate(keys.project(projectId)),
  })
}

export async function saveDecisionRecord(projectId: string, values: Partial<DecisionRecord>) {
  await run(supabase.from('decision_records').upsert({ ...values, project_id: projectId }, { onConflict: 'project_id' }))
}

export async function saveContextProfile(projectId: string, values: Partial<ContextProfile>) {
  await run(supabase.from('context_profiles').upsert({ ...values, project_id: projectId }, { onConflict: 'project_id' }))
}

export function useActorMutations(projectId: string) {
  const invalidate = useInvalidate()
  const done = () => invalidate(keys.project(projectId), keys.projects)
  return {
    add: useMutation({
      mutationFn: async (a: Omit<Actor, 'id' | 'project_id'>) =>
        run(supabase.from('actors').insert({ ...a, project_id: projectId })),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => run(supabase.from('actors').delete().eq('id', id)),
      onSuccess: done,
    }),
  }
}

export function useGateMutations(projectId: string, gate: Gate) {
  const invalidate = useInvalidate()
  const done = () => invalidate(keys.gate(projectId, gate), keys.project(projectId), keys.projects)
  return {
    saveAnswers: useMutation({
      mutationFn: async (answers: { criterion_id: string; answer: string; note: string | null }[]) =>
        run(supabase.rpc('save_gate_review', { p_project: projectId, p_gate: gate, p_answers: answers })),
      onSuccess: () => invalidate(keys.gate(projectId, gate)),
    }),
    decide: useMutation({
      mutationFn: async (v: { decision: GateDecision; conditions?: string; rationale?: string }) =>
        run(
          supabase.rpc('decide_gate', {
            p_project: projectId,
            p_gate: gate,
            p_decision: v.decision,
            p_conditions: v.conditions || null,
            p_rationale: v.rationale || null,
          }),
        ),
      onSuccess: done,
    }),
    verify: useMutation({
      mutationFn: async (v: { outcome: 'verified' | 'returned'; notes?: string }) =>
        run(
          supabase.rpc('record_gate_verification', {
            p_project: projectId,
            p_gate: gate,
            p_outcome: v.outcome,
            p_notes: v.notes || null,
          }),
        ),
      onSuccess: done,
    }),
  }
}
