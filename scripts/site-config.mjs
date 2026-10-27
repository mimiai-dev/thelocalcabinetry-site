#!/usr/bin/env node
// The site carries NO phone number (owner 2026-10-27: removed completely: no number, no "Call us", no tel: link; before that, 2026-10-23, it was put
// together in the browser from parts). This guard fails if any served file carries a removed number, a tel: link, a data-call button or a parts line.
// The removed numbers are kept here only as SHA-256 hashes of their digits (country code first): every digit run in a served file is hashed and compared,
// so this file (served too) never carries the number itself.
//   node scripts/site-config.mjs --check   (scripts/check-assets.sh)
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REMOVED = new Set(['3634150fe787e6a6c0ad67d56a9f41221e818223ddbbe43c258f2e6c576d9dce'])
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')
const TEXT = /\.(html|js|mjs|json|txt|xml|md|css|svg|webmanifest)$/i
const bad = []
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { walk(p); continue }
    if (!TEXT.test(e.name)) continue
    const rel = path.relative(ROOT, p), s = fs.readFileSync(p, 'utf8')
    if (/href\s*=\s*["']tel:/i.test(s)) bad.push(`${rel}: a tel: link`)
    if (/<a[^>]*\sdata-call[\s>=]/i.test(s)) bad.push(`${rel}: a data-call button`)
    if (/var P = \[\s*'\d/.test(s)) bad.push(`${rel}: a phone parts line`)
    // digit runs with phone separators between them (spaces, dots, dashes, brackets, quotes and commas of a parts array)
    for (const m of s.matchAll(/\d[\d\s().'",+\-\[\]]{8,40}\d/g)) {
      const d = m[0].replace(/\D/g, '')
      for (const n of [d, '1' + d]) if (n.length >= 10 && n.length <= 12 && REMOVED.has(sha(n))) bad.push(`${rel}: a removed phone number`)
    }
  }
}
walk(ROOT)
if (bad.length) { console.error('site-config:\n- ' + [...new Set(bad)].join('\n- ')); process.exit(1) }
console.log('site-config: OK (no phone number, tel: link or call button in served files)')
