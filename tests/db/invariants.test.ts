// @vitest-environment node
// Brief §14 invariant tests, run against the real migrations in PGlite.
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite, Transaction } from '@electric-sql/pglite'
import { asAdmin, asUser, CONSENTED, createTestDb, createUser, queryAs } from './harness'

let db: PGlite

beforeAll(async () => {
  db = await createTestDb()
})

const NARRATIVE = 'Targeting documents show priority for the lowest-coverage districts in two of three regions.'

type Team = { pi: string; a1: string; a2: string; reviewer: string; outsider: string; project: string }

async function makeTeam(status = 'assessment'): Promise<Team> {
  const [pi, a1, a2, reviewer, outsider] = await Promise.all([
    createUser(db),
    createUser(db),
    createUser(db),
    createUser(db),
    createUser(db),
  ])
  const [row] = await queryAs<{ id: string }>(
    db,
    pi!,
    `select public.create_project('programme', 'Kaduna Equity Fund') as id`,
  )
  const project = row!.id
  for (const [user, role] of [
    [a1, 'assessor'],
    [a2, 'assessor'],
    [reviewer, 'reviewer'],
  ] as const) {
    await asAdmin(db, `insert into project_members (project_id, user_id, role) values ($1, $2, $3)`, [
      project,
      user,
      role,
    ])
  }
  await asAdmin(db, `update assessment_projects set status = $2 where id = $1`, [project, status])
  return { pi: pi!, a1: a1!, a2: a2!, reviewer: reviewer!, outsider: outsider!, project }
}

async function startAssessment(t: Team, assessor: string) {
  const [row] = await queryAs<{ id: string }>(db, assessor, `select public.start_assessment($1) as id`, [t.project])
  return row!.id
}

async function ratingId(assessment: string, code: string) {
  const [row] = await asAdmin<{ id: string }>(
    db,
    `select r.id from domain_ratings r join domains d on d.id = r.domain_id where r.assessment_id = $1 and d.code = $2`,
    [assessment, code],
  )
  return row!.id
}

/** Fill one rating so it satisfies invariant 3 (evidence linked first, then marked complete). */
async function completeRating(tx: Transaction, project: string, rating: string, value = 3) {
  const [ev] = (
    await tx.query<{ id: string }>(
      `insert into evidence_items (project_id, title, type, url, origin)
       values ($1, 'Targeting criteria 2025', 'document', 'https://example.org/doc', 'government') returning id`,
      [project],
    )
  ).rows
  await tx.query(`insert into rating_evidence_links (domain_rating_id, evidence_id) values ($1, $2)`, [
    rating,
    ev!.id,
  ])
  await tx.query(
    `update domain_ratings set rating = $2, narrative = $3, confidence = 'medium', is_complete = true where id = $1`,
    [rating, value, NARRATIVE],
  )
}

async function completeAll(t: Team, assessor: string) {
  const assessment = await startAssessment(t, assessor)
  const ratings = await asAdmin<{ id: string }>(db, `select id from domain_ratings where assessment_id = $1`, [
    assessment,
  ])
  await asUser(db, assessor, async (tx) => {
    for (const r of ratings) await completeRating(tx, t.project, r.id)
  })
  return assessment
}

describe('accounts and roles', () => {
  it('self-registration creates a member and ignores any role in the metadata (defect 2)', async () => {
    const id = await createUser(db, { full_name: 'Sneaky', platform_role: 'platform_admin', role: 'owner', ...CONSENTED })
    const [p] = await asAdmin<{ platform_role: string }>(db, `select platform_role from profiles where id = $1`, [id])
    expect(p?.platform_role).toBe('member')
  })

  it('users cannot promote themselves', async () => {
    const id = await createUser(db)
    await expect(
      queryAs(db, id, `update profiles set platform_role = 'platform_admin' where id = $1`, [id]),
    ).rejects.toThrow(/permission denied/)
  })

  it('users without the required consents cannot create projects', async () => {
    const id = await createUser(db, { full_name: 'OAuth user' })
    await expect(queryAs(db, id, `select public.create_project('policy', 'X')`)).rejects.toThrow(/data protection/)
  })

  it('a project has exactly one PI, who cannot be removed', async () => {
    const t = await makeTeam('draft')
    await expect(
      asAdmin(db, `insert into project_members (project_id, user_id, role) values ($1, $2, 'pi')`, [t.project, t.a1]),
    ).rejects.toThrow(/project_members_one_pi/)
    await expect(asAdmin(db, `delete from project_members where project_id = $1 and role = 'pi'`, [t.project])).rejects.toThrow(
      /exactly one PI/,
    )
  })

  it('outsiders cannot see a project', async () => {
    const t = await makeTeam('draft')
    expect(await queryAs(db, t.outsider, `select id from assessment_projects where id = $1`, [t.project])).toEqual([])
    expect(await queryAs(db, t.a1, `select id from assessment_projects where id = $1`, [t.project])).toHaveLength(1)
  })

  it('project status cannot be written directly, even by the PI', async () => {
    const t = await makeTeam('draft')
    await expect(
      queryAs(db, t.pi, `update assessment_projects set status = 'closed' where id = $1`, [t.project]),
    ).rejects.toThrow(/permission denied/)
  })
})

describe('invariant 2: unrated is not zero', () => {
  it('new ratings start as NULL and 0 is rejected', async () => {
    const t = await makeTeam()
    const a = await startAssessment(t, t.a1)
    const rows = await asAdmin<{ rating: number | null }>(db, `select rating from domain_ratings where assessment_id = $1`, [a])
    expect(rows).toHaveLength(9)
    expect(rows.every((r) => r.rating === null)).toBe(true)
    const r = await ratingId(a, 'D1')
    await expect(queryAs(db, t.a1, `update domain_ratings set rating = 0 where id = $1`, [r])).rejects.toThrow(/check/)
    await expect(queryAs(db, t.a1, `update domain_ratings set rating = 6 where id = $1`, [r])).rejects.toThrow(/check/)
  })
})

describe('invariant 3: evidence before judgement', () => {
  it('rejects completion without rating, narrative, confidence and evidence', async () => {
    const t = await makeTeam()
    const r = await ratingId(await startAssessment(t, t.a1), 'D2')
    await expect(
      queryAs(db, t.a1, `update domain_ratings set rating = 4, is_complete = true where id = $1`, [r]),
    ).rejects.toThrow(/narrative_too_short.*confidence_missing.*evidence_or_gap_missing/)
    await expect(
      queryAs(db, t.a1, `update domain_ratings set rating = 4, narrative = 'too short', confidence = 'high', is_complete = true where id = $1`, [r]),
    ).rejects.toThrow(/narrative_too_short/)
  })

  it('accepts completion once a documented gap is linked instead of evidence', async () => {
    const t = await makeTeam()
    const a = await startAssessment(t, t.a1)
    const r = await ratingId(a, 'D3')
    await asUser(db, t.a1, async (tx) => {
      const [d] = (await tx.query<{ id: string }>(`select id from domains where code = 'D3'`)).rows
      const [gap] = (
        await tx.query<{ id: string }>(
          `insert into evidence_gaps (project_id, domain_id, description, effect_on_confidence)
           values ($1, $2, 'No co-financing records released', 'Lowers confidence') returning id`,
          [t.project, d!.id],
        )
      ).rows
      await tx.query(`insert into rating_gap_links (domain_rating_id, gap_id) values ($1, $2)`, [r, gap!.id])
      await tx.query(
        `update domain_ratings set rating = 2, narrative = $2, confidence = 'low', is_complete = true where id = $1`,
        [r, NARRATIVE],
      )
    })
    const [row] = await asAdmin<{ is_complete: boolean }>(db, `select is_complete from domain_ratings where id = $1`, [r])
    expect(row?.is_complete).toBe(true)
    await expect(queryAs(db, t.a1, `delete from rating_gap_links where domain_rating_id = $1`, [r])).rejects.toThrow(
      /last evidence or gap/,
    )
  })
})

describe('invariant 4: independent assessment', () => {
  it('hides other assessors’ ratings from everyone until G3 is passed', async () => {
    const t = await makeTeam()
    const a = await completeAll(t, t.a1)
    for (const viewer of [t.a2, t.pi, t.reviewer, t.outsider]) {
      expect(await queryAs(db, viewer, `select id from domain_ratings where assessment_id = $1`, [a])).toEqual([])
      expect(await queryAs(db, viewer, `select id from assessments where id = $1`, [a])).toEqual([])
    }
    expect(await queryAs(db, t.a1, `select id from domain_ratings where assessment_id = $1`, [a])).toHaveLength(9)

    // PI sees progress only, without ratings (PLAN D-6)
    const progress = await queryAs<{ complete_domains: number }>(db, t.pi, `select * from public.assessment_progress($1)`, [t.project])
    expect(progress[0]?.complete_domains).toBe(9)
    expect(Object.keys(progress[0]!)).not.toContain('rating')

    await asAdmin(db, `insert into gate_reviews (project_id, gate, owner_decision, decided_at) values ($1, 'G3', 'go', now())`, [
      t.project,
    ])
    expect(await queryAs(db, t.a2, `select id from domain_ratings where assessment_id = $1`, [a])).toHaveLength(9)
    expect(await queryAs(db, t.outsider, `select id from domain_ratings where assessment_id = $1`, [a])).toEqual([])
  })

  it('assessors cannot edit someone else’s assessment', async () => {
    const t = await makeTeam()
    const r = await ratingId(await startAssessment(t, t.a1), 'D1')
    await queryAs(db, t.a2, `update domain_ratings set rating = 5 where id = $1`, [r])
    const [row] = await asAdmin<{ rating: number | null }>(db, `select rating from domain_ratings where id = $1`, [r])
    expect(row?.rating).toBeNull()
  })
})

describe('invariant 5: submitted means locked', () => {
  it('refuses submission while any domain is incomplete', async () => {
    const t = await makeTeam()
    const a = await startAssessment(t, t.a1)
    await expect(queryAs(db, t.a1, `select public.submit_assessment($1)`, [a])).rejects.toThrow(/D1, D2/)
  })

  it('locks a submitted assessment; only the PI reopens it, with a reason, and it is audited', async () => {
    const t = await makeTeam()
    const a = await completeAll(t, t.a1)
    await queryAs(db, t.a1, `select public.submit_assessment($1)`, [a])
    const r = await ratingId(a, 'D1')
    await expect(asAdmin(db, `update domain_ratings set rating = 5 where id = $1`, [r])).rejects.toThrow(/locked/)

    await expect(queryAs(db, t.a1, `select public.reopen_assessment($1, 'oops')`, [a])).rejects.toThrow(/Only the PI/)
    await expect(queryAs(db, t.pi, `select public.reopen_assessment($1, '  ')`, [a])).rejects.toThrow(/reason/)
    await queryAs(db, t.pi, `select public.reopen_assessment($1, 'New finance records arrived')`, [a])
    await queryAs(db, t.a1, `update domain_ratings set rating = 4 where id = $1`, [r])

    const log = await asAdmin<{ action: string }>(db, `select action from audit_log where entity_id = $1 order by id`, [a])
    expect(log.map((l) => l.action)).toEqual(expect.arrayContaining(['submit', 'reopen']))
  })
})

describe('invariant 6: dissent is preserved', () => {
  it('consensus does not change the independent ratings', async () => {
    const t = await makeTeam()
    const a = await completeAll(t, t.a1)
    await queryAs(db, t.a1, `select public.submit_assessment($1)`, [a])
    const before = await asAdmin(db, `select id, rating, narrative from domain_ratings where assessment_id = $1 order by id`, [a])
    await asAdmin(db, `insert into gate_reviews (project_id, gate, owner_decision, decided_at) values ($1, 'G3', 'go', now())`, [t.project])
    await asAdmin(db, `update assessment_projects set status = 'deliberation' where id = $1`, [t.project])
    await queryAs(
      db,
      t.pi,
      `insert into consensus_ratings (project_id, domain_id, rating, category, rationale)
       select $1, id, 5, 'substantial', 'Agreed after discussion' from domains`,
      [t.project],
    )
    const after = await asAdmin(db, `select id, rating, narrative from domain_ratings where assessment_id = $1 order by id`, [a])
    expect(after).toEqual(before)
    await queryAs(
      db,
      t.a1,
      `insert into dissent_records (project_id, domain_id, member_id, position, rationale)
       select $1, id, $2, 'Rating should be 3', 'Evidence is thin for districts outside the capital' from domains where code = 'D1'`,
      [t.project, t.a1],
    )
    await expect(queryAs(db, t.pi, `delete from dissent_records where project_id = $1`, [t.project])).rejects.toThrow(
      /permission denied/,
    )
  })
})

describe('invariant 8: audit log', () => {
  it('records changes and cannot be edited or deleted by anyone', async () => {
    const t = await makeTeam('draft')
    const [entry] = await asAdmin<{ id: number }>(db, `select id from audit_log where project_id = $1 limit 1`, [t.project])
    expect(entry).toBeDefined()
    await expect(queryAs(db, t.pi, `delete from audit_log where id = $1`, [entry!.id])).rejects.toThrow(/permission denied/)
    await expect(queryAs(db, t.pi, `insert into audit_log (action, entity, hash) values ('x','y','z')`)).rejects.toThrow(
      /permission denied/,
    )
    // Even the database owner is stopped by the trigger.
    await expect(asAdmin(db, `update audit_log set action = 'tampered' where id = $1`, [entry!.id])).rejects.toThrow(/append-only/)
    await expect(asAdmin(db, `delete from audit_log where id = $1`, [entry!.id])).rejects.toThrow(/append-only/)
    await expect(asAdmin(db, `truncate audit_log`)).rejects.toThrow(/append-only/)
  })

  it('chains each entry to the previous hash', async () => {
    const rows = await asAdmin<{ prev_hash: string | null; hash: string }>(db, `select prev_hash, hash from audit_log order by id`)
    for (let i = 1; i < rows.length; i++) expect(rows[i]!.prev_hash).toBe(rows[i - 1]!.hash)
  })
})

describe('invariant 9: versioned framework', () => {
  it('published framework content cannot be edited', async () => {
    await expect(asAdmin(db, `update domains set name = 'Renamed' where code = 'D1'`)).rejects.toThrow(/invariant 9/)
    await expect(asAdmin(db, `delete from indicators where sort = 1`)).rejects.toThrow(/invariant 9/)
  })
})

describe('gates (brief §6, invariant 7)', () => {
  /** Records a complete T1 decision record so the G0 automatic checks pass. */
  async function fillScoping(t: Team) {
    await queryAs(
      db,
      t.pi,
      `insert into decision_records (project_id, decision_text, decision_maker_name, window_start, window_end, hr_screen_result)
       values ($1, 'Renew the equity fund for 2027–2029', 'Ministry of Health board', '2026-11-01', '2027-03-31', 'pass')`,
      [t.project],
    )
  }

  async function answerAll(user: string, project: string, gate: string, answer = 'yes') {
    const criteria = await asAdmin<{ id: string }>(db, `select id from gate_criteria where gate = $1`, [gate])
    const answers = criteria.map((c) => ({ criterion_id: c.id, answer, note: answer === 'na' ? 'n/a' : null }))
    return queryAs(db, user, `select public.save_gate_review($1, $2, $3) as id`, [project, gate, JSON.stringify(answers)])
  }

  it('rejects out-of-order gates and non-owners', async () => {
    const t = await makeTeam('scoping')
    await expect(answerAll(t.pi, t.project, 'G1')).rejects.toThrow(/sequential/)
    await expect(answerAll(t.a1, t.project, 'G0')).rejects.toThrow(/Only the pi/)
  })

  it('requires every criterion answered before deciding', async () => {
    const t = await makeTeam('scoping')
    await queryAs(db, t.pi, `select public.save_gate_review($1, 'G0', '[]')`, [t.project])
    await expect(queryAs(db, t.pi, `select public.decide_gate($1, 'G0', 'go')`, [t.project])).rejects.toThrow(
      /Answer every criterion/,
    )
  })

  it('advances on go, keeps status on hold, and never auto-advances', async () => {
    const t = await makeTeam('scoping')
    await fillScoping(t)
    await answerAll(t.pi, t.project, 'G0')
    const [status] = await asAdmin<{ status: string }>(db, `select status from assessment_projects where id = $1`, [t.project])
    expect(status?.status).toBe('scoping') // a complete checklist alone changes nothing
    await expect(queryAs(db, t.pi, `select public.decide_gate($1, 'G0', 'hold')`, [t.project])).rejects.toThrow(/reason/)
    await queryAs(db, t.pi, `select public.decide_gate($1, 'G0', 'hold', null, 'Waiting for the decision window')`, [t.project])
    expect((await asAdmin<{ status: string }>(db, `select status from assessment_projects where id = $1`, [t.project]))[0]?.status).toBe(
      'scoping',
    )
    await answerAll(t.pi, t.project, 'G0')
    const [next] = await queryAs<{ s: string }>(db, t.pi, `select public.decide_gate($1, 'G0', 'go') as s`, [t.project])
    expect(next?.s).toBe('context')
    const attempts = await asAdmin(db, `select attempt_number from gate_reviews where project_id = $1 and gate = 'G0' order by 1`, [t.project])
    expect(attempts).toHaveLength(2)
  })

  it('needs conditions for conditional go, and turns them into action items', async () => {
    const t = await makeTeam('scoping')
    await fillScoping(t)
    await answerAll(t.pi, t.project, 'G0', 'partial')
    await expect(queryAs(db, t.pi, `select public.decide_gate($1, 'G0', 'conditional_go')`, [t.project])).rejects.toThrow(
      /conditions/,
    )
    await queryAs(db, t.pi, `select public.decide_gate($1, 'G0', 'conditional_go', $2)`, [
      t.project,
      'Confirm decision window with ministry\nName a deputy decision-maker',
    ])
    const items = await asAdmin(db, `select description from action_items where project_id = $1`, [t.project])
    expect(items).toHaveLength(2)
  })

  it('requires a justification to override the suggestion upward, and flags it', async () => {
    const t = await makeTeam('scoping')
    await answerAll(t.pi, t.project, 'G0', 'no')
    const [review] = await asAdmin<{ suggested_decision: string }>(
      db,
      `select suggested_decision from gate_reviews where project_id = $1`,
      [t.project],
    )
    expect(review?.suggested_decision).toBe('hold')
    await expect(queryAs(db, t.pi, `select public.decide_gate($1, 'G0', 'go')`, [t.project])).rejects.toThrow(/justification/)
    await queryAs(db, t.pi, `select public.decide_gate($1, 'G0', 'go', null, 'Ministry confirmed by phone; minutes to follow')`, [
      t.project,
    ])
    const [log] = await asAdmin<{ flags: string[] }>(
      db,
      `select flags from audit_log where project_id = $1 and action = 'gate_decision'`,
      [t.project],
    )
    expect(log?.flags).toContain('gate_override')
  })

  it('stops the project at any gate with a reason (PLAN D-5)', async () => {
    const t = await makeTeam('scoping')
    await fillScoping(t)
    await answerAll(t.pi, t.project, 'G0')
    await queryAs(db, t.pi, `select public.decide_gate($1, 'G0', 'stop_redirect', null, 'Escalated: human-rights concern')`, [
      t.project,
    ])
    const [p] = await asAdmin<{ status: string; closed_reason: string }>(
      db,
      `select status, closed_reason from assessment_projects where id = $1`,
      [t.project],
    )
    expect(p).toEqual({ status: 'closed', closed_reason: 'Escalated: human-rights concern' })
  })

  it('makes G2 wait for reviewer verification (PLAN D-12)', async () => {
    const t = await makeTeam('evidence')
    await answerAll(t.pi, t.project, 'G2')
    await expect(queryAs(db, t.pi, `select public.decide_gate($1, 'G2', 'go')`, [t.project])).rejects.toThrow(/reviewer must verify/)
    await queryAs(db, t.reviewer, `select public.record_gate_verification($1, 'G2', 'verified', null)`, [t.project])
    const [next] = await queryAs<{ s: string }>(db, t.pi, `select public.decide_gate($1, 'G2', 'go') as s`, [t.project])
    expect(next?.s).toBe('assessment')
  })

  it('cannot change a decided gate review', async () => {
    const t = await makeTeam('scoping')
    await fillScoping(t)
    await answerAll(t.pi, t.project, 'G0')
    await queryAs(db, t.pi, `select public.decide_gate($1, 'G0', 'go')`, [t.project])
    await expect(asAdmin(db, `update gate_reviews set owner_decision = 'hold' where project_id = $1`, [t.project])).rejects.toThrow(
      /final/,
    )
  })
})
