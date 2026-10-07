import { describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { describeEvidence } from './evidence'

const t = i18n.t.bind(i18n)

describe('describeEvidence (brief §6.3: show the evidence behind automatic checks)', () => {
  it('names missing decision fields in plain words', () => {
    expect(describeEvidence({ missing: ['decision', 'decision_window'] }, t)).toBe(
      'Missing: the decision, the decision window',
    )
  })

  it('names missing actor categories', () => {
    expect(describeEvidence({ missing_categories: ['community', 'government'] }, t)).toBe(
      'No actor yet for: community actors, government',
    )
  })

  it('reports assessor counts and undeclared conflicts', () => {
    expect(describeEvidence({ assessors: 2, undeclared: 1 }, t)).toBe('2 assessors · 1 has not declared conflicts of interest')
  })

  it('explains G2–G6 checks', () => {
    expect(describeEvidence({ domains_without_community_evidence: ['D5', 'D8'] }, t)).toBe('No community-origin evidence yet for: D5, D8')
    expect(describeEvidence({ assessors: 3, submitted: 2, withdrawn: 0, outstanding: 1 }, t)).toBe(
      '3 assessors · 2 submitted, 0 withdrawn, 1 still to submit',
    )
    expect(describeEvidence({ missing_flags: ['inclusion'] }, t)).toBe('Risk flags not rated: Inclusion gap')
    expect(describeEvidence({ by_design: true }, t)).toBe('Guaranteed by design: SOLIDARIS cannot produce a combined score')
  })

  it('is empty when there is nothing to show', () => {
    expect(describeEvidence(null, t)).toBe('')
    expect(describeEvidence({ missing: [] }, t)).toBe('')
  })
})
