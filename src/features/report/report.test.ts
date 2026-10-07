import { describe, expect, it } from 'vitest'
import { buildReportData, profileLabel, type ReportInput } from './reportData'
import { buildNarrativeDraft, DRAFT_LABEL } from './narrative'
import { evidenceCsv, ratingsCsv, toCsv } from './csv'
import { chartLayout } from './chartImage'

const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  subject: { name: 'Kaduna Equity Fund', type: 'programme', country: 'Nigeria', region: null, description: null },
  decision: {
    decision_text: 'Renew the fund for 2027–2029',
    decision_maker_name: 'State Health Board',
    decision_maker_institution: null,
    window_start: '2026-11-01',
    window_end: '2027-03-31',
  },
  context: null,
  exploratory: false,
  g6Passed: false,
  profile: [
    { domain_id: 'd2', code: 'D2', name: 'Common Good Orientation', dimension_code: 'WHAT', dimension_label: 'WHAT', dimension_sort: 1, domain_sort: 2, rating: null, confidence: null, category: 'no_consensus', narrative: 'Views split', source: 'consensus' },
    { domain_id: 'd1', code: 'D1', name: 'Equity & Justice', dimension_code: 'WHAT', dimension_label: 'WHAT', dimension_sort: 1, domain_sort: 1, rating: 3, confidence: 'low', category: 'substantial', narrative: 'Targeting favours, "low-coverage" districts', source: 'consensus' },
  ],
  evidenceByDomain: { d1: ['Fund strategy 2025'] },
  flags: [{ flag: 'power', level: 'high', explanation: 'Donors hold budget authority' }],
  solidarityType: { primary: 'instrumental', secondary: null, evidence: 'Minutes' },
  dissent: [{ domainCode: 'D2', position: 'Rating 4', rationale: 'Open data since 2024' }],
  gaps: [{ domainCode: 'D3', description: 'Co-financing records not released', effect: 'Lowers confidence' }],
  memberChecks: [],
  narrative: null,
  ratingLabels: { 3: 'Moderate / Developing' },
  ...over,
})

describe('report data (brief §10, invariant 1)', () => {
  it('orders domains, keeps unrated as null and counts rated domains descriptively', () => {
    const d = buildReportData(input())
    expect(d.domains.map((x) => x.code)).toEqual(['D1', 'D2'])
    expect(d.domains[1]).toMatchObject({ rating: null, ratingLabel: null, consensusCategory: 'no_consensus' })
    expect(d.ratedDomains).toEqual({ rated: 1, of: 2 })
    expect(d.domains[0]?.keyEvidence).toEqual(['Fund strategy 2025'])
  })

  it('labels single-assessor profiles Exploratory, never Validated (brief §16.2)', () => {
    expect(profileLabel(true, true)).toBe('exploratory')
    expect(profileLabel(false, true)).toBe('validated')
    expect(profileLabel(false, false)).toBe('awaiting_validation')
  })
})

describe('template narrative (brief §10, invariant 11)', () => {
  const text = buildNarrativeDraft(buildReportData(input()))

  it('is labelled as auto-drafted', () => {
    expect(text.startsWith(DRAFT_LABEL)).toBe(true)
  })

  it('states domain ratings separately and never an average', () => {
    expect(text).toContain('D1 Equity & Justice: 3 – Moderate / Developing, Low confidence.')
    expect(text).toContain('D2 Common Good Orientation: not rated (no consensus).')
    expect(text).toMatch(/not combined/)
    expect(text).not.toMatch(/average|overall score|index|mean/i)
  })

  it('draws caveats only from recorded data', () => {
    expect(text).toContain('Low confidence in: D1.')
    expect(text).toContain('Evidence gap (D3): Co-financing records not released — Lowers confidence.')
    expect(text).toContain('Recorded dissent on: D2.')
    expect(text).toContain('Power imbalance is High: Donors hold budget authority')
  })
})

describe('export chart layout (PLAN D-44)', () => {
  it('groups by dimension, scales each bar on its own 1–5 scale, and draws no bar for unrated', () => {
    const { rows } = chartLayout(buildReportData(input()).domains, 400)
    expect(rows.map((r) => r.kind)).toEqual(['dimension', 'domain', 'domain'])
    expect(rows[1]).toMatchObject({ label: 'D1 Equity & Justice', value: 3, barWidth: 240 })
    expect(rows[2]).toMatchObject({ value: null, barWidth: 0 })
  })
})

describe('CSV exports', () => {
  it('escapes quotes, commas and line breaks', () => {
    expect(toCsv(['a', 'b'], [['x, y', 'say "hi"\nthere']])).toBe('a,b\r\n"x, y","say ""hi""\nthere"\r\n')
  })

  it('exports one row per domain with "Not rated" instead of 0', () => {
    const csv = ratingsCsv(buildReportData(input()))
    const lines = csv.trim().split('\r\n')
    expect(lines).toHaveLength(3)
    expect(lines[2]).toContain('Not rated')
    expect(csv).not.toMatch(/average|overall|score|index/i)
  })

  it('exports the evidence register', () => {
    const csv = evidenceCsv([
      { title: 'Ward FGD', type: 'fgd', origin: 'community', source_type: 'primary', evidence_date: null, confidentiality: 'restricted', domains: ['D5', 'D8'], location: 'file' },
    ])
    expect(csv).toContain('Ward FGD,fgd,community,primary,,restricted,D5 D8,file')
  })
})
