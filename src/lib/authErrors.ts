import type { TFunction } from 'i18next'

/** Turns Supabase auth errors into plain-language messages (brief §9.17). */
export function authErrorMessage(error: { message?: string; status?: number; code?: string } | null, t: TFunction) {
  if (!error) return null
  const text = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase()
  if (text.includes('invalid login') || text.includes('invalid_credentials')) return t('auth.invalidCredentials')
  if (text.includes('email not confirmed') || text.includes('email_not_confirmed')) return t('auth.emailNotConfirmed')
  if (error.status === 429 || text.includes('rate limit') || text.includes('over_')) return t('auth.rateLimited')
  if (text.includes('failed to fetch') || text.includes('network')) return t('errors.network')
  return error.message ?? t('errors.generic')
}
