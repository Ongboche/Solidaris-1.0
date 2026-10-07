// @vitest-environment node
// Phases 6–7: uptake (G7), signals and learning (G8), reassessment, administration,
// framework versioning, audit-chain verification and M&E indicators.
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asAdmin, createTestDb, createUser, queryAs } from './harness'

let db: PGlite
let pi: string, kt: string, observer: string, admin: string
let project: string

async function autoAnswers(user: string, gate: string, p = project) {
  await queryAs(db, user, `select public.refresh_gate_review($1, $2)`, [p, gate])
  return asAdmin<{ key: string; answer: string; evidence: Record<string, unknown> }>(
    db,
    `select gc.auto_check_key as key, r.answer, r.auto_evidence as evidence
     from gate_criterion_responses r join gate_criteria gc on gc.id = r.criterion_id
     join gate_reviews g on g.id = r.gate_review_id
     where g.project_id = $1 and g.gate = $2 and g.owner_decision is null and r.auto`,
    [p, gate],
  )
}

async function passGate(user: string, gate: string, p = project) {
  const criteria = await asAdmin<{ id: string }>(db, `select id from gate_criteria where gate = $1`, [gate])
  await queryAs(db, user, `select public.save_gate_review($1, $2, $3)`, [
    p, gate, JSON.stringify(criteria.map((c) => ({ criterion_id: c.id, answer: 'yes' }))),
  ])
  return (await queryAs<{ s: string }>(db, user, `select public.decide_gate($1, $2, 'go') as s`, [p, gate]))[0]!.s
}

beforeAll(async () => {
  db = await createTestDb()
  const users = await Promise.all(Array.from({ length: 4 }, () => createUser(db)))
  ;[pi, kt, observer, admin] = users as [string, string, string, string]
  await asAdmin(db, `update profiles set platform_role = 'platform_admin' where id = $1`, [admin])
  const [row] = await queryAs<{ id: string }>(db, pi, `select public.create_project('programme', 'Benue PHC Fund') as id`)
  project = row!.id
  await asAdmin(db, `insert into project_members (project_id, user_id, role) values ($1, $2, 'kt_lead'), ($1, $3, 'observer')`, [project, kt, observer])
  // Fast-forward to the uptake stage: G0–G6 passed.
  for (const g of ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6'])
    await asAdmin(db, `insert into gate_reviews (project_id, gate, owner_decision, decided_at) values ($1, $2, 'go', now())`, [project, g])
  await asAdmin(db, `update assessment_projects set status = 'uptake' where id = $1`, [project])
})

describe('T9 uptake and G7', () => {
  it('needs a delivered KT product, a recorded response and a follow-up date', async () => {
    let auto = await autoAnswers(kt, 'G7')
    const g7 = ['kt_product_logged', 'response_recorded', 'follow_up_date_set']
    expect(auto.filter((a) => g7.includes(a.key)).map((a) => a.answer)).toEqual(['no', 'no', 'no'])

    await queryAs(db, kt, `insert into kt_products (project_id, audience, format, delivered_to, delivered_on) values ($1, 'State board', 'Policy brief', 'Commissioner for Health', '2027-02-01')`, [project])
    await expect(
      queryAs(db, kt, `insert into decision_responses (project_id, response_type) values ($1, 'no_action')`, [project]),
    ).rejects.toThrow(/check/)
    await queryAs(db, kt, `insert into decision_responses (project_id, response_type, summary, follow_up_on) values ($1, 'action_plan', 'Board adopted three actions', '2027-08-01')`, [project])
    auto = await autoAnswers(kt, 'G7')
    expect(auto.find((a) => a.key === 'response_recorded')).toMatchObject({ answer: 'no', evidence: { actions: 0 } })

    await queryAs(db, kt, `insert into action_items (project_id, description, owner_id, due_on) values ($1, 'Publish allocation formula', $2, '2027-04-30')`, [project, pi])
    auto = await autoAnswers(kt, 'G7')
    expect(auto.every((a) => a.answer === 'yes')).toBe(true)
  })

  it('lets action owners update only their own actions', async () => {
    const [mine] = await asAdmin<{ id: string }>(db, `select id from action_items where project_id = $1`, [project])
    await queryAs(db, observer, `update action_items set status = 'done' where id = $1`, [mine!.id])
    expect((await asAdmin<{ status: string }>(db, `select status from action_items where id = $1`, [mine!.id]))[0]?.status).toBe('open')
    await queryAs(db, pi, `update action_items set status = 'done' where id = $1`, [mine!.id])
    expect((await asAdmin<{ status: string }>(db, `select status from action_items where id = $1`, [mine!.id]))[0]?.status).toBe('done')
  })

  it('is decided by the KT lead', async () => {
    await expect(passGate(pi, 'G7')).rejects.toThrow(/Only the kt_lead/)
    expect(await passGate(kt, 'G7')).toBe('learning')
  })
})

describe('T7 signals, T10 learning and G8', () => {
  it('requires every signal to be reviewed — observations, never scores (invariant 10)', async () => {
    const [subj] = await asAdmin<{ subject_id: string }>(db, `select subject_id from assessment_projects where id = $1`, [project])
    await queryAs(
      db,
      kt,
      `insert into signal_observations (subject_id, project_id, domain_id, observed_on, source, description, level)
       select $1, $2, id, current_date, 'Budget circular', 'Domestic budget line not released', 'act' from domains where code = 'D7'`,
      [subj!.subject_id, project],
    )
    let auto = await autoAnswers(pi, 'G8')
    expect(auto.find((a) => a.key === 'signals_reviewed')).toMatchObject({ answer: 'no', evidence: { signals: 1, unreviewed: 1 } })
    await queryAs(db, pi, `update signal_observations set reviewed_at = now() where project_id = $1`, [project])
    auto = await autoAnswers(pi, 'G8')
    expect(auto.find((a) => a.key === 'signals_reviewed')?.answer).toBe('yes')
    const cols = await asAdmin<{ column_name: string }>(db, `select column_name from information_schema.columns where table_name = 'signal_observations'`)
    for (const c of cols) expect(c.column_name).not.toMatch(/probab|forecast|score|risk/)
  })

  it('needs a follow-up review with a reassessment decision; lessons are advisory', async () => {
    await queryAs(db, pi, `insert into follow_up_reviews (project_id, reviewed_on, notes, reassessment_decision) values ($1, '2027-08-15', 'Two of three actions done', 'reassess')`, [project])
    let auto = await autoAnswers(pi, 'G8')
    expect(auto.find((a) => a.key === 'lessons_logged')?.answer).toBe('no')
    await queryAs(db, pi, `insert into framework_lessons (project_id, framework_version_id, lesson) select $1, framework_version_id, 'D3 prompts need a co-financing example' from assessment_projects where id = $1`, [project])
    auto = await autoAnswers(pi, 'G8')
    expect(auto.every((a) => a.answer === 'yes')).toBe(true)
    expect(await passGate(pi, 'G8')).toBe('closed')
  })

  it('starts one linked reassessment cycle for the same subject', async () => {
    const [row] = await queryAs<{ id: string }>(db, pi, `select public.start_reassessment($1) as id`, [project])
    const [next] = await asAdmin<{ status: string; previous_project_id: string; assessment_type: string }>(
      db, `select status, previous_project_id, assessment_type from assessment_projects where id = $1`, [row!.id])
    expect(next).toEqual({ status: 'scoping', previous_project_id: project, assessment_type: 'reassessment' })
    const [f] = await asAdmin<{ next_project_id: string }>(db, `select next_project_id from follow_up_reviews where project_id = $1`, [project])
    expect(f?.next_project_id).toBe(row!.id)
    await expect(queryAs(db, pi, `select public.start_reassessment($1)`, [project])).rejects.toThrow(/already exists/)
  })
})

describe('administration', () => {
  it('only platform admins change roles, and the last admin cannot be demoted', async () => {
    await expect(queryAs(db, pi, `select public.admin_set_user($1, 'platform_admin', null)`, [pi])).rejects.toThrow(/Only platform administrators/)
    await expect(queryAs(db, admin, `select public.admin_set_user($1, 'member', null)`, [admin])).rejects.toThrow(/at least one/)
    const [inst] = await queryAs<{ id: string }>(db, admin, `insert into institutions (name, country) values ('ABU Zaria', 'Nigeria') returning id`)
    await queryAs(db, admin, `select public.admin_set_user($1, 'institution_admin', $2)`, [observer, inst!.id])
    const [p] = await asAdmin<{ platform_role: string }>(db, `select platform_role from profiles where id = $1`, [observer])
    expect(p?.platform_role).toBe('institution_admin')
  })

  it('clones a framework into an editable draft; published versions stay frozen (invariant 9)', async () => {
    const [v1] = await asAdmin<{ id: string }>(db, `select id from framework_versions where label = 'v1'`)
    const [row] = await queryAs<{ id: string }>(db, admin, `select public.clone_framework_version($1, 'v2-draft') as id`, [v1!.id])
    const counts = await asAdmin<{ d: number; i: number; g: number }>(
      db,
      `select (select count(*)::int from domains where framework_version_id = $1) d,
              (select count(*)::int from indicators i join domains d on d.id = i.domain_id where d.framework_version_id = $1) i,
              (select count(*)::int from gate_criteria where framework_version_id = $1) g`,
      [row!.id],
    )
    expect(counts[0]).toEqual({ d: 9, i: 28, g: 43 })
    await queryAs(db, admin, `update indicators set prompt = 'Revised prompt' where domain_id in (select id from domains where framework_version_id = $1 and code = 'D3') and sort = 1`, [row!.id])
    await expect(queryAs(db, admin, `update indicators set prompt = 'x' where domain_id in (select id from domains where framework_version_id = $1)`, [v1!.id])).rejects.toThrow(/invariant 9/)
    await expect(queryAs(db, pi, `select public.clone_framework_version($1, 'mine')`, [v1!.id])).rejects.toThrow(/Only platform administrators/)
  })

  it('hashes the same way whatever the session time zone', async () => {
    await asAdmin(db, `set timezone = 'Africa/Lagos'`)
    await queryAs(db, pi, `insert into framework_lessons (project_id, framework_version_id, lesson) select $1, framework_version_id, 'Written from a WAT session' from assessment_projects where id = $1`, [project])
    await asAdmin(db, `set timezone = 'UTC'`)
    const [ok] = await queryAs<{ r: { valid: boolean } }>(db, admin, `select public.verify_audit_chain() as r`)
    expect(ok?.r.valid).toBe(true)
  })

  it('verifies the audit chain and detects tampering by a database superuser (invariant 8)', async () => {
    const [ok] = await queryAs<{ r: { valid: boolean; entries: number } }>(db, admin, `select public.verify_audit_chain() as r`)
    expect(ok?.r.valid).toBe(true)
    expect(ok?.r.entries).toBeGreaterThan(10)
    await expect(queryAs(db, pi, `select public.verify_audit_chain()`)).rejects.toThrow(/Only platform administrators/)

    // Simulate an attacker with superuser rights bypassing the append-only trigger.
    await asAdmin(db, `alter table audit_log disable trigger audit_log_no_update`)
    await asAdmin(db, `update audit_log set action = 'tampered' where id = (select min(id) + 3 from audit_log)`)
    await asAdmin(db, `alter table audit_log enable trigger audit_log_no_update`)
    const [bad] = await queryAs<{ r: { valid: boolean } }>(db, admin, `select public.verify_audit_chain() as r`)
    expect(bad?.r.valid).toBe(false)
  })
})

describe('M&E indicators (brief §11)', () => {
  it('are for administrators only', async () => {
    await expect(queryAs(db, pi, `select public.me_indicators()`)).rejects.toThrow(/Only administrators/)
  })

  it('are computed from data and filterable', async () => {
    const [all] = await queryAs<{ r: Record<string, Record<string, unknown>> }>(db, admin, `select public.me_indicators() as r`)
    expect(all?.r.oc1).toMatchObject({ released_profiles: 1, released_with_action_plan: 1 })
    expect(all?.r.oc4).toMatchObject({ report_downloads: 0 })
    expect((all?.r.op3 as { first_pass: Record<string, unknown> }).first_pass).toHaveProperty('G7')
    const [none] = await queryAs<{ r: { projects: number } }>(db, admin, `select public.me_indicators('policy') as r`)
    expect(none?.r.projects).toBe(0)
  })
})
