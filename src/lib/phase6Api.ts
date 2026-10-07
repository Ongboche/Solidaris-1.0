// Data access for KT & uptake (T9), signals (T7) and learning (T10).
import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { run } from './api'

export interface UptakeData {
  products: { id: string; audience: string | null; format: string | null; delivered_to: string | null; delivered_on: string | null }[]
  response: { id: string; response_type: 'action_plan' | 'no_action'; summary: string | null; follow_up_on: string | null } | null
  actions: { id: string; description: string; owner_id: string | null; due_on: string | null; status: 'open' | 'done' | 'cancelled'; source_gate_review_id: string | null }[]
  events: { id: string; event_date: string; decision_body: string | null; use_type: string; evidence_link: string | null }[]
}

export function useUptake(projectId: string) {
  return useQuery({
    queryKey: ['uptake', projectId],
    queryFn: async (): Promise<UptakeData> => {
      const [products, responses, actions, events] = await Promise.all([
        run(supabase.from('kt_products').select('id, audience, format, delivered_to, delivered_on').eq('project_id', projectId).order('created_at')),
        run(supabase.from('decision_responses').select('id, response_type, summary, follow_up_on').eq('project_id', projectId)),
        run(supabase.from('action_items').select('id, description, owner_id, due_on, status, source_gate_review_id').eq('project_id', projectId).order('due_on', { nullsFirst: false })),
        run(supabase.from('uptake_events').select('id, event_date, decision_body, use_type, evidence_link').eq('project_id', projectId).order('event_date')),
      ])
      return {
        products,
        response: (responses as UptakeData['response'][])[0] ?? null,
        actions,
        events,
      } as UptakeData
    },
  })
}

export interface SignalData {
  definitions: { domain_id: string; description: string }[]
  observations: { id: string; project_id: string | null; domain_id: string; observed_on: string; source: string | null; description: string; level: 'watch' | 'act'; reviewed_at: string | null }[]
}

export function useSignals(subjectId: string, frameworkVersionId: string) {
  return useQuery({
    queryKey: ['signals', subjectId],
    queryFn: async (): Promise<SignalData> => {
      const [definitions, observations] = await Promise.all([
        run(supabase.from('signal_definitions').select('domain_id, description, domains!inner(framework_version_id)').eq('domains.framework_version_id', frameworkVersionId)),
        run(supabase.from('signal_observations').select('id, project_id, domain_id, observed_on, source, description, level, reviewed_at').eq('subject_id', subjectId).order('observed_on', { ascending: false })),
      ])
      return { definitions, observations } as SignalData
    },
  })
}

export interface LearningData {
  reviews: { id: string; reviewed_on: string; notes: string | null; reassessment_decision: 'reassess' | 'no_reassess' | null; next_project_id: string | null }[]
  lessons: { id: string; lesson: string; created_at: string }[]
}

export function useLearning(projectId: string) {
  return useQuery({
    queryKey: ['learning', projectId],
    queryFn: async (): Promise<LearningData> => {
      const [reviews, lessons] = await Promise.all([
        run(supabase.from('follow_up_reviews').select('id, reviewed_on, notes, reassessment_decision, next_project_id').eq('project_id', projectId).order('reviewed_on')),
        run(supabase.from('framework_lessons').select('id, lesson, created_at').eq('project_id', projectId).order('created_at')),
      ])
      return { reviews, lessons } as LearningData
    },
  })
}
