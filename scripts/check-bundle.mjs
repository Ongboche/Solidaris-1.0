// Brief §9.14: initial JS under 250 KB gzipped. Measures the entry chunk(s) that
// index.html loads directly; lazy route chunks are excluded.
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'

const LIMIT_KB = 250
const html = readFileSync('dist/index.html', 'utf8')
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g), ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+\.js)"/g)]
  .map((m) => m[1].replace(/^.*\/assets\//, 'assets/'))

let total = 0
for (const file of new Set(scripts)) {
  const kb = gzipSync(readFileSync(join('dist', file))).length / 1024
  total += kb
  console.log(`${file}: ${kb.toFixed(1)} KB gzipped`)
}
console.log(`Initial JS: ${total.toFixed(1)} KB gzipped (limit ${LIMIT_KB} KB)`)
if (total > LIMIT_KB) {
  console.error('Initial bundle exceeds the performance budget (brief §9.14).')
  process.exit(1)
}
