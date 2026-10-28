#!/usr/bin/env node
// The site carries NO phone number (owner 2026-10-27: removed completely: no number, no "Call us", no tel: link; owner 2026-10-28: ANY phone number, on any
// page or script: text, footer, JSON-LD telephone, meta tags, image alt, tel: / sms: links, wa.me links with digits). The WhatsApp button points at
// /design/api/wa on our server (ops repo lib/design-site/site.ts), which redirects to wa.me: the number is never in a served file.
// This guard fails if any served file carries:
//   - a written phone number: (ddd) ddd-dddd, ddd-ddd-dddd, ddd.ddd.dddd, +1 ddd ddd dddd, +cc and 9-14 digits (separators or a +; bare digit runs are not judged by
//     shape, because minified JS and CSS are full of them: z-index 2147483000, bitmasks 1073741824);
//   - a tel: / callto: / sms: link, a wa.me / api.whatsapp.com link with digits, a JSON-LD "telephone", a data-wa / data-phone attribute with digits, a phone meta tag;
//   - one of our known numbers in ANY form (bare digits, split into parts): kept here only as SHA-256 hashes of their digits (country code first), so this
//     file (served too) never carries a number itself;
//   - a data-call button or a phone parts line (the 2026-10-23 scheme).
// The ops repo's live check (scripts/dev/office-health.mjs public-phones, lib/public-phone-scan.ts) uses the same rules on the live pages.
//   node scripts/site-config.mjs --check   (scripts/check-assets.sh)
//   node scripts/site-config.mjs --self-test   (the rules against built-up samples; no sample number is written in this file)
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const KNOWN = new Set([
  '3634150fe787e6a6c0ad67d56a9f41221e818223ddbbe43c258f2e6c576d9dce',   // David (removed 2026-10-27, site PR #108)
  '24a6d45a104e0b25effa0d4891d6886eb29d962a90b5cdd614946ad48c0a5769',   // the owner's WhatsApp (chat.js until 2026-10-28)
  'a8ccb93d7e72011c56166ddba288c2d02254a3e96545226b9565dffc0bc7c446',   // the seller letterhead on the /view sheets (ops repo, apex copy)
])
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')
const TEXT = /\.(html|js|mjs|json|txt|xml|md|css|svg|webmanifest)$/i
const RULES = [
  ['a written phone number', /(?<![\w.\-/#])(?:\+?1[\s.\-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.\-])\d{3}[\s.\-]\d{4}(?![\w\-])/g],
  ['an international number', /(?<![\w+])\+\d(?:[\s.\-()]?\d){9,14}(?![\w])/g],
  ['a tel: / sms: link', /\b(?:tel|callto|sms):\s*\+?\d/gi],
  ['a tel: / sms: href', /href\s*=\s*["']?\s*(?:tel|callto|sms):/gi],
  ['a WhatsApp link with a number', /\bwa\.me\/\+?\d|api\.whatsapp\.com\/send\/?\?[^"'\s<>]*phone=\+?\d|whatsapp:\/\/send\?[^"'\s<>]*phone=\+?\d/gi],
  ['a JSON-LD telephone', /["']telephone["']\s*:\s*["'][^"']+["']/gi],
  ['a data-wa / data-phone number', /\bdata-(?:wa|whatsapp|phone|tel)\s*=\s*["']\+?\d/gi],
  ['a phone meta tag', /<meta[^>]+(?:name|property)\s*=\s*["'][^"']*(?:phone|telephone)[^"']*["'][^>]*content\s*=\s*["'][^"']*\d/gi],
  ['a data-call button', /<a[^>]*\sdata-call[\s>=]/gi],
  ['a phone parts line', /var P = \[\s*'\d/g],
]
/** every problem in one served text: [what, the match] */
export function phoneProblems(s) {
  const out = []
  for (const [what, re] of RULES) for (const m of s.matchAll(re)) out.push([what, m[0].slice(0, 60)])
  // a known number in any form: digit runs, also with separators / quotes / brackets between the parts
  for (const m of s.matchAll(/\d[\d\s().'",+\-\[\]]{5,40}\d|\d{7,15}/g)) {
    const d = m[0].replace(/\D/g, '')
    for (let i = 0; i < d.length; i++) for (const len of [10, 11, 12]) {
      const n = d.slice(i, i + len)
      if (n.length === len && (KNOWN.has(sha(n)) || KNOWN.has(sha('1' + n)))) { out.push(['a known phone number', m[0].slice(0, 60)]); i = d.length; break }
    }
  }
  return out
}
function walk(dir, bad) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.git') || e.name === 'node_modules') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { walk(p, bad); continue }
    if (!TEXT.test(e.name)) continue
    const rel = path.relative(ROOT, p)
    for (const [what, m] of phoneProblems(fs.readFileSync(p, 'utf8'))) bad.push(`${rel}: ${what} (${m})`)
  }
}
function selfTest() {
  // samples are built at run time (this file is served: it must not carry a number); 555-01xx is the fictional range
  const n = (a, b, c) => [a, b, c].join('-')
  const hit = [`call ${n('713', '555', '0123')}`, `(713) 555${'-'}0123`, `+${'1'} ${'713'} 555 ${'0123'}`, `+${'84'} 976 ${'000'} 632`, `href="${'tel'}:+1713555${'0123'}"`, `https://${'wa.me'}/1713555${'0123'}`,
    `{"${'telephone'}":"x"}`, `data-${'wa'}="1713"`]
  const miss = ['.x{z-index:2147483000}', 'case 1073741824:', 'tel:!0,text:!0', 'mailto:/tel: only the scheme', 'data-wa=""', 'wa.me/${r}?text=', '2026-10-28T12:00:00Z', 'M3 21l1.6-5A8.5 8.5 0 1 1 8 19.4z']
  const bad = [...hit.filter((s) => !phoneProblems(s).length).map((s) => `missed: ${s}`), ...miss.filter((s) => phoneProblems(s).length).map((s) => `false hit: ${s}`)]
  if (bad.length) { console.error('site-config self-test:\n- ' + bad.join('\n- ')); process.exit(1) }
  console.log(`site-config self-test: OK (${hit.length} hits, ${miss.length} clean)`)
}
if (process.argv.includes('--self-test')) selfTest()
else {
  const bad = []
  walk(ROOT, bad)
  if (bad.length) { console.error('site-config:\n- ' + [...new Set(bad)].join('\n- ')); process.exit(1) }
  console.log('site-config: OK (no phone number, tel: / wa.me link or call button in served files)')
}
