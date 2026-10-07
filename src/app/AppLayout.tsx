import { Link, NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LogOut } from 'lucide-react'
import { useAuth } from './auth'

export function AppLayout() {
  const { t } = useTranslation()
  const { session, profile, signOut } = useAuth()
  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-panel focus:p-3"
      >
        {t('app.skipToContent')}
      </a>
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex flex-col no-underline">
            <span className="text-lg font-semibold tracking-tight">{t('app.name')}</span>
            <span className="text-sm text-muted">{t('app.tagline')}</span>
          </Link>
          {session && (
            <nav aria-label={t('nav.mainNavigation')} className="flex flex-wrap items-center gap-4">
              <NavLink to="/" end className={({ isActive }) => (isActive ? 'font-semibold underline' : 'underline-offset-4 hover:underline')}>
                {t('nav.home')}
              </NavLink>
              <NavLink to="/profile" className={({ isActive }) => (isActive ? 'font-semibold underline' : 'underline-offset-4 hover:underline')}>
                {profile?.full_name ?? t('nav.profile')}
              </NavLink>
              <button type="button" onClick={() => void signOut()} className="inline-flex min-h-11 items-center gap-1 text-muted hover:text-ink">
                <LogOut aria-hidden className="h-4 w-4" /> {t('nav.signOut')}
              </button>
            </nav>
          )}
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}
