import { describe, expect, it } from 'vitest'
import fixtures from '../../tests/fixtures/suggest-decision.json'
import { decisionProblems, isUpwardOverride, suggestDecision, type CriterionState } from './gates'
import { gateForStatus, gateOwner, needsReviewerVerification, nextStatus, passedGates } from './workflow'
import { isRatingComplete, missingForCompletion } from './completeness'
import { divergence, needsDiscussion } from './divergence'
import { assertNoComposite, CompositeScoreError, ratedCount } from './noComposite'
import type { CriterionAnswer, SuggestedDecision } from './types'

type Fixture = {
  name: string
  criteria: { id: string; required: boolean; answer: CriterionAnswer | null; note?: string }[]
  decision: SuggestedDecision
  reasons: string[]
}

const toCriteria = (f: Fixture): CriterionState[] =>
  f.criteria.map((c) => ({ criterionId: c.id, required: c.required, answer: c.answer, note: c.note ?? null }))

describe('suggestDecision (brief §6.2)', () => {
  it.each(fixtures as Fixture[])('$name', (f) => {
    const s = suggestDecision(toCriteria(f))
    expect(s.decision).toBe(f.decision)
    expect(s.reasons.map((r) => `${r.code}:${r.criterionId}`)).toEqual(f.reasons)
  })
})

describe('decision rules', () => {
  it('treats go over a hold suggestion as an upward override', () => {
    expect(isUpwardOverride('hold', 'go')).toBe(true)
    expect(isUpwardOverride('hold', 'conditional_go')).toBe(true)
    expect(isUpwardOverride('go', 'hold')).toBe(false)
    expect(isUpwardOverride('conditional_go', 'stop_redirect')).toBe(false)
  })

  it('lists what is missing before a decision can be recorded', () => {
    expect(decisionProblems({ suggested: 'go', decision: 'conditional_go' })).toEqual(['conditions_required'])
    expect(decisionProblems({ suggested: 'go', decision: 'hold' })).toEqual(['rationale_required'])
    expect(decisionProblems({ suggested: 'hold', decision: 'go' })).toEqual(['justification_required'])
    expect(decisionProblems({ suggested: 'hold', decision: 'go', rationale: 'Confirmed by phone' })).toEqual([])
  })
})

describe('workflow (brief §6.1)', () => {
  it('maps each stage to its gate, and draft/closed to none', () => {
    expect(gateForStatus('scoping')).toBe('G0')
    expect(gateForStatus('learning')).toBe('G8')
    expect(gateForStatus('draft')).toBeNull()
    expect(gateForStatus('closed')).toBeNull()
  })

  it('advances on go and conditional go, holds in place, and closes on stop', () => {
    expect(nextStatus('scoping', 'go')).toBe('context')
    // PLAN D-52: assessment (G2) comes before the evidence review (G3)
    expect(nextStatus('context', 'go')).toBe('assessment')
    expect(nextStatus('assessment', 'conditional_go')).toBe('evidence')
    expect(nextStatus('evidence', 'go')).toBe('integrity')
    expect(nextStatus('evidence', 'hold')).toBe('evidence')
    expect(nextStatus('deliberation', 'stop_redirect')).toBe('closed')
    expect(nextStatus('learning', 'go')).toBe('closed')
    expect(() => nextStatus('draft', 'go')).toThrow()
  })

  it('assigns gate owners per §6.3', () => {
    expect(gateOwner('G4')).toBe('reviewer')
    expect(gateOwner('G7')).toBe('kt_lead')
    expect(gateOwner('G3')).toBe('pi')
    expect(needsReviewerVerification('G3')).toBe(true)
    expect(needsReviewerVerification('G6')).toBe(true)
    expect(needsReviewerVerification('G2')).toBe(false)
  })

  it('lists passed gates for the journey bar', () => {
    expect(passedGates('scoping')).toEqual([])
    expect(passedGates('assessment')).toEqual(['G0', 'G1'])
    expect(passedGates('evidence')).toEqual(['G0', 'G1', 'G2'])
  })
})

describe('invariant 3: completeness', () => {
  const base = { rating: 3 as const, narrative: 'x'.repeat(50), confidence: 'medium' as const, evidenceCount: 1, gapCount: 0 }

  it('is complete with rating, narrative, confidence and evidence', () => {
    expect(isRatingComplete(base)).toBe(true)
  })

  it('accepts a documented gap instead of evidence', () => {
    expect(isRatingComplete({ ...base, evidenceCount: 0, gapCount: 1 })).toBe(true)
  })

  it('names everything that is missing', () => {
    expect(
      missingForCompletion({ rating: null, narrative: '  short ', confidence: null, evidenceCount: 0, gapCount: 0 }),
    ).toEqual(['rating', 'narrative', 'confidence', 'evidence_or_gap'])
  })

  it('respects a configured narrative minimum', () => {
    expect(isRatingComplete({ ...base, narrative: 'x'.repeat(20) }, 20)).toBe(true)
  })
})

describe('divergence (§6.4)', () => {
  it('ignores NULLs and never treats them as 0 (invariant 2)', () => {
    expect(divergence([2, null, 4])).toBe(2)
    expect(divergence([3, null])).toBeNull()
    expect(divergence([])).toBeNull()
  })

  it('flags more than one point of difference', () => {
    expect(needsDiscussion([2, 3])).toBe(false)
    expect(needsDiscussion([2, 4])).toBe(true)
  })
})

describe('invariant 1: no composites', () => {
  it('accepts domain-level payloads', () => {
    expect(() =>
      assertNoComposite({ domains: [{ code: 'D1', rating: 3, confidence: 'high' }], rated: ratedCount([3, null]) }),
    ).not.toThrow()
  })

  it.each([{ average: 3.1 }, { overall_score: 70 }, { triads: [{ mean: 2 }] }, { solidarityIndex: 1, index: 4 }])(
    'rejects %o',
    (payload) => {
      expect(() => assertNoComposite(payload)).toThrow(CompositeScoreError)
    },
  )

  it('counts rated domains descriptively', () => {
    expect(ratedCount([1, null, 4])).toEqual({ rated: 2, of: 3 })
  })
})
