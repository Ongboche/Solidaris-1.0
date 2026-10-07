import { describe, expect, it } from 'vitest'
import { nextActions, type ProjectSnapshot } from './nextActions'

const project = (over: Partial<ProjectSnapshot>): ProjectSnapshot => ({
  id: 'p1',
  subjectName: 'Kaduna Equity Fund',
  status: 'draft',
  myRoles: ['pi'],
  myCoiDeclared: null,
  decisionComplete: false,
  contextComplete: false,
  actorsComplete: false,
  ...over,
})

const kinds = (a: ReturnType<typeof nextActions>) => a.map((x) => x.kind)

describe('nextActions (brief §9.2)', () => {
  it('lists invitations first', () => {
    const a = nextActions([project({})], [{ id: 'i1', projectId: 'p2', subjectName: 'X', role: 'assessor' }])
    expect(a[0]).toMatchObject({ kind: 'accept_invitation', invitationId: 'i1' })
  })

  it('asks a PI to build the team and start scoping on a draft project', () => {
    expect(kinds(nextActions([project({})], []))).toEqual(['invite_team', 'start_scoping'])
  })

  it('sends the PI to the decision record before G0, then to the gate', () => {
    expect(kinds(nextActions([project({ status: 'scoping' })], []))).toEqual(['record_decision'])
    expect(nextActions([project({ status: 'scoping', decisionComplete: true })], [])[0]).toMatchObject({
      kind: 'review_gate',
      gate: 'G0',
    })
  })

  it('needs both the context profile and the actor map before G1', () => {
    expect(kinds(nextActions([project({ status: 'context', contextComplete: true })], []))).toEqual(['complete_context'])
    expect(
      kinds(nextActions([project({ status: 'context', contextComplete: true, actorsComplete: true })], [])),
    ).toEqual(['review_gate'])
  })

  it('reminds assessors to declare conflicts of interest', () => {
    const a = nextActions([project({ status: 'context', myRoles: ['assessor'], myCoiDeclared: false })], [])
    expect(kinds(a)).toEqual(['declare_coi'])
  })

  it('guides assessors through evidence and their own assessment until submitted', () => {
    expect(kinds(nextActions([project({ status: 'evidence', myRoles: ['assessor'], myCoiDeclared: true })], []))).toEqual(['add_evidence'])
    const at = (s: ProjectSnapshot['myAssessmentStatus']) =>
      kinds(nextActions([project({ status: 'assessment', myRoles: ['assessor'], myCoiDeclared: true, myAssessmentStatus: s })], []))
    expect(at(null)).toEqual(['complete_assessment'])
    expect(at('reopened')).toEqual(['complete_assessment'])
    expect(at('submitted')).toEqual([])
  })

  it('invites deliberation roles to join, and gives the PI the gate instead', () => {
    expect(kinds(nextActions([project({ status: 'deliberation', myRoles: ['community_participant'] })], []))).toEqual(['join_deliberation'])
    expect(kinds(nextActions([project({ status: 'deliberation', myRoles: ['pi'] })], []))).toEqual(['review_gate'])
  })

  it('gives observers nothing to do and skips closed projects', () => {
    expect(nextActions([project({ status: 'context', myRoles: ['observer'] })], [])).toEqual([])
    expect(nextActions([project({ status: 'closed' })], [])).toEqual([])
  })

  it('asks the reviewer to verify G2 and the KT lead to review G7', () => {
    expect(nextActions([project({ status: 'evidence', myRoles: ['reviewer'] })], [])[0]).toMatchObject({
      kind: 'verify_gate',
      gate: 'G2',
    })
    expect(nextActions([project({ status: 'uptake', myRoles: ['kt_lead'] })], [])[0]).toMatchObject({
      kind: 'review_gate',
      gate: 'G7',
    })
  })
})
