import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../app/auth'
import { Alert, Card, EmptyState } from '../../ui/Feedback'

export default function HomePage() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const notice = (useLocation().state as { notice?: string } | null)?.notice
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">
        {profile?.full_name ? t('home.greeting', { name: profile.full_name }) : t('home.greetingNoName')}
      </h1>
      {notice && <Alert tone="success">{notice}</Alert>}
      <section aria-labelledby="next-title" className="flex flex-col gap-3">
        <h2 id="next-title" className="text-xl font-semibold">
          {t('home.nextTitle')}
        </h2>
        <EmptyState title={t('home.nothingYet')}>{t('home.nothingYetBody')}</EmptyState>
      </section>
      <Card>
        <h2 className="mb-2 text-xl font-semibold">{t('home.aboutTitle')}</h2>
        <p>{t('home.aboutBody')}</p>
      </Card>
    </div>
  )
}
