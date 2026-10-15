import { useTranslation } from 'react-i18next'
import type { ProjectRole } from '../../domain/types'
import type { Bundle } from '../../lib/api'
import { useTeam } from '../../lib/api'
import { Alert } from '../../ui/Feedback'
import { SelectField } from '../../ui/Field'

/** PLAN D-53: the tabs each role works in, so "View as" shows only what applies to that role. */
export const DEMO_TABS: Record<ProjectRole, string[]> = {
  pi: ['.', 'team', 'scoping', 'context', 'assessment', 'evidence', 'integrity', 'deliberation', 'profile', 'report', 'uptake', 'signals', 'learning'],
  assessor: ['.', 'team', 'context', 'assessment', 'evidence', 'integrity', 'deliberation', 'profile', 'report', 'signals'],
  reviewer: ['.', 'team', 'assessment', 'evidence', 'integrity', 'deliberation', 'profile', 'report'],
  external_expert: ['.', 'team', 'evidence', 'deliberation', 'profile', 'report'],
  community_participant: ['.', 'team', 'deliberation', 'profile', 'report'],
  kt_lead: ['.', 'team', 'profile', 'report', 'uptake', 'signals'],
  observer: ['.', 'profile', 'report'],
}

/** One demo persona per member row; the value is the persona's user id. */
export function demoPersonas(project: Bundle) {
  const order = Object.keys(DEMO_TABS)
  return project.project_members
    .map((m) => ({ userId: m.user_id, role: m.role }))
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || a.userId.localeCompare(b.userId))
}

export function DemoBanner({ project, viewAs, onChange }: { project: Bundle; viewAs: string; onChange: (userId: string) => void }) {
  const { t } = useTranslation()
  const team = useTeam(project.id)
  const name = (id: string) => team.data?.find((m) => m.user_id === id)?.full_name
  return (
    <Alert title={t('demo.bannerTitle')}>
      <div className="flex flex-col gap-3">
        <p>{t('demo.bannerBody')}</p>
        <p className="text-sm">{t('demo.viewAsHint')}</p>
        <div className="max-w-md">
          <SelectField
            label={t('demo.viewAs')}
            value={viewAs}
            onChange={(e) => onChange(e.target.value)}
            options={demoPersonas(project).map((p) => ({
              value: p.userId,
              label: name(p.userId) ? `${t(`role.${p.role}`)} — ${name(p.userId)}` : t(`role.${p.role}`),
            }))}
          />
        </div>
      </div>
    </Alert>
  )
}
