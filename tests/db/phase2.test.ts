// @vitest-environment node
// Phase 2: invitations, team management and the G0/G1 automatic checks (brief §6.3, §7).
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asAdmin, createTestDb, createUser, queryAs } from './harness'

let db: PGlite

beforeAll(async () => {
  db = await createTestDb()
})

const emailOf = async (id: string) =>
  (await asAdmin<{ email: string }>(db, `select email from auth.users where id = $1`, [id]))[0]!.email

async function newProject() {
  const pi = await createUser(db)
  const [row] = await queryAs<{ id: string }>(db, pi, `select public.create_project('programme', 'Lagos PHC Fund') as id`)
  return { pi, project: row!.id }
}

async function invite(pi: string, project: string, email: string, role: string) {
  const [row] = await queryAs<{ token: string }>(db, pi, `select public.invite_member($1, $2, $3) as token`, [
    project,
    email,
    role,
  ])
  return row!.token
}

describe('invitations (brief §7: roles only by invitation)', () => {
  it('lets the PI invite, and the invitee accept with the link', async () => {
    const { pi, project } = await newProject()
    const invitee = await createUser(db)
    const token = await invite(pi, project, (await emailOf(invitee)).toUpperCase(), 'assessor')

    const [preview] = await queryAs<{ subject_name: string; role: string }>(
      db,
      invitee,
      `select * from public.invitation_preview($1)`,
      [token],
    )
    expect(preview).toMatchObject({ subject_name: 'Lagos PHC Fund', role: 'assessor' })

    await queryAs(db, invitee, `select public.accept_invitation($1)`, [token])
    const roles = await asAdmin<{ role: string }>(db, `select role from project_members where project_id = $1 and user_id = $2`, [
      project,
      invitee,
    ])
    expect(roles.map((r) => r.role)).toEqual(['assessor'])
    await expect(queryAs(db, invitee, `select public.accept_invitation($1)`, [token])).rejects.toThrow(/already been used/)
  })

  it('stores only a hash of the token', async () => {
    const { pi, project } = await newProject()
    const token = await invite(pi, project, 'someone@example.org', 'reviewer')
    const rows = await asAdmin<{ token_hash: string }>(db, `select token_hash from invitations where project_id = $1`, [project])
    expect(rows[0]!.token_hash).not.toContain(token)
    expect(rows[0]!.token_hash).toHaveLength(64)
  })

  it('rejects a link used by a different account', async () => {
    const { pi, project } = await newProject()
    const intended = await createUser(db)
    const other = await createUser(db)
    const token = await invite(pi, project, await emailOf(intended), 'observer')
    await expect(queryAs(db, other, `select public.accept_invitation($1)`, [token])).rejects.toThrow(/different email/)
  })

  it('shows pending invitations on the invitee’s home page and accepts them by id', async () => {
    const { pi, project } = await newProject()
    const invitee = await createUser(db)
    await invite(pi, project, await emailOf(invitee), 'kt_lead')
    const mine = await queryAs<{ invitation_id: string; role: string }>(db, invitee, `select * from public.my_invitations()`)
    expect(mine).toHaveLength(1)
    expect(mine[0]!.role).toBe('kt_lead')
    await queryAs(db, invitee, `select public.accept_invitation_by_id($1)`, [mine[0]!.invitation_id])
    expect(await queryAs(db, invitee, `select * from public.my_invitations()`)).toEqual([])
  })

  it('refuses withdrawn invitations', async () => {
    const { pi, project } = await newProject()
    const invitee = await createUser(db)
    const token = await invite(pi, project, await emailOf(invitee), 'assessor')
    const [inv] = await asAdmin<{ id: string }>(db, `select id from invitations where project_id = $1`, [project])
    await queryAs(db, pi, `select public.revoke_invitation($1)`, [inv!.id])
    await expect(queryAs(db, invitee, `select public.accept_invitation($1)`, [token])).rejects.toThrow(/expired or was withdrawn/)
  })

  it('only the PI (or institution admin) can invite, and nobody can invite a second PI', async () => {
    const { pi, project } = await newProject()
    const assessor = await createUser(db)
    await queryAs(db, assessor, `select public.accept_invitation($1)`, [
      await invite(pi, project, await emailOf(assessor), 'assessor'),
    ])
    await expect(invite(assessor, project, 'x@example.org', 'reviewer')).rejects.toThrow(/Only the PI/)
    await expect(invite(pi, project, 'x@example.org', 'pi')).rejects.toThrow(/exactly one PI/)
    await expect(invite(pi, project, 'not-an-email', 'reviewer')).rejects.toThrow(/valid email/)
  })

  it('outsiders cannot list a project’s invitations', async () => {
    const { pi, project } = await newProject()
    await invite(pi, project, 'someone@example.org', 'reviewer')
    const outsider = await createUser(db)
    expect(await queryAs(db, outsider, `select * from invitations where project_id = $1`, [project])).toEqual([])
    expect(await queryAs(db, pi, `select * from invitations where project_id = $1`, [project])).toHaveLength(1)
  })
})

describe('team management', () => {
  it('members declare their own conflicts of interest, not other people’s', async () => {
    const { pi, project } = await newProject()
    const a = await createUser(db)
    const b = await createUser(db)
    for (const u of [a, b]) {
      await queryAs(db, u, `select public.accept_invitation($1)`, [await invite(pi, project, await emailOf(u), 'assessor')])
    }
    await queryAs(db, a, `update project_members set coi_declared_at = now(), coi_statement = 'None' where user_id = $1 and project_id = $2`, [
      a,
      project,
    ])
    await queryAs(db, a, `update project_members set coi_declared_at = now() where user_id = $1 and project_id = $2`, [b, project])
    const rows = await asAdmin<{ user_id: string; declared: boolean }>(
      db,
      `select user_id, coi_declared_at is not null as declared from project_members where project_id = $1 and role = 'assessor'`,
      [project],
    )
    expect(rows.find((r) => r.user_id === a)?.declared).toBe(true)
    expect(rows.find((r) => r.user_id === b)?.declared).toBe(false)
  })

  it('the PI can remove members but not themselves', async () => {
    const { pi, project } = await newProject()
    const o = await createUser(db)
    await queryAs(db, o, `select public.accept_invitation($1)`, [await invite(pi, project, await emailOf(o), 'observer')])
    const members = await asAdmin<{ id: string; role: string }>(db, `select id, role from project_members where project_id = $1`, [
      project,
    ])
    await queryAs(db, pi, `select public.remove_member($1)`, [members.find((m) => m.role === 'observer')!.id])
    await expect(queryAs(db, pi, `select public.remove_member($1)`, [members.find((m) => m.role === 'pi')!.id])).rejects.toThrow(
      /exactly one PI/,
    )
  })
})

describe('automatic gate checks (brief §6.3)', () => {
  async function review(user: string, project: string, gate: string) {
    const [r] = await queryAs<{ id: string }>(db, user, `select public.refresh_gate_review($1, $2) as id`, [project, gate])
    return asAdmin<{ key: string | null; answer: string; auto: boolean; evidence: Record<string, unknown> | null }>(
      db,
      `select gc.auto_check_key as key, r.answer, r.auto, r.auto_evidence as evidence
       from gate_criterion_responses r join gate_criteria gc on gc.id = r.criterion_id
       where r.gate_review_id = $1 order by gc.sort`,
      [r!.id],
    )
  }

  it('pre-fills G0 from the decision record and shows what is missing', async () => {
    const { pi, project } = await newProject()
    await queryAs(db, pi, `select public.start_scoping($1)`, [project])
    let rows = await review(pi, project, 'G0')
    expect(rows.find((r) => r.key === 'subject_type_set')?.answer).toBe('yes')
    const decision = rows.find((r) => r.key === 'decision_recorded')!
    expect(decision.answer).toBe('no')
    expect(decision.evidence).toEqual({ missing: ['decision', 'decision_maker', 'decision_window'] })

    await queryAs(
      db,
      pi,
      `insert into decision_records (project_id, decision_text, decision_maker_name, window_start, window_end, hr_screen_result)
       values ($1, 'Renew the fund', 'State Health Board', '2026-11-01', '2027-01-31', 'pass')`,
      [project],
    )
    rows = await review(pi, project, 'G0')
    expect(rows.filter((r) => r.auto).every((r) => r.answer === 'yes')).toBe(true)
  })

  it('never lets the owner overwrite an automatic "No"', async () => {
    const { pi, project } = await newProject()
    await queryAs(db, pi, `select public.start_scoping($1)`, [project])
    const rows = await review(pi, project, 'G0')
    expect(rows.find((r) => r.key === 'decision_recorded')?.answer).toBe('no')
    const [crit] = await asAdmin<{ id: string }>(db, `select id from gate_criteria where auto_check_key = 'decision_recorded'`)
    await queryAs(db, pi, `select public.save_gate_review($1, 'G0', $2)`, [
      project,
      JSON.stringify([{ criterion_id: crit!.id, answer: 'yes', note: 'Agreed verbally' }]),
    ])
    const [after] = await asAdmin<{ answer: string; note: string }>(
      db,
      `select r.answer, r.note from gate_criterion_responses r where r.criterion_id = $1
       and r.gate_review_id = (select id from gate_reviews where project_id = $2)`,
      [crit!.id, project],
    )
    expect(after).toEqual({ answer: 'no', note: 'Agreed verbally' })
  })

  it('checks G1 actors, assessors, COI and the community-voice plan', async () => {
    const { pi, project } = await newProject()
    await asAdmin(db, `update assessment_projects set status = 'context' where id = $1`, [project])
    let rows = await review(pi, project, 'G1')
    expect(rows.find((r) => r.key === 'actor_categories_complete')?.evidence).toEqual({
      missing_categories: ['funder', 'implementer', 'community', 'government'],
    })
    expect(rows.find((r) => r.key === 'min_assessors_or_single')?.answer).toBe('no')

    await queryAs(
      db,
      pi,
      `insert into context_profiles (project_id, financing, governance, target_population, community_voice_plan)
       values ($1, 'Basket fund', 'Steering committee', 'Rural households', 'Two community seats in deliberation')`,
      [project],
    )
    await queryAs(
      db,
      pi,
      `insert into actors (project_id, category, name) values ($1,'funder','Donor A'),($1,'implementer','NGO B'),
       ($1,'community','Ward health committee'),($1,'government','State MoH')`,
      [project],
    )
    const a = await createUser(db)
    await queryAs(db, a, `select public.accept_invitation($1)`, [await invite(pi, project, await emailOf(a), 'assessor')])
    await queryAs(db, pi, `update assessment_projects set single_assessor = true where id = $1`, [project])
    rows = await review(pi, project, 'G1')
    expect(rows.find((r) => r.key === 'coi_all_assessors')?.answer).toBe('no')
    await queryAs(db, a, `update project_members set coi_declared_at = now() where user_id = $1 and project_id = $2`, [a, project])
    rows = await review(pi, project, 'G1')
    for (const key of ['context_complete', 'actor_categories_complete', 'coi_all_assessors', 'min_assessors_or_single', 'community_voice_plan']) {
      expect(rows.find((r) => r.key === key)?.answer, key).toBe('yes')
    }
  })

  it('tracks conditions from a conditional go on the next gate (PLAN D-17)', async () => {
    const { pi, project } = await newProject()
    await queryAs(db, pi, `select public.start_scoping($1)`, [project])
    await queryAs(
      db,
      pi,
      `insert into decision_records (project_id, decision_text, decision_maker_name, window_start, window_end, hr_screen_result)
       values ($1, 'Renew', 'Board', '2026-11-01', '2027-01-31', 'pass')`,
      [project],
    )
    const [manual] = await asAdmin<{ id: string }>(db, `select id from gate_criteria where gate = 'G0' and auto_check_key is null`)
    await queryAs(db, pi, `select public.save_gate_review($1, 'G0', $2)`, [
      project,
      JSON.stringify([{ criterion_id: manual!.id, answer: 'yes' }]),
    ])
    await queryAs(db, pi, `select public.decide_gate($1, 'G0', 'conditional_go', 'Confirm the decision window in writing')`, [project])
    const rows = await review(pi, project, 'G1')
    expect(rows.find((r) => r.key === 'previous_conditions_resolved')).toMatchObject({ answer: 'no', evidence: { open_conditions: 1 } })
  })
})
