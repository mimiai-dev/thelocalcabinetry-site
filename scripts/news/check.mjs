#!/usr/bin/env node
// CI gate for the news: node scripts/news/check.mjs   (also: npm run news:check)
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { parseFrontMatter, markdown, CATEGORIES, slugify, stripTags, wordCount } from './lib.mjs'
import { gatePost } from './gate.mjs'
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')
const dir = path.join(ROOT, 'content/news'); const errs = []
const fail = (f, m) => errs.push(`${f}: ${m}`)
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort() : []
const slugs = new Set()
const BANNED = [/member(ship)? pric/i, /trade pric/i, /distributor pric/i, /designer pric/i, /dergano/i, /cotowins/i, /\bANSI\b/, /muse\b/i]
for (const f of files) {
  let fm, body
  try { ({ fm, body } = parseFrontMatter(fs.readFileSync(path.join(dir, f), 'utf8'))) } catch (e) { fail(f, e.message); continue }
  const m = /^(\d{4}-\d{2}-\d{2})-(.+)\.md$/.exec(f); if (!m) { fail(f, 'file name must be <yyyy-mm-dd>-<slug>.md'); continue }
  const slug = fm.slug || m[2]; if (slugs.has(slug)) fail(f, 'duplicate slug'); slugs.add(slug)
  for (const b of BANNED) if (b.test(body) || b.test(JSON.stringify(fm))) fail(f, `banned wording (${b})`)
  if (/\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b|\btel:/i.test(body)) fail(f, 'a phone number (owner 2026-10-28: no phone numbers anywhere)')
  if (!CATEGORIES.some((c) => c.slug === fm.category)) fail(f, 'category must be one of ' + CATEGORIES.map((c) => c.slug).join(', '))
  if (fm.draft !== false) continue                       // drafts only need to parse and to stay clean
  // everything below applies to PUBLISHED posts only
  if (!fm.title || fm.title.length > 70) fail(f, 'title is required, 70 characters at most')
  if (!fm.description || fm.description.length < 70 || fm.description.length > 170) fail(f, 'description must be 70 to 170 characters')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fm.date || m[1]))) fail(f, 'date must be yyyy-mm-dd')
  if (!fm.keyword) fail(f, 'keyword is required'); if (!fm.intent) fail(f, 'intent is required')
  if (!fm.hero || !fm.hero_alt) fail(f, 'hero and hero_alt are required')
  else if (!fs.existsSync(path.join(ROOT, fm.hero.replace(/^\//, '')))) fail(f, 'hero file not found: ' + fm.hero)
  if (!fm.hero_w || !fm.hero_h) fail(f, 'hero_w and hero_h are required')
  if (fm.facts_verified !== true) fail(f, 'facts_verified must be true')
  // the automated pipeline (owner 2026-10-28) publishes with reviewed_by: gate, and only a post marked generated_by: pipeline may say so;
  // such a post must pass the publish gate (scripts/news/gate.mjs, offline rules here; the pipeline also ran the online rules before the PR)
  const auto = fm.generated_by === 'pipeline'
  if (!(auto ? fm.reviewed_by === 'gate' : ['owner', 'lead'].includes(fm.reviewed_by))) fail(f, auto ? 'a pipeline post is reviewed_by: gate' : 'reviewed_by must be owner or lead')
  if (auto) for (const e of gatePost(fm, body, { root: ROOT, file: f }).errors) fail(f, 'gate: ' + e)
  let html, headings; try { ({ html, headings } = markdown(body)) } catch (e) { fail(f, e.message); continue }
  if (headings.filter((h) => h.lvl === 2).length < 2) fail(f, 'at least 2 h2 headings')
  if (wordCount(body.replace(/<!--[\s\S]*?-->/g, '')) < 350) fail(f, 'at least 350 words')
  if ((body.match(/\]\((\/[^)\s]*)\)/g) || []).length < 2) fail(f, 'at least 2 internal links in the text')
  for (const l of body.matchAll(/\]\((\/[^)\s#]*)/g)) { const p = l[1].replace(/\/$/, ''); const ok = ['', '/design', '/points', '/member', '/policies', '/contact'].includes(p) || fs.existsSync(path.join(ROOT, p.slice(1))) || fs.existsSync(path.join(ROOT, p.slice(1), 'index.html')); if (!ok) fail(f, 'internal link target not found: ' + l[1]) }
  if (/<!--[\s\S]*CHECKLIST/.test(body)) fail(f, 'delete the CHECKLIST comment when it is done')
  if (/\$\s?\d/.test(stripTags(html)) && fm.prices_verified !== true) fail(f, 'a price appears but prices_verified is not true (prices only from our saved price list)')
}
// generated output must match the content, and drafts must not leak anywhere
try { execFileSync('node', [path.join(ROOT, 'scripts/news/build.mjs'), '--check'], { stdio: 'pipe' }) } catch (e) { errs.push('build --check failed:\n' + String(e.stderr || e.stdout || e.message).trim()) }
for (const f of files) {
  const { fm } = parseFrontMatter(fs.readFileSync(path.join(dir, f), 'utf8')); if (fm.draft === false) continue
  const slug = fm.slug || /^\d{4}-\d{2}-\d{2}-(.+)\.md$/.exec(f)[1]
  for (const p of ['news/' + slug, 'news/rss.xml', 'news/atom.xml', 'sitemap-news.xml', 'news/index.html', 'llms.txt', 'index.html']) {
    const t = path.join(ROOT, p); if (!fs.existsSync(t)) continue
    if (fs.statSync(t).isDirectory()) { fail(f, 'draft is published as ' + p + '/'); continue }
    if (fs.readFileSync(t, 'utf8').includes('/news/' + slug + '/')) fail(f, 'draft appears in ' + p)
  }
}
if (errs.length) { console.error('news check FAILED:\n- ' + errs.join('\n- ')); process.exit(1) }
console.log(`news check OK: ${files.length} post file(s)`)
