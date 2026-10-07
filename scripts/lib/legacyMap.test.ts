import { describe, expect, it } from 'vitest'
import { mapConfidence, mapProject, mapRating, migrationReport, parseSheetProjects, parseSheetUsers } from './legacyMap'

const users = [
  { id: 'owner1', email: 'Owner@Example.org', fullName: 'Project Owner' },
  { id: 'reviewer1', email: 'r1@example.org' },
]

const legacy = {
  id: 'proj_owner_demo',
  name: 'Community Health Equity Initiative',
  funder: 'Ministry of Health',
  country: 'Kenya',
  ownerId: 'owner1',
  reviewerIds: ['owner1', 'reviewer1'],
  assessment: {
    domains: {
      d1: { rating: 2, evidenceSummary: 'Targeting favours rural wards', confidence: 'Low', responses: ['note a', '', 'note c'] },
      d2: { rating: 0, evidenceSummary: '' },
    },
    integrity: { alignmentContradiction: 'None found', washingRisk: 'Medium', powerRisk: 'High' },
  },
}

describe('legacy migration mapping (brief §13)', () => {
  it('maps 0 and junk ratings to NULL — unrated is not zero (invariant 2)', () => {
    expect(mapRating(0)).toBeNull()
    expect(mapRating('')).toBeNull()
    expect(mapRating(7)).toBeNull()
    expect(mapRating('4')).toBe(4)
    expect(mapConfidence('Medium')).toBe('medium')
    expect(mapConfidence('')).toBeNull()
  })

  it('imports one assessment by the owner with narratives and confidence', () => {
    const m = mapProject(legacy, users)
    expect(m.ownerEmail).toBe('owner@example.org')
    expect(m.ratings).toHaveLength(9)
    expect(m.ratings[0]).toEqual({ domainCode: 'D1', rating: 2, narrative: 'Targeting favours rural wards\n\nnote a\n\nnote c', confidence: 'low' })
    expect(m.ratings[1]?.rating).toBeNull()
    expect(m.integrity).toMatchObject({ alignment: 'None found', washing: 'medium', power: 'high' })
    expect(m.issues).toContain('D2: rating 0 imported as Not rated')
  })

  it('never carries passwords and flags reviewers and missing owners for review', () => {
    const m = mapProject(legacy, users)
    expect(JSON.stringify(m)).not.toMatch(/password/i)
    expect(m.reviewerEmails).toEqual(['r1@example.org'])
    expect(mapProject({ id: 'x', ownerId: 'ghost' }, users).issues[0]).toMatch(/assign a PI by hand/)
  })

  it('reads the Google Sheet CSV exports', () => {
    const csv = 'id,name,ownerId,reviewerIds,assessmentJson,integrityJson\n' +
      `p1,Fund A,owner1,"owner1,reviewer1","{""domains"":{""d1"":{""rating"":3}}}","{""powerRisk"":""Low""}"\n`
    const [p] = parseSheetProjects(csv)
    expect(p?.assessment?.domains?.d1?.rating).toBe(3)
    expect(p?.assessment?.integrity?.powerRisk).toBe('Low')
    expect(parseSheetUsers('id,username,email\nowner1,o,o@x.org\n')).toEqual([{ id: 'owner1', username: 'o', email: 'o@x.org', fullName: undefined }])
  })

  it('writes a report listing what needs review', () => {
    const report = migrationReport([mapProject(legacy, users)], 'dry-run')
    expect(report).toContain('| proj_owner_demo | Community Health Equity Initiative | owner@example.org | 1 of 9 | would import |')
  })
})
