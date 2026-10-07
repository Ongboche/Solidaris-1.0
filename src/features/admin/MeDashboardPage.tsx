import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { run } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../app/auth'
import { SelectField, TextField } from '../../ui/Field'
import { Alert, Card, Spinner } from '../../ui/Feedback'
import { share } from './share'
import { ScrollArea } from '../../ui/ScrollArea'

interface Indicators {
  projects: number
  oc1: { decisions_considering_profile: number; released_profiles: number; released_with_action_plan: number; use_types: Record<string, number> }
  oc2: { domains_compared: number; domains_within_threshold: number; consensus_ratings: number; consensus_medium_high: number; member_checks_rated: number; member_check_relevance_mean: number | null }
  oc3: { deliberating_projects: number; with_community_participant: number; high_flags: number; high_flags_explained: number; non_consensus_domains: number; non_consensus_with_dissent: number }
  oc4: { institutions_past_g6: number; registrations: number; report_downloads: number }
  op3: { median_days_g0_to_g6: number | null; first_pass: Record<string, { reviewed: number; passed_first_time: number }>; recent_hold_reasons: { gate: string; reason: string | null; at: string }[] }
}

const TYPES = ['project', 'programme', 'portfolio', 'investment', 'policy']

/** Toolkit M&E (brief §11): computed from data, filterable. Measures the toolkit, not solidarity. */
export default function MeDashboardPage() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [type, setType] = useState('')
  const [country, setCountry] = useState('')
  const [institution, setInstitution] = useState('')
  const institutions = useQuery({
    queryKey: ['institutions'],
    queryFn: async () => (await run(supabase.from('institutions').select('id, name').order('name'))) as { id: string; name: string }[],
  })
  const me = useQuery({
    queryKey: ['me-indicators', type, country, institution],
    queryFn: async () =>
      (await run(supabase.rpc('me_indicators', { p_subject_type: type || null, p_country: country || null, p_institution: institution || null }))) as Indicators,
  })

  const Row = ({ label, value }: { label: string; value: string | number }) => (
    <div className="flex justify-between gap-4 border-b border-line py-2 last:border-0">
      <dt>{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted">{t('me.intro')}</p>
      <Card className="grid gap-3 sm:grid-cols-3">
        <SelectField label={t('me.subjectType')} value={type} placeholder={t('me.all')} onChange={(e) => setType(e.target.value)} options={TYPES.map((x) => ({ value: x, label: t(`subjectType.${x}`) }))} />
        <TextField label={t('auth.country')} value={country} onChange={(e) => setCountry(e.target.value)} />
        {profile?.platform_role === 'platform_admin' && (
          <SelectField label={t('me.institution')} value={institution} placeholder={t('me.all')} onChange={(e) => setInstitution(e.target.value)} options={(institutions.data ?? []).map((i) => ({ value: i.id, label: i.name }))} />
        )}
      </Card>
      {me.isLoading ? <Spinner label={t('common.loading')} /> : me.error ? <Alert tone="error">{me.error.message}</Alert> : me.data && (
        <>
          <p>{t('me.projects', { count: me.data.projects })}</p>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-2 text-lg font-semibold">{t('me.oc1')}</h2>
              <dl>
                <Row label={t('me.decisions')} value={me.data.oc1.decisions_considering_profile} />
                <Row label={t('me.releasedWithPlan')} value={share(me.data.oc1.released_with_action_plan, me.data.oc1.released_profiles, t)} />
                <Row label={t('me.useTypes')} value={Object.entries(me.data.oc1.use_types).map(([k, v]) => `${t(`uptake.useType.${k}`)} ${v}`).join(' · ') || '—'} />
              </dl>
            </Card>
            <Card>
              <h2 className="mb-2 text-lg font-semibold">{t('me.oc2')}</h2>
              <dl>
                <Row label={t('me.agreement')} value={share(me.data.oc2.domains_within_threshold, me.data.oc2.domains_compared, t)} />
                <Row label={t('me.consensusConfidence')} value={share(me.data.oc2.consensus_medium_high, me.data.oc2.consensus_ratings, t)} />
                <Row label={t('me.relevance')} value={me.data.oc2.member_check_relevance_mean === null ? '—' : t('me.relevanceValue', { mean: me.data.oc2.member_check_relevance_mean, n: me.data.oc2.member_checks_rated })} />
              </dl>
            </Card>
            <Card>
              <h2 className="mb-2 text-lg font-semibold">{t('me.oc3')}</h2>
              <dl>
                <Row label={t('me.communityInDeliberation')} value={share(me.data.oc3.with_community_participant, me.data.oc3.deliberating_projects, t)} />
                <Row label={t('me.highExplained')} value={share(me.data.oc3.high_flags_explained, me.data.oc3.high_flags, t)} />
                <Row label={t('me.dissentRecorded')} value={share(me.data.oc3.non_consensus_with_dissent, me.data.oc3.non_consensus_domains, t)} />
              </dl>
            </Card>
            <Card>
              <h2 className="mb-2 text-lg font-semibold">{t('me.oc4')}</h2>
              <dl>
                <Row label={t('me.institutionsPastG6')} value={me.data.oc4.institutions_past_g6} />
                <Row label={t('me.registrations')} value={me.data.oc4.registrations} />
                <Row label={t('me.downloads')} value={me.data.oc4.report_downloads} />
              </dl>
            </Card>
          </div>
          <Card>
            <h2 className="mb-2 text-lg font-semibold">{t('me.op3')}</h2>
            <dl>
              <Row label={t('me.medianDays')} value={me.data.op3.median_days_g0_to_g6 ?? '—'} />
            </dl>
            <ScrollArea label={t('me.firstPass')} className="mt-3">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">{t('me.firstPass')}</caption>
                <thead className="border-b border-line text-muted"><tr><th scope="col" className="p-2">{t('me.gate')}</th><th scope="col" className="p-2">{t('me.firstPass')}</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {Object.entries(me.data.op3.first_pass).sort().map(([g, v]) => (
                    <tr key={g}><th scope="row" className="p-2">{g}</th><td className="p-2">{share(v.passed_first_time, v.reviewed, t)}</td></tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
            {me.data.op3.recent_hold_reasons.length > 0 && (
              <>
                <h3 className="mt-4 font-semibold">{t('me.holdReasons')}</h3>
                <ul className="list-disc pl-6 text-sm">
                  {me.data.op3.recent_hold_reasons.map((h, i) => <li key={i}>{h.gate}: {h.reason}</li>)}
                </ul>
              </>
            )}
          </Card>
          <p className="text-sm text-muted">{t('me.note')}</p>
        </>
      )}
    </div>
  )
}
