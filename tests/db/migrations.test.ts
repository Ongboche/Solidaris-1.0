// @vitest-environment node
import { describe, expect, it, beforeAll } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asAdmin, createTestDb, queryAs } from './harness'

let db: PGlite

beforeAll(async () => {
  db = await createTestDb()
})

describe('migrations', () => {
  it('enable RLS on every public table (brief §12: default deny)', async () => {
    const rows = await asAdmin<{ relname: string }>(
      db,
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    )
    expect(rows.map((r) => r.relname)).toEqual([])
  })

  it('give anonymous users no access to any table', async () => {
    const tables = await asAdmin<{ relname: string }>(
      db,
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`,
    )
    for (const { relname } of tables) {
      await expect(queryAs(db, null, `select * from public.${relname} limit 1`), relname).rejects.toThrow(
        /permission denied/,
      )
    }
  })

  it('seed framework v1 as published, with 3 dimensions and 9 domains', async () => {
    const [fv] = await asAdmin<{ status: string }>(db, `select status from framework_versions where label = 'v1'`)
    expect(fv?.status).toBe('published')
    const domains = await asAdmin<{ code: string; n: number }>(
      db,
      `select d.code, count(i.*)::int as n from domains d join indicators i on i.domain_id = d.id
       group by d.code order by d.code`,
    )
    expect(domains.map((d) => d.code)).toEqual(['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9'])
    // Appendix A: D4 has four prompts, the rest three
    expect(domains.find((d) => d.code === 'D4')?.n).toBe(4)
    expect(domains.filter((d) => d.n === 3)).toHaveLength(8)
    const [dims] = await asAdmin<{ n: number }>(db, `select count(*)::int as n from dimensions`)
    expect(dims?.n).toBe(3)
  })

  it('seed the 35 Appendix B criteria plus the D-17 advisory criterion on G1–G8', async () => {
    const [counts] = await asAdmin<{ total: number; required: number; extra: number }>(
      db,
      `select count(*) filter (where sort < 99)::int as total,
              count(*) filter (where sort < 99 and required)::int as required,
              count(*) filter (where sort = 99)::int as extra
       from gate_criteria`,
    )
    expect(counts).toEqual({ total: 35, required: 31, extra: 8 })
  })
})
