import { describe, expect, it } from 'vitest'
import { signUpSchema } from './schemas'
import { readLegacyExport } from '../platform/LegacyExportPage'

const valid = {
  fullName: 'Amina Kibet',
  email: 'amina@example.org',
  institution: 'University of Nairobi',
  position: 'Research fellow',
  country: 'Kenya',
  discipline: 'Health policy',
  password: 'long-enough-1',
  confirmPassword: 'long-enough-1',
  processing: true,
  handling: true,
  emailConsent: false,
}

describe('sign-up validation', () => {
  it('accepts a complete form with email notifications optional (PLAN D-8)', () => {
    expect(signUpSchema.safeParse(valid).success).toBe(true)
  })

  it('has no role field: roles come only by invitation (defect 2)', () => {
    expect(Object.keys(signUpSchema._def.schema.shape)).not.toContain('role')
  })

  it('requires both mandatory consents', () => {
    const r = signUpSchema.safeParse({ ...valid, handling: false })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.path).toEqual(['handling'])
  })

  it('requires matching passwords of 10+ characters', () => {
    expect(signUpSchema.safeParse({ ...valid, password: 'short', confirmPassword: 'short' }).success).toBe(false)
    const r = signUpSchema.safeParse({ ...valid, confirmPassword: 'different-1' })
    expect(r.error?.issues[0]?.message).toBe('auth.validation.passwordMatch')
  })
})

describe('legacy export (brief §13)', () => {
  it('strips passwords from the old browser data', () => {
    const storage = {
      getItem: () =>
        JSON.stringify({ users: [{ id: 'owner1', password: 'owner123' }], projects: [{ id: 'p1' }] }),
    }
    const out = readLegacyExport(storage)
    expect(out?.users).toEqual([{ id: 'owner1' }])
    expect(JSON.stringify(out)).not.toContain('owner123')
  })

  it('returns null when nothing is stored', () => {
    expect(readLegacyExport({ getItem: () => null })).toBeNull()
  })
})
