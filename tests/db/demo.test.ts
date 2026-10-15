// @vitest-environment node
// PLAN D-53: the read-only "PEPFAR project in Africa" demo profile.
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asAdmin, createTestDb, createUser, queryAs } from './harness'

let db: PGlite
let member: string, admin: string, unconsented: string
const DEMO = 'de300000-0000-4000-8000-000000000100'

beforeAll(async () => {
  db = await createTestDb()
  member = await createUser(db)
  admin = await createUser(db)
  unconsented = await createUser(db, { full_name: 'No Consent' })
  await asAdmin(db, `update profiles set platform_role = 'platform_admin' where id = $1`, [admin])
})

describe('demo profile (D-53)', () => {
  it('seeds a complete, closed cycle with every gate decided', async () => {
    const [p] = await asAdmin<{ status: string; is_demo: boolean; approved: boolean }>(
      db, `select status, is_demo, profile_approved_at is not null as approved from assessment_projects where id = $1`, [DEMO])
    expect(p).toEqual({ status: 'closed', is_demo: true, approved: true })
    const gates = await asAdmin<{ gate: string }>(
      db, `select gate from gate_reviews where project_id = $1 and owner_decision is not null order by gate`, [DEMO])
    expect(gates.map((g) => g.gate)).toEqual(['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8'])
    const [counts] = await asAdmin<Record<string, number>>(db, `select
      (select count(*)::int from evidence_items where project_id = $1) as evidence,
      (select count(*)::int from assessments where project_id = $1 and status = 'submitted') as submitted,
      (select count(*)::int from domain_ratings r join assessments a on a.id = r.assessment_id where a.project_id = $1 and r.is_complete) as ratings,
      (select count(*)::int from consensus_ratings where project_id = $1) as consensus,
      (select count(*)::int from dissent_records where project_id = $1) as dissent,
      (select count(distinct role)::int from project_members where project_id = $1) as roles`, [DEMO])
    expect(counts).toEqual({ evidence: 17, submitted: 2, ratings: 18, consensus: 9, dissent: 3, roles: 7 })
  })

  it('lets any consented user read it, but not users without consent', async () => {
    const rows = await queryAs(db, member, `select id from assessment_projects where id = $1`, [DEMO])
    expect(rows).toHaveLength(1)
    const ratings = await queryAs(db, member,
      `select r.id from domain_ratings r join assessments a on a.id = r.assessment_id where a.project_id = $1`, [DEMO])
    expect(ratings).toHaveLength(18)
    const consensus = await queryAs(db, member, `select id from consensus_ratings where project_id = $1`, [DEMO])
    expect(consensus).toHaveLength(9)
    expect(await queryAs(db, unconsented, `select id from assessment_projects where id = $1`, [DEMO])).toHaveLength(0)
  })

  it('refuses every change, even from a platform admin or the database owner', async () => {
    await expect(queryAs(db, member, `select public.decide_gate($1, 'G8', 'hold')`, [DEMO])).rejects.toThrow()
    await expect(queryAs(db, admin, `update assessment_projects set status = 'draft' where id = $1`, [DEMO]))
      .rejects.toThrow()
    await expect(asAdmin(db, `update evidence_items set title = 'x' where project_id = $1`, [DEMO]))
      .rejects.toThrow(/demo profile is read-only/)
    await expect(asAdmin(db, `delete from domain_discussions where project_id = $1`, [DEMO]))
      .rejects.toThrow(/demo profile is read-only/)
  })

  it('is excluded from the M&E indicators', async () => {
    const [r] = await queryAs<{ r: { projects: number; oc4: { registrations: number } } }>(
      db, admin, `select public.me_indicators() as r`)
    expect(r?.r.projects).toBe(0)
    expect(r?.r.oc4.registrations).toBe(3)
  })
})
