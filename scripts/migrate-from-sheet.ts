// One-off migration from the old prototype (brief §13).
//
//   node scripts/migrate-from-sheet.ts --projects projects.csv --users users.csv            # dry run (default)
//   node scripts/migrate-from-sheet.ts --legacy solidaris-legacy-export.json                 # dry run
//   node scripts/migrate-from-sheet.ts --projects projects.csv --users users.csv --apply    # write
//
// --apply needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment. The service
// key bypasses row-level security: run this only on a trusted computer, never in the browser,
// and never commit the key. See docs/ADMIN_GUIDE.md.
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { mapProject, migrationReport, parseSheetProjects, parseSheetUsers, type LegacyProject, type LegacyUser, type MappedProject } from './lib/legacyMap.ts'

const args = process.argv.slice(2)
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const apply = args.includes('--apply')

function load(): { projects: LegacyProject[]; users: LegacyUser[] } {
  const legacy = arg('legacy')
  if (legacy) {
    const data = JSON.parse(readFileSync(legacy, 'utf8')) as { projects?: LegacyProject[]; users?: LegacyUser[] }
    return { projects: data.projects ?? [], users: data.users ?? [] }
  }
  const p = arg('projects')
  const u = arg('users')
  if (!p || !u) {
    console.error('Give --projects <csv> and --users <csv>, or --legacy <json>.')
    process.exit(1)
  }
  return { projects: parseSheetProjects(readFileSync(p, 'utf8')), users: parseSheetUsers(readFileSync(u, 'utf8')) }
}

async function applyAll(mapped: MappedProject[]): Promise<Record<string, string>> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to apply.')
  const db = createClient(url, key, { auth: { persistSession: false } })
  const redirectTo = process.env.APP_URL ?? 'https://ongboche.github.io/Solidaris-1.0/'
  const outcome: Record<string, string> = {}

  const { data: fv } = await db.from('framework_versions').select('id').eq('status', 'published').order('published_at', { ascending: false }).limit(1).single()
  const { data: domains } = await db.from('domains').select('id, code').eq('framework_version_id', fv!.id)
  const domainId = (code: string) => domains!.find((d) => d.code === code)!.id

  const userIds = new Map<string, string>()
  async function userFor(email: string): Promise<string> {
    if (userIds.has(email)) return userIds.get(email)!
    const { data: existing } = await db.from('profiles').select('id').eq('email', email).maybeSingle()
    let id = existing?.id as string | undefined
    if (!id) {
      // Invitation email: the person sets a new password and accepts the consent notice.
      const { data, error } = await db.auth.admin.inviteUserByEmail(email, { redirectTo })
      if (error) throw new Error(`Invite ${email}: ${error.message}`)
      id = data.user.id
    }
    userIds.set(email, id)
    return id
  }

  for (const m of mapped) {
    try {
      if (!m.ownerEmail) {
        outcome[m.legacyId] = 'skipped: no owner email'
        continue
      }
      const { data: dup } = await db.from('subjects').select('id').eq('name', m.subjectName).maybeSingle()
      if (dup) {
        outcome[m.legacyId] = 'skipped: a subject with this name already exists'
        continue
      }
      const owner = await userFor(m.ownerEmail)
      const { data: subject } = await db.from('subjects').insert({ type: 'programme', name: m.subjectName, country: m.country, description: m.description, created_by: owner }).select('id').single()
      const { data: project } = await db.from('assessment_projects').insert({ subject_id: subject!.id, framework_version_id: fv!.id, status: 'draft', legacy_import: true, created_by: owner }).select('id').single()
      await db.from('project_members').insert({ project_id: project!.id, user_id: owner, role: 'pi', created_by: owner })
      await db.from('project_members').insert({ project_id: project!.id, user_id: owner, role: 'assessor', created_by: owner })
      // Insert as draft (the lock blocks edits to submitted work), then mark submitted.
      const { data: assessment } = await db.from('assessments').insert({ project_id: project!.id, assessor_id: owner, legacy_import: true, created_by: owner }).select('id').single()
      await db.from('domain_ratings').insert(m.ratings.map((r) => ({
        assessment_id: assessment!.id, domain_id: domainId(r.domainCode), rating: r.rating, narrative: r.narrative, confidence: r.confidence, is_complete: false, created_by: owner,
      })))
      const { data: review } = await db.from('integrity_reviews').insert({
        project_id: project!.id, scope: 'assessor', assessment_id: assessment!.id,
        alignment_goal_contradictions: m.integrity.alignment, cost_who_bears: m.integrity.costWhoBears, voice_actual_involvement: m.integrity.voice, created_by: owner,
      }).select('id').single()
      const flags = [['washing', m.integrity.washing], ['power', m.integrity.power]].filter(([, l]) => l)
      if (flags.length)
        await db.from('integrity_flags').insert(flags.map(([flag, level]) => ({
          integrity_review_id: review!.id, flag, level, explanation: level === 'high' ? 'Imported from the previous version without an explanation' : null,
        })))
      await db.from('assessments').update({ status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', assessment!.id)
      outcome[m.legacyId] = 'imported (draft project, legacy assessment submitted)'
    } catch (e) {
      outcome[m.legacyId] = `failed: ${(e as Error).message}`
    }
  }
  return outcome
}

const { projects, users } = load()
const mapped = projects.map((p) => mapProject(p, users))
const outcome = apply ? await applyAll(mapped) : {}
const report = migrationReport(mapped, apply ? 'applied' : 'dry-run', outcome)
const out = arg('report') ?? 'migration-report.md'
writeFileSync(out, report)
console.log(report)
console.log(`Report written to ${out}${apply ? '' : ' (dry run: nothing was written to the database; add --apply to import)'}`)
