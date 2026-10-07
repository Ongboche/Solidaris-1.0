import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../app/auth'
import { Alert } from '../../ui/Feedback'

/** Administration (brief §7): platform admins manage everything; institution admins see their institution. */
export default function AdminLayout() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const role = profile?.platform_role
  if (role !== 'platform_admin' && role !== 'institution_admin') return <Alert tone="error">{t('admin.notAllowed')}</Alert>
  const tabs = [
    { to: '.', label: t('admin.tabs.me'), end: true },
    { to: 'users', label: t('admin.tabs.users') },
    ...(role === 'platform_admin'
      ? [
          { to: 'institutions', label: t('admin.tabs.institutions') },
          { to: 'framework', label: t('admin.tabs.framework') },
          { to: 'audit', label: t('admin.tabs.audit') },
        ]
      : []),
  ]
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold">{t('admin.title')}</h1>
        <p className="text-muted">{t(role === 'platform_admin' ? 'admin.introPlatform' : 'admin.introInstitution')}</p>
      </div>
      <nav aria-label={t('admin.sections')} className="border-b border-line">
        <ul className="-mb-px flex flex-wrap gap-1">
          {tabs.map((tab) => (
            <li key={tab.to}>
              <NavLink to={tab.to} end={tab.end} className={({ isActive }) => `inline-flex min-h-11 items-center border-b-2 px-3 ${isActive ? 'border-primary font-semibold' : 'border-transparent text-muted hover:text-ink'}`}>
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </div>
  )
}
