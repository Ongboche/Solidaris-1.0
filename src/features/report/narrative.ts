// Template narrative draft (brief §10). Built only from recorded entries — it states
// nothing that is not in the data — and is labelled as auto-drafted (invariant 11).
import type { ReportData } from './reportData'

export const DRAFT_LABEL = 'Auto-drafted from your entries — edit before use.'

const LEVEL: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High' }
const FLAG: Record<string, string> = {
  washing: 'Solidarity washing',
  power: 'Power imbalance',
  sustainability: 'Sustainability',
  inclusion: 'Inclusion gap',
}

export function buildNarrativeDraft(d: ReportData): string {
  const lines: string[] = [DRAFT_LABEL, '']

  lines.push(`Subject: ${d.subject.name} (${d.subject.type}${d.subject.country ? `, ${d.subject.country}` : ''}).`)
  if (d.decision?.decision_text) {
    lines.push(
      `This profile informs the decision: ${d.decision.decision_text}` +
        (d.decision.decision_maker_name ? `, to be taken by ${d.decision.decision_maker_name}` : '') +
        (d.decision.window_start && d.decision.window_end
          ? ` between ${d.decision.window_start} and ${d.decision.window_end}.`
          : '.'),
    )
  }
  if (d.label === 'exploratory') lines.push('This is an Exploratory profile based on a single assessor.')
  lines.push('')

  lines.push('Domain profile (each domain is rated on its own; ratings are not combined):')
  for (const dom of d.domains) {
    const rating = dom.rating === null ? 'not rated' : `${dom.rating} – ${dom.ratingLabel ?? ''}`.trim()
    const conf = dom.confidence ? `, ${LEVEL[dom.confidence]} confidence` : ''
    const cat = dom.consensusCategory === 'no_consensus' ? ' (no consensus)' : dom.consensusCategory === 'deferred_pending_evidence' ? ' (deferred pending evidence)' : ''
    lines.push(`- ${dom.code} ${dom.name}: ${rating}${conf}${cat}.`)
  }
  lines.push('')

  const high = d.flags.filter((f) => f.level === 'high')
  if (d.flags.length) {
    lines.push('Integrity risk flags: ' + d.flags.map((f) => `${FLAG[f.flag] ?? f.flag} ${LEVEL[f.level] ?? f.level}`).join('; ') + '.')
    for (const f of high) if (f.explanation) lines.push(`- ${FLAG[f.flag] ?? f.flag} is High: ${f.explanation}`)
  }
  if (d.solidarityType.primary) {
    lines.push(
      `Solidarity type: primarily ${d.solidarityType.primary}` +
        (d.solidarityType.secondary ? `, secondarily ${d.solidarityType.secondary}` : '') +
        '.',
    )
  }
  lines.push('')

  lines.push('Limitations and confidence caveats:')
  const low = d.domains.filter((x) => x.confidence === 'low').map((x) => x.code)
  const unrated = d.domains.filter((x) => x.rating === null).map((x) => x.code)
  if (low.length) lines.push(`- Low confidence in: ${low.join(', ')}.`)
  if (unrated.length) lines.push(`- Not rated: ${unrated.join(', ')}.`)
  for (const g of d.gaps) lines.push(`- Evidence gap (${g.domainCode}): ${g.description}${g.effect ? ` — ${g.effect}` : ''}.`)
  if (d.dissent.length) lines.push(`- Recorded dissent on: ${[...new Set(d.dissent.map((x) => x.domainCode))].join(', ')}.`)
  if (!low.length && !unrated.length && !d.gaps.length && !d.dissent.length) lines.push('- [Add the limitations of this assessment.]')
  lines.push('')
  lines.push('Recommended actions:')
  lines.push('- [Add recommended actions agreed by the team.]')
  return lines.join('\n')
}
