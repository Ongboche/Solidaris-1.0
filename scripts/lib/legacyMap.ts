// Pure mapping from the old prototype's data to the new model (brief §13). No I/O, so it
// is unit tested; scripts/migrate-from-sheet.ts does the reading and writing.
import Papa from 'papaparse'

export interface LegacyDomain {
  rating?: number | string | null
  responses?: string[]
  evidenceType?: string
  evidenceSummary?: string
  confidence?: string
}

export interface LegacyProject {
  id: string
  name?: string
  funder?: string
  country?: string
  sector?: string
  ownerId?: string
  reviewerIds?: string[] | string
  assessment?: { domains?: Record<string, LegacyDomain>; integrity?: Record<string, string> }
}

export interface LegacyUser {
  id: string
  email?: string
  fullName?: string
  username?: string
}

export interface MappedRating {
  domainCode: string
  rating: number | null
  narrative: string | null
  confidence: 'low' | 'medium' | 'high' | null
}

export interface MappedProject {
  legacyId: string
  subjectName: string
  country: string | null
  description: string | null
  ownerEmail: string | null
  ratings: MappedRating[]
  integrity: { alignment: string | null; costWhoBears: string | null; voice: string | null; washing: string | null; power: string | null }
  reviewerEmails: string[]
  issues: string[]
}

/** Invariant 2: 0, blanks and out-of-range values become NULL ("Not rated"). */
export function mapRating(value: unknown): number | null {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null
}

export function mapConfidence(value: unknown): MappedRating['confidence'] {
  const v = String(value ?? '').trim().toLowerCase()
  return v === 'low' || v === 'medium' || v === 'high' ? v : null
}

const text = (v: unknown) => {
  const s = String(v ?? '').trim()
  return s ? s : null
}

export function mapProject(p: LegacyProject, users: LegacyUser[]): MappedProject {
  const issues: string[] = []
  const emailOf = (id?: string) => users.find((u) => u.id === id)?.email?.trim().toLowerCase() ?? null
  const ownerEmail = emailOf(p.ownerId)
  if (!ownerEmail) issues.push(`Owner "${p.ownerId ?? '?'}" has no email address: assign a PI by hand`)

  const domains = p.assessment?.domains ?? {}
  const ratings: MappedRating[] = []
  for (let i = 1; i <= 9; i++) {
    const d = domains[`d${i}`] ?? {}
    const rating = mapRating(d.rating)
    if (d.rating !== undefined && Number(d.rating) === 0) issues.push(`D${i}: rating 0 imported as Not rated`)
    const parts = [text(d.evidenceSummary), ...(d.responses ?? []).map(text)].filter(Boolean)
    ratings.push({ domainCode: `D${i}`, rating, narrative: parts.length ? parts.join('\n\n') : null, confidence: mapConfidence(d.confidence) })
  }
  if (ratings.every((r) => r.rating === null)) issues.push('No usable ratings')

  const reviewerIds = Array.isArray(p.reviewerIds) ? p.reviewerIds : String(p.reviewerIds ?? '').split(',').filter(Boolean)
  const reviewerEmails = reviewerIds.filter((id) => id !== p.ownerId).map(emailOf).filter((e): e is string => Boolean(e))
  if (reviewerEmails.length) issues.push(`Former reviewers (${reviewerEmails.join(', ')}) are not added automatically: the PI can invite them with a role`)

  const integ = p.assessment?.integrity ?? {}
  return {
    legacyId: p.id,
    subjectName: text(p.name) ?? 'Untitled programme (imported)',
    country: text(p.country),
    description: [text(p.funder) && `Funder: ${p.funder}`, text(p.sector) && `Sector: ${p.sector}`].filter(Boolean).join(' · ') || null,
    ownerEmail,
    ratings,
    integrity: {
      alignment: text(integ.alignmentContradiction),
      costWhoBears: text(integ.burdenBearer),
      voice: text(integ.voiceReality),
      washing: mapConfidence(integ.washingRisk),
      power: mapConfidence(integ.powerRisk),
    },
    reviewerEmails,
    issues,
  }
}

/** Google Sheet "projects" tab exported as CSV (legacy/docs/GOOGLE_SHEETS_SETUP.md). */
export function parseSheetProjects(csv: string): LegacyProject[] {
  const rows = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true }).data
  return rows.map((r) => {
    let assessment: NonNullable<LegacyProject['assessment']> = {}
    try {
      assessment = (JSON.parse(r.assessmentJson || '{}') as LegacyProject['assessment']) ?? {}
    } catch {
      assessment = {}
    }
    try {
      assessment.integrity = { ...(JSON.parse(r.integrityJson || '{}') as Record<string, string>), ...(assessment.integrity ?? {}) }
    } catch {
      /* keep what assessmentJson had */
    }
    return { id: r.id ?? '', name: r.name, funder: r.funder, country: r.country, sector: r.sector, ownerId: r.ownerId, reviewerIds: r.reviewerIds, assessment }
  })
}

/** Google Sheet "users" tab (exported without the password column). */
export function parseSheetUsers(csv: string): LegacyUser[] {
  return Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true }).data.map((r) => ({
    id: r.id ?? '',
    email: r.email,
    fullName: r.fullName,
    username: r.username,
  }))
}

export function migrationReport(projects: MappedProject[], mode: 'dry-run' | 'applied', outcome: Record<string, string> = {}): string {
  const lines = [
    `# SOLIDARIS migration report (${mode})`,
    '',
    `Generated ${new Date().toISOString()}. Passwords are never imported; every person is invited to create a new account.`,
    '',
    '| Legacy id | Subject | Owner | Rated domains | Result | Needs review |',
    '|---|---|---|---|---|---|',
  ]
  for (const p of projects) {
    const rated = p.ratings.filter((r) => r.rating !== null).length
    lines.push(`| ${p.legacyId} | ${p.subjectName} | ${p.ownerEmail ?? '—'} | ${rated} of 9 | ${outcome[p.legacyId] ?? (mode === 'dry-run' ? 'would import' : 'skipped')} | ${p.issues.join('; ') || '—'} |`)
  }
  return lines.join('\n') + '\n'
}
