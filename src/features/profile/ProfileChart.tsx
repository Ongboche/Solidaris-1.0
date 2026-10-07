import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { useTranslation } from 'react-i18next'
import type { ReportDomain } from '../report/reportData'

const OPACITY: Record<string, number> = { low: 0.4, medium: 0.7, high: 1 }
const COLOR: Record<string, string> = { WHAT: 'var(--color-what)', HOW: 'var(--color-how)', 'TO WHAT END': 'var(--color-end)' }
const TEXT_COLOR: Record<string, string> = { WHAT: 'var(--color-what-text)', HOW: 'var(--color-how-text)', 'TO WHAT END': 'var(--color-end-text)' }

/**
 * Grouped horizontal bars by dimension (brief §9.8). One bar per domain on its own
 * 1–5 scale; unrated domains are a visible gap labelled "Not rated", never a zero bar.
 * Confidence is encoded by opacity AND written in the label. No averages anywhere.
 */
export function ProfileChart({ domains }: { domains: ReportDomain[] }) {
  const { t } = useTranslation()
  const dimensions = [...new Set(domains.map((d) => d.dimension))]
  return (
    <div className="flex flex-col gap-6">
      {dimensions.map((dim) => {
        const rows = domains
          .filter((d) => d.dimension === dim)
          .map((d) => ({
            ...d,
            label: `${d.code} ${d.name}`,
            value: d.rating, // null stays null: Recharts draws no bar
            text: d.rating === null ? t('common.notRated') : `${d.rating}${d.confidence ? ` · ${t(`level.${d.confidence}`)} ${t('profileView.confidenceShort')}` : ''}`,
          }))
        return (
          <figure key={dim} className="flex flex-col gap-2">
            <figcaption className="font-semibold" style={{ color: TEXT_COLOR[dim] }}>
              {dim}
            </figcaption>
            <div aria-hidden style={{ width: '100%', height: rows.length * 52 + 24 }}>
              <ResponsiveContainer>
                <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 110 }}>
                  <XAxis type="number" domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} />
                  <YAxis type="category" dataKey="label" width={200} tick={{ fontSize: 13 }} />
                  <Bar dataKey="value" isAnimationActive={false} barSize={22}>
                    {rows.map((r) => (
                      <Cell key={r.code} fill={COLOR[dim] ?? 'var(--color-ink)'} fillOpacity={OPACITY[r.confidence ?? 'low'] ?? 0.4} />
                    ))}
                    <LabelList dataKey="text" position="right" style={{ fontSize: 12, fill: 'var(--color-ink)' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </figure>
        )
      })}
      <p className="text-sm text-muted">{t('profileView.chartNote')}</p>
    </div>
  )
}
