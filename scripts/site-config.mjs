#!/usr/bin/env node
// The public phone number lives in ONE place: site.config.json, as parts. The site is prebuilt static HTML and, since owner 2026-10-23, no page, JSON-LD,
// llms.txt or script carries the number as a plain digit string or a tel: link: bots that read the source find none. People get "Call us", and
// /call.js (every page) and chat.js (the chat's "Talk to a person" > Call) put the number together in the browser from parts; the tel: href is
// built only on click. This script writes those parts into call.js and chat.js and checks that nothing else carries the number.
//   node scripts/site-config.mjs          rewrite call.js and the parts line in chat.js from site.config.json
//   node scripts/site-config.mjs --check  fail if they disagree, or if any served file carries the number or a tel: link (scripts/check-assets.sh)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CHECK = process.argv.includes('--check')
const { phone } = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'))
if (!/^\d$/.test(phone.country) || !/^\d{3}$/.test(phone.area) || !/^\d{3}$/.test(phone.exchange) || !/^\d{4}$/.test(phone.line)) { console.error('site.config.json: phone needs country (1 digit), area (3), exchange (3), line (4)'); process.exit(1) }
// split further so the source holds no run of more than two digits in a row
const parts = [phone.country, phone.area.slice(0, 2), phone.area.slice(2), phone.exchange.slice(0, 2), phone.exchange.slice(2), phone.line.slice(0, 2), phone.line.slice(2)]
const arr = `[${parts.map((p) => `'${p}'`).join(', ')}]`
const PARTS_RE = /var P = \[[^\]]*\]/
const partsLine = `var P = ${arr}`
const bad = []
for (const f of ['call.js', 'chat.js']) {
  const p = path.join(ROOT, f), s = fs.readFileSync(p, 'utf8')
  if (!PARTS_RE.test(s)) { bad.push(`${f}: no  var P = [...]  line`); continue }
  const t = s.replace(PARTS_RE, partsLine)
  if (t !== s) { if (CHECK) bad.push(`${f}: parts differ from site.config.json (run node scripts/site-config.mjs)`); else fs.writeFileSync(p, t) }
}
// nothing served may carry the number or a tel: link
const digits = phone.country + phone.area + phone.exchange + phone.line
const leaks = [new RegExp(digits), new RegExp(`${phone.exchange}[-. ]${phone.line}`), new RegExp(`\\(${phone.area}\\)`), /href="tel:/i, /"telephone"/]
const SKIP = new Set(['.git', 'node_modules', 'docs', 'catalog', 'brand-kit-a5649501d5a1feec', 'scripts', '.github'])
;(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (!(SKIP.has(e.name) && dir === ROOT)) walk(p) }
    else if (/\.(html|txt|js|json|xml|webmanifest)$/.test(e.name) && e.name !== 'site.config.json') {
      const s = fs.readFileSync(p, 'utf8')
      for (const re of leaks) if (re.test(s)) { bad.push(`${path.relative(ROOT, p)}: carries the phone number (${re})`); break }
    }
  }
})(ROOT)
if (bad.length) { console.error('site-config:\n- ' + bad.join('\n- ')); process.exit(1) }
console.log(CHECK ? 'site-config: OK (no number in served files; call.js and chat.js match site.config.json)' : 'site-config: call.js and chat.js written')
