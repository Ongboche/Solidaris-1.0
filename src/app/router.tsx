import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppLayout } from './AppLayout'
import { RequireAuth, RequireConsent } from './guards'
import { Spinner } from '../ui/Feedback'
import { flags } from '../lib/flags'

// Routes are lazy-loaded to keep the first download small (brief §9.14).
const SignInPage = lazy(() => import('../features/auth/SignInPage'))
const SignUpPage = lazy(() => import('../features/auth/SignUpPage'))
const ConsentPage = lazy(() => import('../features/auth/ConsentPage'))
const ForgotPasswordPage = lazy(() =>
  import('../features/auth/PasswordPages').then((m) => ({ default: m.ForgotPasswordPage })),
)
const ResetPasswordPage = lazy(() =>
  import('../features/auth/PasswordPages').then((m) => ({ default: m.ResetPasswordPage })),
)
const CheckEmailPage = lazy(() => import('../features/auth/PasswordPages').then((m) => ({ default: m.CheckEmailPage })))
const HomePage = lazy(() => import('../features/platform/HomePage'))
const ProfilePage = lazy(() => import('../features/platform/ProfilePage'))
const LegacyExportPage = lazy(() => import('../features/platform/LegacyExportPage'))
const NewProjectPage = lazy(() => import('../features/platform/NewProjectPage'))
const ProjectLayout = lazy(() => import('../features/project/ProjectLayout'))
const OverviewPage = lazy(() => import('../features/project/OverviewPage'))
const TeamPage = lazy(() => import('../features/project/TeamPage'))
const ScopingPage = lazy(() => import('../features/project/ScopingPage'))
const ContextPage = lazy(() => import('../features/project/ContextPage'))
const InvitePage = lazy(() => import('../features/project/InvitePage'))
const GateReviewPage = lazy(() => import('../features/gates/GateReviewPage'))

function Loading({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  return <Suspense fallback={<Spinner label={t('common.loading')} />}>{children}</Suspense>
}

function NotFound() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-3xl font-semibold">{t('errors.notFoundTitle')}</h1>
      <p>{t('errors.notFoundBody')}</p>
      <Link className="text-primary underline" to="/">
        {t('errors.goHome')}
      </Link>
    </div>
  )
}

const page = (node: ReactNode) => <Loading>{node}</Loading>

export const router = createBrowserRouter(
  [
    {
      element: <AppLayout />,
      children: [
        { path: 'sign-in', element: page(<SignInPage />) },
        { path: 'sign-up', element: page(<SignUpPage />) },
        { path: 'forgot-password', element: page(<ForgotPasswordPage />) },
        { path: 'check-email', element: page(<CheckEmailPage />) },
        ...(flags.legacyExport ? [{ path: 'legacy-export', element: page(<LegacyExportPage />) }] : []),
        {
          element: <RequireAuth />,
          children: [
            { path: 'reset-password', element: page(<ResetPasswordPage />) },
            { path: 'consent', element: page(<ConsentPage />) },
            {
              element: <RequireConsent />,
              children: [
                { index: true, element: page(<HomePage />) },
                { path: 'profile', element: page(<ProfilePage />) },
                { path: 'invite/:token', element: page(<InvitePage />) },
                { path: 'projects/new', element: page(<NewProjectPage />) },
                {
                  path: 'projects/:projectId',
                  element: page(<ProjectLayout />),
                  children: [
                    { index: true, element: page(<OverviewPage />) },
                    { path: 'team', element: page(<TeamPage />) },
                    { path: 'scoping', element: page(<ScopingPage />) },
                    { path: 'context', element: page(<ContextPage />) },
                    { path: 'gates/:gate', element: page(<GateReviewPage />) },
                  ],
                },
              ],
            },
          ],
        },
        { path: '*', element: <NotFound /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' },
)
