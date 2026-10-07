// @vitest-environment node
// Phases 3–5 at the database level: one project from G0 to G6 through the real RPCs
// and row-level security, checking the brief's invariants on the way.
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite, Transaction } from '@electric-sql/pglite'
import { asAdmin, asUser, createTestDb, createUser, queryAs } from './harness'

let db: PGlite
let pi: string, a1: string, a2: string, reviewer: string, community: string, observer: string, outsider: string
let project: string
let e1: string
const NARRATIVE = 'Evidence from targeting documents and two community interviews supports this rating.'

async function addMember(p: string, user: string, role: string) {
  await asAdmin(db, `insert into project_members (project_id, user_id, role, coi_declared_at) values ($1, $2, $3, now())`, [
    p,
    user,
    role,
  ])
}

/** Answers every manual criterion "yes" (automatic ones keep their computed answer), then decides. */
async function passGate(user: string, gate: string, p = project) {
  const criteria = await asAdmin<{ id: string }>(db, `select id from gate_criteria where gate = $1`, [gate])
  await queryAs(db, user, `select public.save_gate_review($1, $2, $3)`, [
    p,
    gate,
    JSON.stringify(criteria.map((c) => ({ criterion_id: c.id, answer: 'yes' }))),
  ])
  return queryAs<{ s: string }>(db, user, `select public.decide_gate($1, $2, 'go') as s`, [p, gate])
}

async function autoAnswers(gate: string, p = project) {
  return asAdmin<{ key: string; answer: string; evidence: Record<string, unknown> }>(
    db,
    `select gc.auto_check_key as key, r.answer, r.auto_evidence as evidence
     from gate_criterion_responses r join gate_criteria gc on gc.id = r.criterion_id
     join gate_reviews g on g.id = r.gate_review_id
     where g.project_id = $1 and g.gate = $2 and g.owner_decision is null and r.auto`,
    [p, gate],
  )
}

async function refresh(user: string, gate: string, p = project) {
  await queryAs(db, user, `select public.refresh_gate_review($1, $2)`, [p, gate])
  return autoAnswers(gate, p)
}

async function completeAssessment(user: string, ratings: Record<string, number>, p = project, evidence = e1) {
  const [row] = await queryAs<{ id: string }>(db, user, `select public.start_assessment($1) as id`, [p])
  const assessment = row!.id
  await asUser(db, user, async (tx: Transaction) => {
    const rows = (
      await tx.query<{ id: string; code: string }>(
        `select r.id, d.code from domain_ratings r join domains d on d.id = r.domain_id where r.assessment_id = $1`,
        [assessment],
      )
    ).rows
    for (const r of rows) {
      await tx.query(`insert into rating_evidence_links (domain_rating_id, evidence_id) values ($1, $2)`, [r.id, evidence])
      await tx.query(
        `update domain_ratings set rating = $2, narrative = $3, confidence = 'medium', is_complete = true where id = $1`,
        [r.id, ratings[r.code] ?? 3, NARRATIVE],
      )
    }
  })
  return assessment
}

async function assessorIntegrity(user: string, assessment: string, p = project) {
  await asUser(db, user, async (tx) => {
    const [rev] = (
      await tx.query<{ id: string }>(
        `insert into integrity_reviews (project_id, scope, assessment_id, primary_type) values ($1, 'assessor', $2, 'instrumental') returning id`,
        [p, assessment],
      )
    ).rows
    await tx.query(
      `insert into integrity_flags (integrity_review_id, flag, level) select $1, f, 'low' from unnest(enum_range(null::risk_flag)) f`,
      [rev!.id],
    )
  })
}

beforeAll(async () => {
  db = await createTestDb()
  const users = await Promise.all(Array.from({ length: 7 }, () => createUser(db)))
  ;[pi, a1, a2, reviewer, community, observer, outsider] = users as [string, string, string, string, string, string, string]
  const [row] = await queryAs<{ id: string }>(db, pi, `select public.create_project('programme', 'Kaduna Equity Fund') as id`)
  project = row!.id
  await addMember(project, a1, 'assessor')
  await addMember(project, a2, 'assessor')
  await addMember(project, reviewer, 'reviewer')
})

describe('G0–G1 (Phase 2 recap)', () => {
  it('reaches the evidence stage', async () => {
    await queryAs(db, pi, `select public.start_scoping($1)`, [project])
    await queryAs(
      db,
      pi,
      `insert into decision_records (project_id, decision_text, decision_maker_name, window_start, window_end, hr_screen_result)
       values ($1, 'Renew the fund for 2027–2029', 'State Health Board', '2026-11-01', '2027-03-31', 'pass')`,
      [project],
    )
    expect((await passGate(pi, 'G0'))[0]?.s).toBe('context')
    await queryAs(
      db,
      pi,
      `insert into context_profiles (project_id, financing, governance, target_population, community_voice_plan)
       values ($1, 'Basket fund', 'Steering committee', 'Rural households', 'Ward committees join deliberation')`,
      [project],
    )
    await queryAs(
      db,
      pi,
      `insert into actors (project_id, category, name) values ($1,'funder','Donor'),($1,'implementer','NGO'),($1,'community','Ward committee'),($1,'government','SMoH')`,
      [project],
    )
    expect((await passGate(pi, 'G1'))[0]?.s).toBe('assessment') // PLAN D-52: assessment comes first
  })
})

describe('T3 assessment (G2): evidence is gathered while assessing', () => {
  let as1: string, as2: string

  it('lets assessors add evidence and gaps during the assessment stage', async () => {
    await asUser(db, a1, async (tx) => {
      const [doc] = (
        await tx.query<{ id: string }>(
          `insert into evidence_items (project_id, title, type, url, origin) values ($1, 'Fund strategy 2025', 'document', 'https://example.org/s', 'government') returning id`,
          [project],
        )
      ).rows
      e1 = doc!.id
      await tx.query(`insert into evidence_domain_links (evidence_id, domain_id) select $1, id from domains where code not in ('D3')`, [e1])
      await tx.query(
        `insert into evidence_gaps (project_id, domain_id, description, effect_on_confidence)
         select $1, id, 'Co-financing records not released', 'Lowers confidence' from domains where code = 'D3'`,
        [project],
      )
    })
  })

  it('requires the assessor’s own integrity review before submitting (PLAN D-7)', async () => {
    as1 = await completeAssessment(a1, { D1: 2, D2: 3 })
    as2 = await completeAssessment(a2, { D1: 5, D2: 4 })
    await expect(queryAs(db, a1, `select public.submit_assessment($1)`, [as1])).rejects.toThrow(/integrity review/)
    await assessorIntegrity(a1, as1)
    await assessorIntegrity(a2, as2)
    await queryAs(db, a1, `select public.submit_assessment($1)`, [as1])
  })

  it('reports outstanding assessors at G2 until everyone has submitted', async () => {
    let auto = await refresh(pi, 'G2')
    expect(auto.find((a) => a.key === 'all_assessors_submitted')).toMatchObject({
      answer: 'no',
      evidence: { submitted: 1, outstanding: 1 },
    })
    await queryAs(db, a2, `select public.submit_assessment($1)`, [as2])
    auto = await refresh(pi, 'G2')
    expect(auto.every((a) => a.answer === 'yes')).toBe(true)
  })

  it('keeps divergence private (invariant 4)', async () => {
    await expect(queryAs(db, pi, `select * from public.domain_divergence($1)`, [project])).rejects.toThrow(/permission denied/)
  })

  it('passes G2 without a reviewer step, moving to the evidence review', async () => {
    expect((await passGate(pi, 'G2'))[0]?.s).toBe('evidence')
  })
})

describe('T5 evidence review (G3): you cannot proceed without evidence', () => {
  it('checks evidence or gaps per domain, evidence types and community evidence for D5/D8', async () => {
    let auto = await refresh(pi, 'G3')
    expect(auto.find((a) => a.key === 'evidence_or_gap_all_domains')?.answer).toBe('yes')
    expect(auto.find((a) => a.key === 'min_two_evidence_types')?.answer).toBe('no')
    expect(auto.find((a) => a.key === 'community_evidence_d5_d8')?.evidence).toEqual({
      domains_without_community_evidence: ['D5', 'D8'],
    })
    // Without enough evidence the PI cannot pass G3 without a written override.
    await queryAs(db, reviewer, `select public.record_gate_verification($1, 'G3', 'verified', null)`, [project])
    await expect(passGate(pi, 'G3')).rejects.toThrow(/justification/)

    await asUser(db, a2, async (tx) => {
      const [fgd] = (
        await tx.query<{ id: string }>(
          `insert into evidence_items (project_id, title, type, url, origin) values ($1, 'Ward FGD notes', 'fgd', 'https://example.org/f', 'community') returning id`,
          [project],
        )
      ).rows
      await tx.query(`insert into evidence_domain_links (evidence_id, domain_id) select $1, id from domains where code in ('D5','D8')`, [fgd!.id])
    })
    auto = await refresh(pi, 'G3')
    expect(auto.every((a) => a.answer === 'yes')).toBe(true)
  })

  it('rejects files stored outside the project folder', async () => {
    await expect(
      queryAs(
        db,
        a1,
        `insert into evidence_items (project_id, title, type, storage_path, origin) values ($1, 'x', 'document', 'other-project/file.pdf', 'funder')`,
        [project],
      ),
    ).rejects.toThrow(/evidence_storage_path_in_project/)
  })

  it('passes G3 after reviewer verification', async () => {
    expect((await passGate(pi, 'G3'))[0]?.s).toBe('integrity')
  })
})
describe('T4 integrity and G4', () => {
  it('needs every section, all four flags, a type with evidence and a community participant', async () => {
    let auto = await refresh(reviewer, 'G4')
    expect(auto.find((a) => a.key === 'integrity_sections_complete')?.evidence).toEqual({ review_started: false })

    await asUser(db, pi, async (tx) => {
      const [rev] = (
        await tx.query<{ id: string }>(
          `insert into integrity_reviews (project_id, scope, alignment_goal_contradictions, alignment_funder_portfolio,
             alignment_values_vs_allocation, cost_who_bears, cost_transaction_proportionate, cost_shifted_to_local,
             cost_indirect_covered, voice_actual_involvement, voice_veto_power, voice_grievance_mechanisms,
             voice_input_led_to_change, primary_type, type_evidence)
           values ($1, 'project', 'a','b','c','d','e','f','g','h','i','j','k', 'instrumental', 'Steering minutes 2025') returning id`,
          [project],
        )
      ).rows
      await tx.query(
        `insert into integrity_flags (integrity_review_id, flag, level, explanation) values
         ($1,'washing','low',null),($1,'power','high','External donors hold budget authority'),($1,'sustainability','medium',null)`,
        [rev!.id],
      )
      await expect(
        tx.query(`insert into integrity_flags (integrity_review_id, flag, level) values ($1, 'inclusion', 'high')`, [rev!.id]),
      ).rejects.toThrow(/check/)
    }).catch(() => undefined)

    // The failed High-without-explanation insert rolled that transaction back; redo it cleanly.
    await asUser(db, pi, async (tx) => {
      const [rev] = (
        await tx.query<{ id: string }>(
          `insert into integrity_reviews (project_id, scope, alignment_goal_contradictions, alignment_funder_portfolio,
             alignment_values_vs_allocation, cost_who_bears, cost_transaction_proportionate, cost_shifted_to_local,
             cost_indirect_covered, voice_actual_involvement, voice_veto_power, voice_grievance_mechanisms,
             voice_input_led_to_change, primary_type, type_evidence)
           values ($1, 'project', 'a','b','c','d','e','f','g','h','i','j','k', 'instrumental', 'Steering minutes 2025') returning id`,
          [project],
        )
      ).rows
      await tx.query(
        `insert into integrity_flags (integrity_review_id, flag, level, explanation) values
         ($1,'washing','low',null),($1,'power','high','External donors hold budget authority'),($1,'sustainability','medium',null)`,
        [rev!.id],
      )
    })
    auto = await refresh(reviewer, 'G4')
    expect(auto.find((a) => a.key === 'flags_rated_high_explained')?.evidence).toEqual({ missing_flags: ['inclusion'] })
    expect(auto.find((a) => a.key === 'community_participant_scheduled')?.answer).toBe('no')

    const [rev] = await asAdmin<{ id: string }>(db, `select id from integrity_reviews where project_id = $1 and scope = 'project'`, [project])
    await queryAs(db, pi, `insert into integrity_flags (integrity_review_id, flag, level) values ($1, 'inclusion', 'medium')`, [rev!.id])
    await addMember(project, community, 'community_participant')
    auto = await refresh(reviewer, 'G4')
    expect(auto.every((a) => a.answer === 'yes')).toBe(true)
  })

  it('lets only the reviewer record integrity QA, and only through the RPC', async () => {
    await expect(queryAs(db, pi, `select public.record_integrity_qa($1, 'ok')`, [project])).rejects.toThrow(/Only a reviewer/)
    await expect(
      queryAs(db, pi, `update integrity_reviews set qa_at = now() where project_id = $1`, [project]),
    ).rejects.toThrow(/permission denied/)
    await queryAs(db, reviewer, `select public.record_integrity_qa($1, 'Checked against minutes')`, [project])
  })

  it('passes G4 (decided by the reviewer)', async () => {
    expect((await passGate(reviewer, 'G4'))[0]?.s).toBe('deliberation')
  })
})

describe('T6 deliberation, consensus and G5', () => {
  it('flags divergent domains until they are discussed', async () => {
    let auto = await refresh(pi, 'G5')
    expect(auto.find((a) => a.key === 'divergent_domains_discussed')?.evidence).toEqual({ undiscussed_domains: ['D1'] })
    await queryAs(
      db,
      a2,
      `insert into domain_discussions (project_id, domain_id, note) select $1, id, 'I weighted the district data more heavily' from domains where code = 'D1'`,
      [project],
    )
    auto = await refresh(pi, 'G5')
    expect(auto.find((a) => a.key === 'divergent_domains_discussed')?.answer).toBe('yes')
  })

  it('needs consensus or dissent for every domain, and never changes the independent ratings', async () => {
    const before = await asAdmin(db, `select id, rating, narrative from domain_ratings order by id`)
    await queryAs(
      db,
      pi,
      `insert into consensus_ratings (project_id, domain_id, rating, category, rationale, confidence)
       select $1, id, 3, 'substantial', 'Agreed after discussion', 'medium' from domains where code <> 'D2'`,
      [project],
    )
    await queryAs(
      db,
      pi,
      `insert into consensus_ratings (project_id, domain_id, rating, category, rationale)
       select $1, id, null, 'no_consensus', 'Views remain split' from domains where code = 'D2'`,
      [project],
    )
    let auto = await refresh(pi, 'G5')
    expect(auto.find((a) => a.key === 'consensus_or_dissent_all')?.evidence).toEqual({ domains_missing: ['D2'] })
    await queryAs(
      db,
      a2,
      `insert into dissent_records (project_id, domain_id, member_id, position, rationale)
       select $1, id, $2, 'Rating 4', 'Open-data releases since 2024' from domains where code = 'D2'`,
      [project, a2],
    )
    auto = await refresh(pi, 'G5')
    expect(auto.every((a) => a.answer === 'yes')).toBe(true)
    expect(await asAdmin(db, `select id, rating, narrative from domain_ratings order by id`)).toEqual(before)
  })

  it('runs the approval chain: no profile before PI approval; changes reset verification; then locked', async () => {
    expect(await queryAs(db, pi, `select * from public.profile_ratings($1)`, [project])).toEqual([])
    await expect(queryAs(db, pi, `select public.approve_profile($1)`, [project])).rejects.toThrow(/reviewer must verify/)
    await queryAs(db, reviewer, `select public.verify_consensus($1)`, [project])

    // Editing one domain sends it back for verification.
    await queryAs(
      db,
      pi,
      `update consensus_ratings set rationale = 'Agreed after second session' where project_id = $1 and domain_id = (select id from domains where code = 'D1')`,
      [project],
    )
    await expect(queryAs(db, pi, `select public.approve_profile($1)`, [project])).rejects.toThrow(/reviewer must verify/)
    await queryAs(db, reviewer, `select public.verify_consensus($1)`, [project])
    await queryAs(db, pi, `select public.approve_profile($1)`, [project])

    await expect(
      queryAs(db, pi, `update consensus_ratings set rating = 5 where project_id = $1`, [project]),
    ).rejects.toThrow(/locked/)
  })

  it('passes G5', async () => {
    expect((await passGate(pi, 'G5'))[0]?.s).toBe('validation')
  })
})

describe('T8 profile and G6', () => {
  it('gives a domain-level profile only — nine rows, no composite (invariant 1)', async () => {
    const rows = await queryAs<Record<string, unknown>>(db, pi, `select * from public.profile_ratings($1)`, [project])
    expect(rows).toHaveLength(9)
    expect(rows.find((r) => r.code === 'D2')).toMatchObject({ rating: null, category: 'no_consensus' })
    expect(rows.find((r) => r.code === 'D1')).toMatchObject({ rating: 3, source: 'consensus' })
    for (const key of Object.keys(rows[0]!)) expect(key).not.toMatch(/average|mean|index|score|total|overall/i)
  })

  it('hides the profile from observers until G6 and from outsiders always', async () => {
    await addMember(project, observer, 'observer')
    expect(await queryAs(db, observer, `select * from public.profile_ratings($1)`, [project])).toEqual([])
    expect(await queryAs(db, outsider, `select * from public.profile_ratings($1)`, [project])).toEqual([])
  })

  it('keeps report drafts as drafts until the PI approves them (invariant 11)', async () => {
    const [d] = await queryAs<{ id: string }>(
      db,
      pi,
      `insert into report_drafts (project_id, body, produced_by) values ($1, 'Auto-drafted from your entries — edit before use.', 'template') returning id`,
      [project],
    )
    await expect(queryAs(db, reviewer, `select public.approve_report_draft($1)`, [d!.id])).rejects.toThrow(/Only the PI/)
    await expect(
      queryAs(db, pi, `update report_drafts set produced_by = 'human' where id = $1`, [d!.id]),
    ).rejects.toThrow(/permission denied/)
    await queryAs(db, pi, `select public.approve_report_draft($1)`, [d!.id])
    await queryAs(db, pi, `update report_drafts set body = 'changed' where id = $1`, [d!.id])
    const [after] = await asAdmin<{ body: string }>(db, `select body from report_drafts where id = $1`, [d!.id])
    expect(after?.body).toContain('Auto-drafted')
  })

  it('checks reviewer QA and member-checks at G6, then shows the profile to observers', async () => {
    let auto = await refresh(pi, 'G6')
    expect(auto.find((a) => a.key === 'member_check_recorded')?.answer).toBe('no')
    expect(auto.find((a) => a.key === 'domain_level_only')?.answer).toBe('yes')
    await queryAs(
      db,
      pi,
      `insert into member_checks (project_id, stakeholder_group, response, relevance, checked_on)
       values ($1, 'Ward health committees', 'Profile reflects our experience', 4, '2027-01-10')`,
      [project],
    )
    await queryAs(db, reviewer, `select public.record_gate_verification($1, 'G6', 'verified', null)`, [project])
    auto = await refresh(pi, 'G6')
    expect(auto.every((a) => a.answer === 'yes')).toBe(true)
    expect((await passGate(pi, 'G6'))[0]?.s).toBe('uptake')
    expect(await queryAs(db, observer, `select code from public.profile_ratings($1)`, [project])).toHaveLength(9)
  })
})

describe('Exploratory (single-assessor) projects', () => {
  it('build the profile from the one submitted assessment, labelled single_assessor', async () => {
    const lead = await createUser(db)
    const solo = await createUser(db)
    const [row] = await queryAs<{ id: string }>(db, lead, `select public.create_project('policy', 'Health levy') as id`)
    const p = row!.id
    await addMember(p, solo, 'assessor')
    await asAdmin(db, `update assessment_projects set status = 'assessment', single_assessor = true where id = $1`, [p])
    const [ev] = await queryAs<{ id: string }>(
      db,
      solo,
      `insert into evidence_items (project_id, title, type, url, origin) values ($1, 'Levy act', 'document', 'https://example.org/l', 'government') returning id`,
      [p],
    )
    const a = await completeAssessment(solo, { D1: 4 }, p, ev!.id)
    await assessorIntegrity(solo, a, p)
    await queryAs(db, solo, `select public.submit_assessment($1)`, [a])
    await asAdmin(db, `update assessment_projects set status = 'deliberation' where id = $1`, [p])
    await asAdmin(db, `insert into gate_reviews (project_id, gate, owner_decision, decided_at) values ($1, 'G2', 'go', now())`, [p])

    const auto = await refresh(lead, 'G5', p)
    expect(auto.find((x) => x.key === 'consensus_or_dissent_all')?.evidence).toEqual({ exploratory: true })
    await queryAs(db, lead, `select public.approve_profile($1)`, [p])
    const rows = await queryAs<{ code: string; rating: number; source: string }>(db, lead, `select * from public.profile_ratings($1)`, [p])
    expect(rows.find((r) => r.code === 'D1')).toMatchObject({ rating: 4, source: 'single_assessor' })
  })
})
