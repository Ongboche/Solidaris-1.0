import { PGlite, type Transaction } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..')
const migrationsDir = join(root, 'supabase', 'migrations')

export const CONSENTED = {
  consent_processing: true,
  consent_handling: true,
  consent_email: false,
  consent_notice_version: 'test',
}

/** A fresh database with the Supabase shim and every migration applied, in order. */
export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(readFileSync(join(__dirname, 'supabase-shim.sql'), 'utf8'))
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files) {
    try {
      await db.exec(readFileSync(join(migrationsDir, file), 'utf8'))
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`)
    }
  }
  return db
}

let userCounter = 0

/** Simulates Supabase sign-up: inserts into auth.users, which fires handle_new_user(). */
export async function createUser(
  db: PGlite,
  meta: Record<string, unknown> = { full_name: 'Test User', ...CONSENTED },
): Promise<string> {
  userCounter += 1
  const id = `00000000-0000-4000-8000-${String(userCounter).padStart(12, '0')}`
  await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [
    id,
    `user${userCounter}@example.org`,
    JSON.stringify(meta),
  ])
  return id
}

/** Runs fn as a signed-in API user (role authenticated, auth.uid() = userId). Rolls back on error. */
export async function asUser<T>(
  db: PGlite,
  userId: string | null,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${userId ? 'authenticated' : 'anon'}`)
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ''])
    return fn(tx)
  })
}

/** Convenience: single query as a user, returning rows. */
export async function queryAs<T = Record<string, unknown>>(
  db: PGlite,
  userId: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return asUser(db, userId, async (tx) => (await tx.query<T>(sql, params)).rows)
}

/** Superuser escape hatch for test setup only (bypasses RLS, like the service role). */
export async function asAdmin<T = Record<string, unknown>>(db: PGlite, sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows
}
