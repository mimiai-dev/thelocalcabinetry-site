#!/usr/bin/env node
// Link policy (owner 2026-11-06): internal links (relative, or thelocalcabinetry.com) open in the same tab; external http(s) links open in a new tab
// with rel="noopener noreferrer" (never nofollow: cited sources are real endorsements). mailto:, tel:, sms: and #anchors are left alone.
//   node scripts/link-attrs.mjs          rewrite every served .html file in place
//   node scripts/link-attrs.mjs --check  list files that break the policy (exit 1); run by scripts/check-assets.sh
// The news generator (scripts/news/build.mjs) runs fixLinks() over every page it writes, so a new post comes out right with no hand edit.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OWN = /(^|\.)thelocalcabinetry\.com$/i   // the site and its subdomains (design., local-ops. ...) count as ours
const attr = (s, n) => { const m = new RegExp('\\s' + n + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i').exec(s); return m ? { all: m[0], v: m[2] ?? m[3] } : null }

export function kindOf(href) {
  const h = String(href ?? '').trim()
  if (!h || h.startsWith('#') || /^(mailto|tel|sms|javascript|data|blob):/i.test(h)) return 'other'
  if (/^https?:\/\//i.test(h) || h.startsWith('//')) {
    try { return OWN.test(new URL(h.startsWith('//') ? 'https:' + h : h).hostname) ? 'internal' : 'external' } catch { return 'other' }
  }
  return /^[a-z][a-z0-9+.-]*:/i.test(h) ? 'other' : 'internal'
}

function fixTag(attrs) {
  const href = attr(attrs, 'href'); if (!href) return attrs
  const kind = kindOf(href.v.replace(/&amp;/g, '&')); if (kind === 'other') return attrs
  const tgt = attr(attrs, 'target'), rel = attr(attrs, 'rel')
  let rest = attrs
  if (kind === 'internal') {
    if (tgt && /^_blank$/i.test(tgt.v)) rest = rest.replace(tgt.all, '')
    return rest
  }
  const have = new Set((rel ? rel.v.toLowerCase().split(/\s+/) : []))
  if (tgt && /^_blank$/i.test(tgt.v) && have.has('noopener') && have.has('noreferrer') && !have.has('nofollow')) return attrs   // already right: leave the markup as it is
  const keep = (rel ? rel.v.split(/\s+/) : []).filter((t) => t && !/^(nofollow|noopener|noreferrer)$/i.test(t))
  if (tgt) rest = rest.replace(tgt.all, ''); if (rel) rest = rest.replace(rel.all, '')
  const tail = /\s*\/$/.exec(rest)?.[0] ?? ''; if (tail) rest = rest.slice(0, -tail.length)
  return rest + ' target="_blank" rel="' + [...keep, 'noopener', 'noreferrer'].join(' ') + '"' + tail
}

// skips <script>, <style> and comments (their text may contain "<a ...>" that is not a link)
export function fixLinks(html) {
  return html.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>|<!--[\s\S]*?-->|<a(\s[^>]*)>/gi, (m, _t, attrs) => attrs === undefined ? m : '<a' + fixTag(attrs) + '>')
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export function htmlFiles(dir = ROOT) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules' || e.name === 'bk') continue
    const f = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...htmlFiles(f)); else if (e.name.endsWith('.html')) out.push(f)
  }
  return out
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const check = process.argv.includes('--check'); let bad = 0
  for (const f of htmlFiles()) {
    const s = fs.readFileSync(f, 'utf8'), t = fixLinks(s)
    if (s === t) continue
    bad++
    if (check) console.error('link policy: ' + path.relative(ROOT, f))
    else fs.writeFileSync(f, t)
  }
  console.log(check ? (bad ? `link-attrs: ${bad} file(s) break the link policy (run node scripts/link-attrs.mjs)` : 'link-attrs: OK') : `link-attrs: rewrote ${bad} file(s)`)
  process.exit(check && bad ? 1 : 0)
}
