// Profile chart as a PNG for PDF and DOCX exports (PLAN D-44). Same rules as the screen
// chart: one bar per domain on its own 1–5 scale, grouped by dimension, unrated shown as
// "Not rated" (never a zero bar), confidence by opacity and in words, no averages.
import type { ReportDomain } from './reportData'

const COLORS: Record<string, string> = { WHAT: '#2F6F5E', HOW: '#B0782E', 'TO WHAT END': '#5B4C8A' }
const ALPHA: Record<string, number> = { low: 0.4, medium: 0.7, high: 1 }

export interface ChartLabels {
  notRated: string
  confidence: (level: string) => string
}

export interface ChartLayoutRow {
  kind: 'dimension' | 'domain'
  y: number
  label: string
  dimension: string
  barWidth: number
  value: number | null
  confidence: string | null
}

/** Pure layout, unit-tested: positions and bar widths only. */
export function chartLayout(domains: ReportDomain[], barMax: number): { rows: ChartLayoutRow[]; height: number } {
  const rows: ChartLayoutRow[] = []
  let y = 16
  for (const dim of [...new Set(domains.map((d) => d.dimension))]) {
    rows.push({ kind: 'dimension', y, label: dim, dimension: dim, barWidth: 0, value: null, confidence: null })
    y += 28
    for (const d of domains.filter((x) => x.dimension === dim)) {
      rows.push({
        kind: 'domain',
        y,
        label: `${d.code} ${d.name}`,
        dimension: dim,
        barWidth: d.rating === null ? 0 : (d.rating / 5) * barMax,
        value: d.rating,
        confidence: d.confidence,
      })
      y += 30
    }
    y += 10
  }
  return { rows, height: y + 24 }
}

export function profileChartPng(domains: ReportDomain[], labels: ChartLabels): { dataUrl: string; width: number; height: number } {
  const width = 900
  const labelWidth = 330
  const barMax = 400
  const { rows, height } = chartLayout(domains, barMax)
  const canvas = document.createElement('canvas')
  const scale = 2
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, width, height)
  ctx.textBaseline = 'middle'

  // Scale ticks 1–5
  ctx.strokeStyle = '#DAD4C4'
  ctx.fillStyle = '#6B6250'
  ctx.font = '12px sans-serif'
  for (let i = 1; i <= 5; i++) {
    const x = labelWidth + (i / 5) * barMax
    ctx.beginPath()
    ctx.moveTo(x, 8)
    ctx.lineTo(x, height - 22)
    ctx.stroke()
    ctx.fillText(String(i), x - 3, height - 10)
  }

  for (const r of rows) {
    if (r.kind === 'dimension') {
      ctx.fillStyle = r.dimension === 'HOW' ? '#8A5A17' : (COLORS[r.dimension] ?? '#20261F') // readable text shade
      ctx.font = 'bold 14px sans-serif'
      ctx.fillText(r.label, 8, r.y)
      continue
    }
    ctx.fillStyle = '#20261F'
    ctx.font = '13px sans-serif'
    ctx.fillText(r.label.length > 44 ? `${r.label.slice(0, 43)}…` : r.label, 8, r.y)
    if (r.value === null) {
      ctx.fillStyle = '#6B6250'
      ctx.font = 'italic 13px sans-serif'
      ctx.fillText(labels.notRated, labelWidth + 6, r.y)
      continue
    }
    ctx.globalAlpha = ALPHA[r.confidence ?? 'low'] ?? 0.4
    ctx.fillStyle = COLORS[r.dimension] ?? '#20261F'
    ctx.fillRect(labelWidth, r.y - 10, r.barWidth, 20)
    ctx.globalAlpha = 1
    ctx.fillStyle = '#20261F'
    ctx.font = '12px sans-serif'
    ctx.fillText(`${r.value}${r.confidence ? ` · ${labels.confidence(r.confidence)}` : ''}`, labelWidth + r.barWidth + 6, r.y)
  }
  return { dataUrl: canvas.toDataURL('image/png'), width, height }
}
