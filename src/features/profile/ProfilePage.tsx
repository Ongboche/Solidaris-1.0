import { useTranslation } from 'react-i18next'
import { Alert, Card, Chip, EmptyState, Spinner } from '../../ui/Feedback'
import { Term } from '../../ui/Term'
import { useProjectContext } from '../project/ProjectLayout'
import { ProfileChart } from './ProfileChart'
import { useReportData } from './useReportData'

/** T8 solidarity profile: domain by domain, never a single score (invariant 1). */
export default function ProfilePage() {
  const { t } = useTranslation()
  const { project, passed } = useProjectContext()
  const { data, loading, approved } = useReportData(project, passed.includes('G6'))

  if (!approved) return <EmptyState title={t('profileView.notYet')}>{t('profileView.notYetBody')}</EmptyState>
  if (loading || !data) return <Spinner label={t('common.loading')} />

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-semibold">{t('profileView.title')}</h2>
        <Chip tone={data.label === 'exploratory' ? 'alert' : 'neutral'}>{t(`profileView.label.${data.label}`)}</Chip>
      </div>
      <p className="text-muted">
        {t('profileView.intro')} {t('profileView.rated', { rated: data.ratedDomains.rated, of: data.ratedDomains.of })}
      </p>
      {data.label === 'exploratory' && (
        <Alert>
          <Term term="singleAssessor">{t('team.exploratory')}</Term> — {t('team.singleAssessorHelp')}
        </Alert>
      )}
      <Card>
        <ProfileChart domains={data.domains} />
      </Card>

      <div className="overflow-x-auto rounded border border-line bg-panel">
        <table className="w-full text-left">
          <caption className="p-3 text-left font-semibold">{t('profileView.tableCaption')}</caption>
          <thead className="border-b border-line text-sm text-muted">
            <tr>
              <th scope="col" className="p-3">{t('evidence.domain')}</th>
              <th scope="col" className="p-3">{t('deliberation.rating')}</th>
              <th scope="col" className="p-3">{t('assessment.confidence')}</th>
              <th scope="col" className="p-3">{t('profileView.keyEvidence')}</th>
              <th scope="col" className="p-3">{t('assessment.narrative')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line align-top">
            {data.domains.map((d) => (
              <tr key={d.code}>
                <th scope="row" className="p-3 font-medium">
                  {d.code} {d.name}
                  <span className="block text-sm font-normal text-muted">{d.dimension}</span>
                </th>
                <td className="p-3">
                  {d.rating === null ? t('common.notRated') : `${d.rating} – ${d.ratingLabel}`}
                  {d.consensusCategory && <span className="block text-sm text-muted">{t(`consensusCategory.${d.consensusCategory}`)}</span>}
                </td>
                <td className="p-3">{d.confidence ? t(`level.${d.confidence}`) : '—'}</td>
                <td className="p-3 text-sm">{d.keyEvidence.join('; ') || '—'}</td>
                <td className="p-3 text-sm">{d.narrative}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Card className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">{t('integrity.flagsTitle')}</h3>
        <div className="flex flex-wrap gap-2">
          {data.flags.map((f) => (
            <Chip key={f.flag} tone={f.level === 'high' ? 'alert' : 'neutral'}>
              {t(`integrity.flag.${f.flag}`)}: {t(`level.${f.level}`)}
            </Chip>
          ))}
        </div>
        {data.flags.filter((f) => f.level === 'high').map((f) => (
          <p key={f.flag} className="text-sm">
            <strong>{t(`integrity.flag.${f.flag}`)}</strong>: {f.explanation}
          </p>
        ))}
        {data.solidarityType.primary && (
          <p>
            {t('integrity.primaryType')}: <strong>{t(`solidarityType.${data.solidarityType.primary}`)}</strong>
            {data.solidarityType.secondary && ` · ${t('integrity.secondaryType')}: ${t(`solidarityType.${data.solidarityType.secondary}`)}`}
          </p>
        )}
      </Card>
    </div>
  )
}
