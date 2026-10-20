#!/usr/bin/env node
// Brand guard (lead decision D8, 2026-10-21):  node scripts/check-brand.mjs   (CI, via scripts/check-assets.sh)
// 1. no "luxova" (any case) in any file the site serves: pages, scripts, styles, feeds, llms.txt, SVGs ... (repo tooling and docs are not served
//    pages and are skipped). Five legacy files that no page loads are listed in LEGACY: they must stay unreferenced (a page that loads one fails);
//    hashed _astro files cannot be edited or removed (scripts/check-assets.sh rule 2), so they are frozen, not fixed.
// 2. every logo file (an image whose name has "logo") and every JSON-LD "logo" URL is a brand-kit file listed in brand-logos.json with its sha256
//    (apple-touch-icon.png, the TLC icon some pages give as their logo, is the one exception).
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SKIP = new Set(['.git', 'node_modules', 'docs', 'deploy', 'scripts', 'content', 'logo-src', '.github'])
const SKIP_PATH = new Set(['catalog/src'])
const TEXT = /\.(html|js|mjs|css|txt|xml|json|svg|webmanifest|md)$/i
const IMG = /\.(png|jpe?g|webp|svg|gif|avif|ico)$/i
const LEGACY = ['luxova-contact.js', 'luxova-sale.js', '_astro/hoisted.BBOHhZRX.js', '_astro/hoisted.ahBy0JFN.js', '_astro/hoisted.D8bmu9UX.js']   // the last: the old product-gallery script that imports ahBy0JFN; no page loads it since #75
const files = []
;(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name), rel = path.relative(ROOT, p).split(path.sep).join('/')
    if (e.isDirectory()) { if (!(dir === ROOT && SKIP.has(e.name)) && !SKIP_PATH.has(rel)) walk(p) } else files.push(rel)
  }
})(ROOT)
const bad = []
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex')
const texts = files.filter((f) => TEXT.test(f) && f !== 'brand-logos.json')
for (const f of texts) {
  if (LEGACY.includes(f)) continue
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8')
  if (/luxova/i.test(s)) bad.push(`${f}: says "luxova"`)
  for (const l of LEGACY) if (s.includes(l.replace(/^_astro\//, '')) || s.includes('/' + l)) bad.push(`${f}: loads the legacy file ${l}`)
}
for (const f of files) if (/luxova/i.test(f) && !LEGACY.includes(f)) bad.push(`${f}: "luxova" in a file name`)
const kit = JSON.parse(fs.readFileSync(path.join(ROOT, 'brand-logos.json'), 'utf8')).files
for (const f of files.filter((x) => IMG.test(x) && /logo/i.test(path.basename(x)))) {
  if (!kit[f]) bad.push(`${f}: logo file not from the brand kit (add it to brand-logos.json only if it is made from the kit)`)
  else if (kit[f].sha256 !== sha(f)) bad.push(`${f}: changed since brand-logos.json (sha256)`)
}
for (const f of texts.filter((x) => x.endsWith('.html'))) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8')
  for (const m of s.matchAll(/"logo":\{"@type":"ImageObject","url":"https:\/\/thelocalcabinetry\.com\/([^"]+)"/g)) {
    if (m[1] !== 'apple-touch-icon.png' && !kit[m[1]]) bad.push(`${f}: JSON-LD logo ${m[1]} is not a brand-kit file`)
  }
}
if (bad.length) { console.error('check-brand FAILED:\n- ' + [...new Set(bad)].join('\n- ')); process.exit(1) }
console.log(`check-brand: OK (${texts.length} served text files, ${Object.keys(kit).length} kit logo files)`)
