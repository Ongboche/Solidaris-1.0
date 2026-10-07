// A fake signed-in session plus canned Supabase responses, so the signed-in screens can be
// checked for accessibility without a live database (brief §9.12, §14).
import type { Page, Route } from '@playwright/test'

const REF = 'emtowdhobspmmtypulpi'
const USER = '11111111-1111-4111-8111-111111111111'
const PROJECT = '22222222-2222-4222-8222-222222222222'
const FV = '33333333-3333-4333-8333-333333333333'

const dims = [
  { code: 'WHAT', label: 'WHAT', sub_label: 'Orientation', color_token: 'what', sort: 1 },
  { code: 'HOW', label: 'HOW', sub_label: 'Process', color_token: 'how', sort: 2 },
  { code: 'END', label: 'TO WHAT END', sub_label: 'Outcomes', color_token: 'end', sort: 3 },
]
const names = ['Equity & Justice', 'Common Good Orientation', 'Mutual Responsibility', 'Power Transformation', 'Inclusive Participation', 'Transparency & Accountability', 'Sustainability & Sovereignty', 'Relational Trust', 'Transformative Impact']
const domains = names.map((name, i) => ({
  id: `d${i + 1}`,
  code: `D${i + 1}`,
  name,
  key_question: null,
  evidence_to_look_for: 'Targeting criteria; disaggregated coverage',
  red_flags: 'Elite capture',
  sort: i + 1,
  dimension: dims[Math.floor(i / 3)],
  indicators: [{ id: `i${i}`, sort: 1, prompt: 'Priority given to underserved populations', guidance: null, subject_types: null }],
}))

const bundle = {
  id: PROJECT,
  status: 'validation',
  assessment_type: 'baseline',
  single_assessor: false,
  closed_reason: null,
  created_at: '2026-10-01T00:00:00Z',
  framework_version_id: FV,
  profile_approved_at: '2026-10-05T00:00:00Z',
  subjects: { id: 's1', type: 'programme', name: 'Kaduna Equity Fund', country: 'Nigeria', region: null, description: 'State health equity fund' },
  project_members: [{ id: 'm1', user_id: USER, role: 'pi', coi_declared_at: null, coi_statement: null }],
  decision_records: { project_id: PROJECT, decision_text: 'Renew the fund', decision_maker_name: 'State Health Board', decision_maker_institution: null, window_start: '2026-11-01', window_end: '2027-03-31', hr_screen_result: 'pass', hr_screen_note: null },
  context_profiles: { project_id: PROJECT, financing: 'Basket fund', governance: 'Steering committee', target_population: 'Rural households', community_voice_plan: 'Ward committees' },
  actors: [{ id: 'a1', project_id: PROJECT, category: 'funder', name: 'Donor', role: null, influence: 'high', participation_level: 'decides' }],
  gate_reviews: ['G0', 'G1', 'G2', 'G3', 'G4', 'G5'].map((gate) => ({ gate, owner_decision: 'go', decided_at: '2026-10-02T00:00:00Z', attempt_number: 1 })),
  assessments: [],
  action_items: [],
}

const criteria = [
  { id: 'c1', gate: 'G6', sort: 1, text: 'Reviewer QA done', required: true, auto_check_key: 'reviewer_verified' },
  { id: 'c2', gate: 'G6', sort: 2, text: 'Member-check with affected stakeholders done', required: true, auto_check_key: 'member_check_recorded' },
  { id: 'c3', gate: 'G6', sort: 4, text: 'Confidence caveats and limitations stated', required: true, auto_check_key: null },
]

const fixtures: Record<string, unknown> = {
  profiles: [{ id: USER, full_name: 'Paul Test', email: 'paul@example.org', institution_name: 'ABU', position: 'PI', country: 'Nigeria', discipline: 'Health policy', orcid: null, platform_role: 'platform_admin', consent_processing_at: '2026-10-01', consent_handling_at: '2026-10-01', consent_email_at: null, created_at: '2026-10-01', institution_id: null }],
  assessment_projects: [bundle],
  domains,
  rating_levels: [1, 2, 3, 4, 5].map((value) => ({ value, label: ['Emerging / Minimal', 'Partial / Inconsistent', 'Moderate / Developing', 'Strong / Consistent', 'Transformative / Exemplary'][value - 1], descriptor: null })),
  gate_criteria: criteria,
  gate_reviews: [{ id: 'r6', gate: 'G6', attempt_number: 1, suggested_decision: 'hold', suggestion_reasons: ['required_no:c2'], owner_decision: null, conditions: null, rationale: null, is_override: false, decided_by: null, decided_at: null,
    responses: [{ criterion_id: 'c1', answer: 'yes', note: null, auto: true, auto_evidence: { verification: 'verified' } }, { criterion_id: 'c2', answer: 'no', note: null, auto: true, auto_evidence: { member_checks: 0 } }],
    verifications: [{ outcome: 'verified', notes: null, created_at: '2026-10-05T00:00:00Z' }] }],
  evidence_items: [{ id: 'e1', title: 'Fund strategy 2025', type: 'document', source: null, source_type: null, evidence_date: null, storage_path: null, url: 'https://example.org', description: null, confidentiality: 'restricted', origin: 'government', created_by: USER, links: [{ domain_id: 'd1' }] }],
  evidence_gaps: [{ id: 'g1', domain_id: 'd3', description: 'Co-financing records not released', effect_on_confidence: 'Lowers confidence' }],
  integrity_reviews: [{ id: 'ir', scope: 'project', assessment_id: null, primary_type: 'instrumental', secondary_type: null, type_evidence: 'Minutes', qa_by: null, qa_at: null, qa_notes: null,
    integrity_flags: [{ flag: 'washing', level: 'low', explanation: null }, { flag: 'power', level: 'high', explanation: 'Donors hold budget authority' }, { flag: 'sustainability', level: 'medium', explanation: null }, { flag: 'inclusion', level: 'low', explanation: null }] }],
  report_drafts: [],
  member_checks: [],
  institutions: [],
  framework_versions: [{ id: FV, label: 'v1', status: 'published', published_at: '2026-10-06', created_at: '2026-10-06' }],
  audit_log: [],
}

const rpc: Record<string, unknown> = {
  my_invitations: [],
  project_member_profiles: [{ user_id: USER, full_name: 'Paul Test', institution: 'ABU', role: 'pi' }],
  refresh_gate_review: 'r6',
  assessment_progress: [],
  profile_ratings: domains.map((d, i) => ({ domain_id: d.id, code: d.code, name: d.name, dimension_code: d.dimension!.code, dimension_label: d.dimension!.label, dimension_sort: d.dimension!.sort, domain_sort: d.sort,
    rating: i === 1 ? null : (i % 5) + 1, confidence: i === 1 ? null : (['low', 'medium', 'high'] as const)[i % 3], category: i === 1 ? 'no_consensus' : 'substantial', narrative: 'Agreed after discussion', source: 'consensus' })),
  me_indicators: { projects: 1, oc1: { decisions_considering_profile: 0, released_profiles: 0, released_with_action_plan: 0, use_types: {} },
    oc2: { domains_compared: 9, domains_within_threshold: 8, consensus_ratings: 8, consensus_medium_high: 5, member_checks_rated: 0, member_check_relevance_mean: null },
    oc3: { deliberating_projects: 1, with_community_participant: 1, high_flags: 1, high_flags_explained: 1, non_consensus_domains: 1, non_consensus_with_dissent: 1 },
    oc4: { institutions_past_g6: 0, registrations: 3, report_downloads: 0 },
    op3: { median_days_g0_to_g6: null, first_pass: { G0: { reviewed: 1, passed_first_time: 1 } }, recent_hold_reasons: [] } },
}

export async function mockSignedIn(page: Page) {
  const session = {
    access_token: 'e2e', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'e2e',
    user: { id: USER, email: 'paul@example.org', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' },
  }
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key!, value!), [`sb-${REF}-auth-token`, JSON.stringify(session)])
  await page.route(`https://${REF}.supabase.co/**`, async (route: Route) => {
    const url = new URL(route.request().url())
    const [, , kind, name] = url.pathname.split('/') // /rest/v1/<table> or /rest/v1/rpc/<fn>
    let body: unknown = []
    if (url.pathname.startsWith('/rest/v1/rpc/')) body = rpc[url.pathname.split('/').pop()!] ?? null
    else if (kind === 'v1' && name) body = fixtures[name] ?? []
    else if (url.pathname.startsWith('/auth/v1/user')) body = session.user
    const single = (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object')
    if (single && Array.isArray(body)) body = body[0] ?? null
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  return { projectId: PROJECT }
}
