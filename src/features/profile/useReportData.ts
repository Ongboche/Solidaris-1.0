import { useMemo } from 'react'
import type { Bundle } from '../../lib/api'
import {
  useDeliberation,
  useEvidence,
  useFramework,
  useIntegrity,
  useProfile,
  useReportExtras,
  useAssessments,
} from '../../lib/workflowApi'
import { buildReportData, type ReportData } from '../report/reportData'

/** Gathers everything the profile, report and exports need into one checked model. */
export function useReportData(project: Bundle, g6Passed: boolean) {
  const approved = Boolean(project.profile_approved_at)
  const framework = useFramework(project.framework_version_id)
  const profile = useProfile(project.id, approved)
  const evidence = useEvidence(project.id)
  const integrity = useIntegrity(project.id)
  const delib = useDeliberation(project.id)
  const extras = useReportExtras(project.id)
  const assessments = useAssessments(project.id)
  const loading = [framework, profile, evidence, integrity, delib, extras, assessments].some((q) => q.isLoading && q.fetchStatus !== 'idle')

  const data = useMemo<ReportData | null>(() => {
    if (!approved || !profile.data || !framework.data || !evidence.data) return null
    const code = (id: string) => framework.data.domains.find((d) => d.id === id)?.code ?? '?'
    const review = integrity.data?.find((r) => r.scope === 'project')
    const draft = extras.data?.drafts[0]
    const evidenceByDomain: Record<string, string[]> = {}
    for (const item of evidence.data.items)
      for (const l of item.links) (evidenceByDomain[l.domain_id] ??= []).push(item.title)
    const submitted = (assessments.data ?? []).filter((a) => a.status === 'submitted').length
    return buildReportData({
      subject: project.subjects,
      decision: project.decision_records,
      context: project.context_profiles,
      exploratory: project.single_assessor || submitted < 2,
      g6Passed,
      profile: profile.data,
      evidenceByDomain,
      flags: review?.integrity_flags ?? [],
      solidarityType: { primary: review?.primary_type ?? null, secondary: review?.secondary_type ?? null, evidence: review?.type_evidence ?? null },
      dissent: (delib.data?.dissent ?? []).map((d) => ({ domainCode: code(d.domain_id), position: d.position, rationale: d.rationale })),
      gaps: evidence.data.gaps.map((g) => ({ domainCode: code(g.domain_id), description: g.description, effect: g.effect_on_confidence })),
      memberChecks: (extras.data?.memberChecks ?? []).map((m) => ({ group: m.stakeholder_group, response: m.response, relevance: m.relevance, date: m.checked_on })),
      narrative: draft ? { body: draft.body, producedBy: draft.produced_by, approved: Boolean(draft.approved_at) } : null,
      ratingLabels: Object.fromEntries(framework.data.ratingLevels.map((l) => [l.value, l.label])),
    })
  }, [approved, profile.data, framework.data, evidence.data, integrity.data, delib.data, extras.data, assessments.data, project, g6Passed])

  return { data, loading, approved, evidence: evidence.data, extras: extras.data }
}
