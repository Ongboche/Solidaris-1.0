import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from './auth'
import { Spinner } from '../ui/Feedback'

/** Signed-in users only; remembers where they were going. */
export function RequireAuth() {
  const { t } = useTranslation()
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Spinner label={t('common.loading')} />
  if (!session) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />
  return <Outlet />
}

/** Users must accept the privacy notice before anything else (PLAN D-8). */
export function RequireConsent() {
  const { t } = useTranslation()
  const { profileLoading, hasConsented } = useAuth()
  if (profileLoading) return <Spinner label={t('common.loading')} />
  if (!hasConsented) return <Navigate to="/consent" replace />
  return <Outlet />
}
