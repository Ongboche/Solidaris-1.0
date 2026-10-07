// CSV exports (brief §10): domain ratings and the evidence register. Domain-level only.
import { assertNoComposite } from '../../domain/noComposite'
import type { ReportData } from './reportData'

function cell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

export function ratingsCsv(d: ReportData): string {
  const headers = ['domain_code', 'domain', 'dimension', 'rating', 'rating_label', 'confidence', 'consensus_category', 'narrative']
  assertNoComposite(Object.fromEntries(headers.map((h) => [h, null])))
  return toCsv(
    headers,
    d.domains.map((x) => [x.code, x.name, x.dimension, x.rating ?? 'Not rated', x.ratingLabel, x.confidence, x.consensusCategory, x.narrative]),
  )
}

export interface EvidenceRow {
  title: string
  type: string
  origin: string
  source_type: string | null
  evidence_date: string | null
  confidentiality: string
  domains: string[]
  location: string
}

export function evidenceCsv(rows: EvidenceRow[]): string {
  return toCsv(
    ['title', 'type', 'origin', 'source_type', 'date', 'confidentiality', 'domains', 'location'],
    rows.map((r) => [r.title, r.type, r.origin, r.source_type, r.evidence_date, r.confidentiality, r.domains.join(' '), r.location]),
  )
}
