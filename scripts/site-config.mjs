#!/usr/bin/env node
// The public phone number lives in ONE place: site.config.json. The site is prebuilt static HTML, so this script writes that value into
// every page (footer, contact, page text, JSON-LD telephone, the header "Call us" link), llms.txt and chat.js (the chat's Call option).
//   node scripts/site-config.mjs          rewrite the files from site.config.json
//   node scripts/site-config.mjs --check  fail if any file disagrees with site.config.json (CI, via scripts/check-assets.sh)
// Shapes it owns: tel:+1NNNNNNNNNN, (NNN) NNN-NNNN, "+1-NNN-NNN-NNNN" (JSON-LD), the chat's  var PHONE = '...'  line, and the header
// "Call us" link (data-track="call-us"), which dials the number.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CHECK = process.argv.includes('--check')
const { phone } = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'))
const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(phone.e164)
if (!m || phone.display !== `(${m[1]}) ${m[2]}-${m[3]}`) { console.error('site.config.json: phone.e164 must be +1 and 10 digits, and display must be "(NNN) NNN-NNNN" of the same number'); process.exit(1) }
const ld = `+1-${m[1]}-${m[2]}-${m[3]}`
const SKIP = new Set(['.git', 'node_modules', 'docs', 'catalog', 'brand-kit-a5649501d5a1feec', 'design'])
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) && dir === ROOT) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out); else if (e.name.endsWith('.html')) out.push(p)
  }
  return out
}
const files = [...walk(ROOT), path.join(ROOT, 'llms.txt'), path.join(ROOT, 'chat.js')]
const rules = [
  [/tel:\+1\d{10}/g, 'tel:' + phone.e164],
  [/\(\d{3}\) \d{3}-\d{4}/g, phone.display],
  [/"\+1-\d{3}-\d{3}-\d{4}"/g, `"${ld}"`],
  [/var PHONE = '[^']*'/g, `var PHONE = '${phone.e164}'`],
  [/<a href="[^"]*" data-track="call-us">Call us<\/a>/g, `<a href="tel:${phone.e164}" data-track="call-us">Call us</a>`],
]
const bad = []; let changed = 0
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8'); let t = s
  for (const [re, v] of rules) t = t.replace(re, v)
  if (t === s) continue
  if (CHECK) bad.push(path.relative(ROOT, f)); else { fs.writeFileSync(f, t); changed++ }
}
if (!/var PHONE = '/.test(fs.readFileSync(path.join(ROOT, 'chat.js'), 'utf8'))) bad.push("chat.js: no  var PHONE = '...'  line")
if (bad.length) { console.error((CHECK ? 'site-config: these files disagree with site.config.json (run node scripts/site-config.mjs):\n- ' : 'site-config: ') + bad.join('\n- ')); process.exit(1) }
console.log(CHECK ? `site-config: OK (${files.length} files, phone ${phone.display})` : `site-config: ${changed} file(s) rewritten (phone ${phone.display})`)
