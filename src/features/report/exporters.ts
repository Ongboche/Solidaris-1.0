// File exports (brief §10). The PDF and Word libraries are loaded only when someone
// exports, to keep the first page load small (brief §9.14).
import { assertNoComposite } from '../../domain/noComposite'
import type { ReportData } from './reportData'
import { evidenceCsv, ratingsCsv, type EvidenceRow } from './csv'

export function download(filename: string, content: Blob | string, type = 'text/csv;charset=utf-8') {
  const blob = typeof content === 'string' ? new Blob(['﻿', content], { type }) : content
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'solidaris'

export function exportRatingsCsv(d: ReportData) {
  download(`${slug(d.subject.name)}-domain-ratings.csv`, ratingsCsv(d))
}

export function exportEvidenceCsv(name: string, rows: EvidenceRow[]) {
  download(`${slug(name)}-evidence-register.csv`, evidenceCsv(rows))
}

export interface ReportText {
  title: string
  labelText: string
  sections: { heading: string; paragraphs: string[] }[]
  table: { headers: string[]; rows: string[][] }
}

/** Plain text structure shared by PDF and DOCX, so both say exactly the same thing. */
export function toReportText(d: ReportData, t: (key: string, vars?: Record<string, unknown>) => string): ReportText {
  assertNoComposite(d)
  const level = (l: string | null) => (l ? t(`level.${l}`) : '—')
  const sections: ReportText['sections'] = []
  sections.push({
    heading: t('report.subjectSection'),
    paragraphs: [
      `${d.subject.name} — ${t(`subjectType.${d.subject.type}`)}${d.subject.country ? `, ${d.subject.country}` : ''}`,
      ...(d.subject.description ? [d.subject.description] : []),
      ...(d.context?.financing ? [`${t('context.financing')}: ${d.context.financing}`] : []),
      ...(d.context?.governance ? [`${t('context.governance')}: ${d.context.governance}`] : []),
      ...(d.context?.target_population ? [`${t('context.population')}: ${d.context.target_population}`] : []),
    ],
  })
  if (d.decision?.decision_text)
    sections.push({
      heading: t('report.decisionSection'),
      paragraphs: [
        d.decision.decision_text,
        `${t('scoping.decisionMaker')}: ${d.decision.decision_maker_name ?? '—'}`,
        `${t('report.window')}: ${d.decision.window_start ?? '—'} – ${d.decision.window_end ?? '—'}`,
      ],
    })
  sections.push({
    heading: t('report.integritySection'),
    paragraphs: [
      d.flags.map((f) => `${t(`integrity.flag.${f.flag}`)}: ${level(f.level)}`).join(' · ') || '—',
      ...d.flags.filter((f) => f.level === 'high' && f.explanation).map((f) => `${t(`integrity.flag.${f.flag}`)}: ${f.explanation}`),
      ...(d.solidarityType.primary
        ? [`${t('integrity.primaryType')}: ${t(`solidarityType.${d.solidarityType.primary}`)}${d.solidarityType.secondary ? ` · ${t('integrity.secondaryType')}: ${t(`solidarityType.${d.solidarityType.secondary}`)}` : ''}`]
        : []),
    ],
  })
  if (d.dissent.length)
    sections.push({ heading: t('report.dissentSection'), paragraphs: d.dissent.map((x) => `${x.domainCode}: ${x.position} — ${x.rationale}`) })
  if (d.gaps.length)
    sections.push({ heading: t('report.gapsSection'), paragraphs: d.gaps.map((g) => `${g.domainCode}: ${g.description}${g.effect ? ` — ${g.effect}` : ''}`) })
  if (d.memberChecks.length)
    sections.push({
      heading: t('report.memberCheckSection'),
      paragraphs: d.memberChecks.map((m) => `${m.group}${m.date ? ` (${m.date})` : ''}: ${m.response ?? ''}${m.relevance ? ` — ${t('report.relevance')} ${m.relevance}/5` : ''}`),
    })
  if (d.narrative)
    sections.push({
      heading: t('report.narrativeSection'),
      paragraphs: [d.narrative.approved ? t('report.narrativeApproved') : t('report.narrativeDraftWarning'), ...d.narrative.body.split('\n').filter(Boolean)],
    })
  return {
    title: t('report.documentTitle', { name: d.subject.name }),
    labelText: t(`profileView.label.${d.label}`),
    sections,
    table: {
      headers: [t('evidence.domain'), t('deliberation.rating'), t('assessment.confidence'), t('profileView.keyEvidence'), t('assessment.narrative')],
      rows: d.domains.map((x) => [
        `${x.code} ${x.name} (${x.dimension})`,
        x.rating === null ? t('common.notRated') : `${x.rating} – ${x.ratingLabel ?? ''}${x.consensusCategory ? ` (${t(`consensusCategory.${x.consensusCategory}`)})` : ''}`,
        level(x.confidence),
        x.keyEvidence.join('; ') || '—',
        x.narrative ?? '',
      ]),
    },
  }
}

export async function exportDocx(text: ReportText, filename: string) {
  const { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell, TextRun, WidthType } = await import('docx')
  const cell = (s: string, bold = false) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: s, bold })] })] })
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: text.title, heading: HeadingLevel.TITLE }),
          new Paragraph({ children: [new TextRun({ text: text.labelText, bold: true })] }),
          new Paragraph({ text: '' }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [new TableRow({ tableHeader: true, children: text.table.headers.map((h) => cell(h, true)) }), ...text.table.rows.map((r) => new TableRow({ children: r.map((c) => cell(c)) }))],
          }),
          ...text.sections.flatMap((s) => [new Paragraph({ text: s.heading, heading: HeadingLevel.HEADING_2 }), ...s.paragraphs.map((p) => new Paragraph({ text: p }))]),
        ],
      },
    ],
  })
  download(filename, await Packer.toBlob(doc))
}

export async function exportPdf(text: ReportText, filename: string) {
  const [{ pdf, Document, Page, Text, View, StyleSheet }, React] = await Promise.all([import('@react-pdf/renderer'), import('react')])
  const h = React.createElement
  const s = StyleSheet.create({
    page: { padding: 36, fontSize: 10, lineHeight: 1.4 },
    title: { fontSize: 18, marginBottom: 6 },
    label: { fontSize: 11, marginBottom: 12 },
    h2: { fontSize: 13, marginTop: 14, marginBottom: 4 },
    row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#DAD4C4', paddingVertical: 3 },
    cell: { flex: 1, paddingRight: 4 },
    wide: { flex: 2, paddingRight: 4 },
    head: { fontWeight: 'bold' },
  })
  const widths = [s.wide, s.cell, s.cell, s.wide, s.wide]
  const doc = h(
    Document,
    { title: text.title },
    h(
      Page,
      { size: 'A4', style: s.page },
      h(Text, { style: s.title }, text.title),
      h(Text, { style: s.label }, text.labelText),
      h(View, { style: [s.row, s.head] }, ...text.table.headers.map((c, i) => h(Text, { key: i, style: widths[i] }, c))),
      ...text.table.rows.map((r, n) => h(View, { key: n, style: s.row, wrap: false }, ...r.map((c, i) => h(Text, { key: i, style: widths[i] }, c)))),
      ...text.sections.flatMap((sec, n) => [
        h(Text, { key: `h${n}`, style: s.h2 }, sec.heading),
        ...sec.paragraphs.map((p, i) => h(Text, { key: `p${n}-${i}` }, p)),
      ]),
    ),
  )
  download(filename, await pdf(doc).toBlob())
}
