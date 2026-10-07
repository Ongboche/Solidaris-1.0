// @vitest-environment node
// The suggestion rule exists twice (TS for the UI, SQL for decide_gate). Both must
// agree on every shared fixture (PLAN §4).
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import fixtures from '../fixtures/suggest-decision.json'
import { suggestDecision } from '../../src/domain/gates'
import { gateForStatus, nextStatus } from '../../src/domain/workflow'
import { PROJECT_STATUSES, type GateDecision } from '../../src/domain/types'
import { asAdmin, createTestDb } from './harness'

let db: PGlite

beforeAll(async () => {
  db = await createTestDb()
})

describe('TS and SQL agree', () => {
  it.each(fixtures)('suggest_decision: $name', async (f) => {
    const sqlInput = f.criteria.map((c) => ({
      criterion_id: c.id,
      required: c.required,
      answer: c.answer,
      note: 'note' in c ? c.note : null,
    }))
    const [row] = await asAdmin<{ s: { decision: string; reasons: string[] } }>(db, `select public.suggest_decision($1) as s`, [
      JSON.stringify(sqlInput),
    ])
    const ts = suggestDecision(
      f.criteria.map((c) => ({
        criterionId: c.id,
        required: c.required,
        answer: c.answer as never,
        note: 'note' in c ? (c.note as string) : null,
      })),
    )
    expect(row?.s.decision).toBe(ts.decision)
    expect(row?.s.reasons).toEqual(ts.reasons.map((r) => `${r.code}:${r.criterionId}`))
  })

  it('gate_for_status and next_status match the workflow module', async () => {
    const decisions: GateDecision[] = ['go', 'conditional_go', 'hold', 'stop_redirect']
    for (const status of PROJECT_STATUSES) {
      const [g] = await asAdmin<{ g: string | null }>(db, `select public.gate_for_status($1) as g`, [status])
      expect(g?.g ?? null, status).toBe(gateForStatus(status))
      if (!gateForStatus(status)) continue
      for (const d of decisions) {
        const [n] = await asAdmin<{ n: string }>(db, `select public.next_status($1, $2) as n`, [status, d])
        expect(n?.n, `${status}/${d}`).toBe(nextStatus(status, d))
      }
    }
  })
})
