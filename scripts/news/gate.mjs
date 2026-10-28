#!/usr/bin/env node
// The publish gate for news posts written by the automated pipeline (owner 2026-10-28: 3 posts a week, published only if this passes).
// One gate, two modes:
//   offline (CI, check.mjs):  node scripts/news/gate.mjs content/news/<file>.md            wording, claims, phone, prices, length, reading level,
//                                                                                          keyword, internal links, images, a Sources section
//   online (the pipeline):    node scripts/news/gate.mjs content/news/<file>.md --online   + every external link answers, + no run of OVERLAP_WORDS
//                                                                                          words copied from any source page (copyright)
// --json prints { ok, errors, warnings, stats }. Exit 1 when there is any error.
// check.mjs runs the offline gate on every published post with generated_by: pipeline. A human-written post is not held to it (its rules are in check.mjs).
import fs from 'node:fs'
import path from 'node:path'
import { parseFrontMatter, markdown, stripTags, SITE } from './lib.mjs'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')

/** AI-tell phrasing: a post that reads like a template is refused. Kept as regexes so plural / tense variants match. */
export const AI_TELLS = [
  /\bdelv(e|es|ed|ing)\b/i, /in today'?s (fast-paced|modern|busy|ever-changing) world/i, /\belevate (your|the) (space|home|kitchen|bathroom|closet|style|design)/i,
  /\bgame[- ]changer/i, /\bseamless(ly)?\b/i, /\bunlock (the|your)\b/i, /\bembark\b/i, /\btapestry\b/i, /\btestament to\b/i, /\bnavigat(e|ing) the (world|complex|maze|landscape)/i,
  /\bin the (world|realm) of\b/i, /\brealm\b/i, /\blook no further\b/i, /\bit'?s (important|worth|crucial) (to note|noting|to remember)\b/i, /\bit is (important|worth|crucial) (to note|noting)\b/i,
  /\bin conclusion\b/i, /\bin summary\b/i, /\b(let'?s )?dive (in|into|deeper)\b/i, /\bdeep dive\b/i, /\btransform your (space|home|kitchen|bathroom|closet)/i, /\bperfect blend\b/i,
  /\bmust-have\b/i, /\bto the next level\b/i, /\bnestled\b/i, /\bboasts?\b/i, /\bbustling\b/i, /\bever-evolving\b/i, /\bmeticulous(ly)?\b/i, /\bholistic\b/i, /\bplethora\b/i,
  /\bmyriad\b/i, /\bcutting-edge\b/i, /\brevolutioni[sz]e/i, /\bharness(ing)? the\b/i, /\bsynergy\b/i, /\beffortless(ly)?\b/i, /\btimeless elegance\b/i, /\bbreathtaking\b/i,
  /\bin this (article|post|guide),? we('| wi)ll\b/i, /\bbuckle up\b/i, /\bpicture this\b/i, /\bwhether you'?re an? .{1,40} or an?\b/i, /\bwhen it comes to\b/i,
  /\b(a|the) world of possibilities\b/i, /\bcrucial role\b/i, /\bkey takeaways?\b/i, /\bunleash/i, /\bstreamline(d)? (your|the) /i, /\bdream (kitchen|closet|bathroom) (awaits|come true)/i,
  /\bwe hope this (guide|article|post) (helps|helped)\b/i, /\bhappy (designing|renovating|organizing)\b/i, /\bas an ai\b/i, /\blanguage model\b/i,
]
/** Claims we cannot back (owner 2026-10-28): no origin claims, no green / eco claims, no certification other than the three the site states. */
export const UNBACKED = [
  [/\bmade in (the )?(usa|u\.s\.a?\.?|united states|america)\b/i, 'origin claim ("made in ...")'], [/\bamerican[- ]made\b/i, 'origin claim'],
  [/\beco[- ]?friendly\b/i, 'eco claim'], [/\bgreen[- ]certified\b/i, 'green certification claim'], [/\bNGBS\b/, 'NGBS (not stated for automated posts)'],
  [/\bGREENGUARD\b/i, 'certification we do not state'], [/\bFSC\b/, 'certification we do not state'], [/\bLEED\b/, 'certification we do not state'],
  [/\bformaldehyde[- ]free\b/i, 'formaldehyde-free claim'], [/\bnon-?toxic\b/i, 'non-toxic claim'], [/\b(zero|no)[- ]VOC\b/i, 'VOC claim'], [/\bsustainabl[ey]\b/i, 'sustainability claim'],
  [/\blifetime warranty\b/i, 'warranty claim (quote /policies#warranty instead)'], [/\bwarrant(y|ies)\b/i, 'warranty wording (only the owner-approved sentence, not in automated posts)'],
  [/\b(best|lowest|cheapest) (price|prices|deal|quality)\b/i, 'superlative we cannot prove'], [/\b(#1|number one|no\. ?1)\b/i, 'superlative we cannot prove'],
  [/\bguarantee(d|s)?\b/i, 'guarantee'], [/\bfree (shipping|delivery|installation)\b/i, 'offer we do not state'], [/\bwe (install|assemble)\b/i, 'we do not install or assemble'],
  [/\b(member(ship)?|trade|distributor|designer) (pric|discount)/i, 'pricing terms (not in automated posts)'], [/\bdergano\b|\bcotowins\b|\bluxova\b|\bmuse\b/i, 'name that must not appear'],
]
export const ALLOWED_CERTS = ['KCMA', 'CARB2', 'CARB Phase 2', 'TSCA Title VI']
export const IMAGE_DIRS = ['accessories', 'closets', 'rooms', 'kitchens', 'vanities', 'installs', 'doors']
/** Internal pages that count as "product / category" links (at least one besides /design). */
export const PRODUCT_PATHS = [/^\/c\/[a-z0-9-]+\/?$/, /^\/(kitchens|closets|vanities|doors|door-styles|interior-doors|accessories|cost-guide|finish-sheets|catalog)\/?$/, /^\/how-to-measure-your-(kitchen|closet|bathroom)\/?$/, /^\/p\/[a-z0-9_-]+\/?$/]
export const LIMITS = { minWords: 700, maxWords: 1600, maxGrade: 9.5, maxEmDashes: 2, minSources: 2, minSourceDomains: 2, maxTitle: 65, overlapWords: 10 }

/** Sources: at least one from an authority; never social media, forums, user blogs or shops that sell cabinets (competitors). Hostnames without www. */
export const AUTHORITY = [/\.gov$/, /\.edu$/, /(^|\.)(nkba|kcma|nahb|ashrae|iccsafe|ada|access-board|nfpa|aia|awinet|hpva|carb\.ca|epa|energystar|consumerreports)\.(org|gov|com)$/,
  /(^|\.)(sherwin-williams|benjaminmoore|valspar|behr|ppgpaints|farrow-ball|blum|hettich|grass|salice|hafele|kohler|moen|ge|geappliances|whirlpool|bosch-home|subzero-wolf)\.com$/,
  /(^|\.)(thisoldhouse|bobvila|familyhandyman|finehomebuilding|jlconline|houzz|bhg|marthastewart|thespruce|architecturaldigest|nytimes|washingtonpost|wsj)\.com$/]
export const isAuthority = (host) => AUTHORITY.some((re) => re.test(host))
export const BAD_SOURCES = [/(^|\.)(pinterest|reddit|quora|medium|facebook|instagram|tiktok|youtube|x|twitter|linkedin)\.com$/, /\.(blogspot|wordpress|substack|tumblr|wixsite)\.com$/,
  /(^|\.)(amazon|wayfair|homedepot|lowes|ikea|cabinets|rtacabinetstore|thertastore|cabinetsdirectrta|lilyannCabinets|kitchencabinetkings|cabinetjoint|barkerdoor|conestogawood|taylorcraftcabinetdoor)\.com$/i]

const PHONE = /(\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b|\btel:|\b(call|text) us\b/i

// ---------- reading level
export function syllables(word) {
  let w = word.toLowerCase().replace(/[^a-z]/g, ''); if (!w) return 0; if (w.length <= 3) return 1
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '')
  const m = w.match(/[aeiouy]{1,2}/g); return Math.max(1, m ? m.length : 1)
}
/** Flesch-Kincaid grade of plain text (US school grade). Lists count as sentences, numbers as one syllable. */
export function readingGrade(text) {
  const sentences = text.split(/[.!?]+(?:\s|$)|\n+/).map((s) => s.trim()).filter((s) => /[a-z]/i.test(s))
  const words = text.split(/\s+/).map((w) => w.replace(/^[^\w]+|[^\w]+$/g, '')).filter((w) => /[a-z0-9]/i.test(w))
  if (!sentences.length || !words.length) return 0
  const syl = words.reduce((n, w) => n + (/^\d/.test(w) ? 1 : syllables(w)), 0)
  return +(0.39 * (words.length / sentences.length) + 11.8 * (syl / words.length) - 15.59).toFixed(1)
}

// ---------- body helpers
/** Split the body at "## Sources": the article and the sources list. */
export function splitSources(body) {
  const m = /^##\s+Sources\s*$/im.exec(body)
  if (!m) return { article: body, sources: null }
  return { article: body.slice(0, m.index), sources: body.slice(m.index + m[0].length) }
}
const proseOf = (md) => md.replace(/<!--[\s\S]*?-->/g, '').replace(/!\[[^\]]*\]\([^)]*\)(\s*\{\d+x\d+\})?/g, ' ').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/^#{2,3}\s+/gm, '').replace(/^\s*([-*]|\d+[.)])\s+/gm, '').replace(/[*_`>]/g, '')
export const countWords = (md) => proseOf(md).split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length
const linksOf = (md) => [...md.matchAll(/(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((m) => ({ image: m[1] === '!', text: m[2], url: m[3] }))
const isExternal = (u) => /^https?:\/\//.test(u) && !u.startsWith(SITE)
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' } }

/** The offline gate. fm/body as parsed; root = the site repo. Returns { errors, warnings, stats }. */
export function gatePost(fm, body, { root = ROOT, file = '' } = {}) {
  const errors = [], warnings = []
  const err = (m) => errors.push(m)
  const { article, sources } = splitSources(body)
  const prose = proseOf(article)
  const meta = [fm.title, fm.description].filter(Boolean).join('\n')
  const all = prose + '\n' + meta

  // wording
  for (const re of AI_TELLS) { const m = re.exec(all); if (m) err(`AI-tell phrasing: "${m[0]}"`) }
  const dashes = (body.match(/—/g) || []).length + (body.match(/\s–\s/g) || []).length
  if (dashes > LIMITS.maxEmDashes) err(`${dashes} em dashes (at most ${LIMITS.maxEmDashes}); use a full stop or a comma`)
  // claims
  for (const [re, why] of UNBACKED) { const m = re.exec(all); if (m) err(`claim we cannot back: "${m[0]}" (${why})`) }
  for (const m of all.matchAll(/\b(certified|certification|certifications|certificate)\b/gi)) {
    const around = all.slice(Math.max(0, m.index - 80), m.index + 80)
    if (!ALLOWED_CERTS.some((c) => around.includes(c))) { err(`certification wording without KCMA / CARB2 / TSCA Title VI nearby: "...${around.replace(/\s+/g, ' ').trim()}..."`); break }
  }
  if (PHONE.test(body) || PHONE.test(meta)) err('a phone number or "call us" (owner 2026-10-28: no phone numbers anywhere)')
  if (/\$\s?\d|\b\d+(\.\d+)?\s?(usd|dollars)\b/i.test(all)) err('a price or dollar amount (automated posts carry no prices)')
  if (/(^|\n)\s*>/.test(article)) err('a block quote (automated posts quote nobody)')
  if (/"[^"\n]{60,}"|“[^”\n]{60,}”/.test(prose)) err('a long quotation (write it in our own words)')

  // length and reading level
  const words = countWords(article)
  if (words < LIMITS.minWords || words > LIMITS.maxWords) err(`${words} words (between ${LIMITS.minWords} and ${LIMITS.maxWords}, not counting the Sources)`)
  const grade = readingGrade(prose)
  if (grade > LIMITS.maxGrade) err(`reading level grade ${grade} (at most ${LIMITS.maxGrade}: shorter sentences, plainer words)`)

  // SEO basics
  if (!fm.title || fm.title.length > LIMITS.maxTitle) err(`title is required, at most ${LIMITS.maxTitle} characters`)
  const kw = String(fm.keyword || '').toLowerCase().trim()
  if (!kw) err('keyword is required')
  else {
    if (!(String(fm.title || '') + ' ' + String(fm.description || '')).toLowerCase().includes(kw)) err(`the keyword "${kw}" is not in the title or the description`)
    const first = proseOf(article.trim().split(/\n\s*\n/)[0] || '').toLowerCase()
    const kwWords = kw.split(/\s+/).filter((w) => w.length > 2)
    if (!kwWords.every((w) => first.includes(w.replace(/s$/, '')))) err(`the first paragraph does not answer for the keyword "${kw}" (its words are not all in it)`)
    if (!article.split('\n').some((l) => /^##\s/.test(l) && kwWords.some((w) => l.toLowerCase().includes(w.replace(/s$/, ''))))) warnings.push('no h2 heading uses a keyword word')
  }

  // links
  const links = linksOf(article)
  const internal = links.filter((l) => !l.image && l.url.startsWith('/')).map((l) => l.url.split('#')[0])
  if (!internal.some((u) => /^\/design\/?$/.test(u))) err('no link to /design in the text')
  if (!internal.some((u) => PRODUCT_PATHS.some((re) => re.test(u)))) err('no link to a product or category page (/c/..., /kitchens, /closets, /vanities, /doors, a measuring guide ...)')
  const sourceLinks = sources ? linksOf(sources).filter((l) => !l.image) : []
  const sourceUrls = new Set(sourceLinks.map((l) => l.url))
  for (const l of links) {
    if (l.image) continue
    if (/^(mailto:|tel:)/i.test(l.url)) err('a mailto: or tel: link')
    if (isExternal(l.url) && !sourceUrls.has(l.url)) err(`external link in the text that is not in the Sources: ${l.url}`)
  }
  // sources
  if (!sources) err('no "## Sources" section at the end')
  else {
    const ext = sourceLinks.filter((l) => isExternal(l.url))
    if (ext.length !== sourceLinks.length) err('the Sources list only external https links')
    if (ext.some((l) => !l.url.startsWith('https://'))) err('a source is not https')
    if (ext.length < LIMITS.minSources) err(`${ext.length} sources (at least ${LIMITS.minSources})`)
    if (new Set(ext.map((l) => hostOf(l.url))).size < LIMITS.minSourceDomains) err(`sources from fewer than ${LIMITS.minSourceDomains} different sites`)
    if (/^##\s/m.test(sources)) err('"## Sources" must be the last h2')
    for (const l of ext) if (BAD_SOURCES.some((re) => re.test(hostOf(l.url)))) err(`source not acceptable (social, forum, user blog or a shop that sells cabinets): ${l.url}`)
    if (!ext.some((l) => isAuthority(hostOf(l.url)))) err('no source from an authority (a .gov or .edu site, a standards or trade body, a paint or material maker, or an established building publication); see AUTHORITY in gate.mjs')
  }

  // images: our own, already in the repo
  const imgs = [fm.hero, ...linksOf(body).filter((l) => l.image).map((l) => l.url)].filter(Boolean)
  for (const src of imgs) {
    if (!src.startsWith('/')) { err(`image not from the site repo: ${src}`); continue }
    const rel = src.replace(/^\//, '')
    if (!IMAGE_DIRS.includes(rel.split('/')[0])) err(`image outside our photo folders (${IMAGE_DIRS.join(', ')}): ${src}`)
    else if (!fs.existsSync(path.join(root, rel))) err(`image file not found: ${src}`)
  }
  if (fm.hero && linksOf(body).some((l) => l.image && l.url === fm.hero)) err('the image in the text repeats the hero; use a different photo or none')
  if (/(^|[\s(])\/design\b(?![^\[]*\]\()/.test(prose.replace(/\[[^\]]*\]\([^)]*\)/g, ''))) err('"/design" written as bare text; make it a link')
  try { markdown(body) } catch (e) { err(e.message) }
  if (fm.generated_by === 'pipeline' && fm.reviewed_by !== 'gate') err('a pipeline post is reviewed_by: gate')
  return { errors, warnings, stats: { words, grade, dashes, sources: sourceLinks.length, file } }
}

// ---------- online checks (the pipeline, before it opens the PR)
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
async function fetchText(url, ms = 20000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms)
  try { const r = await fetch(url, { redirect: 'follow', signal: ctl.signal, headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,*/*' } }); return { status: r.status, text: r.ok ? await r.text() : '' } }
  catch (e) { return { status: 0, text: '', error: String(e.message || e) } } finally { clearTimeout(t) }
}
const norm = (s) => s.toLowerCase().replace(/&[a-z#0-9]+;/g, ' ').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
/** Runs of n words shared by a and b (a = our prose, b = a source page). */
export function sharedRuns(a, b, n = LIMITS.overlapWords) {
  const bw = norm(b); const grams = new Set(); for (let i = 0; i + n <= bw.length; i++) grams.add(bw.slice(i, i + n).join(' '))
  const aw = norm(a); const hits = []; for (let i = 0; i + n <= aw.length; i++) { const g = aw.slice(i, i + n).join(' '); if (grams.has(g)) { hits.push(g); i += n - 1 } }
  return hits
}
export async function gateOnline(fm, body, { root = ROOT, fetcher = fetchText } = {}) {
  const errors = [], warnings = []
  const { article } = splitSources(body)
  const prose = proseOf(article)
  const ext = [...new Set(linksOf(body).filter((l) => !l.image && isExternal(l.url)).map((l) => l.url))]
  for (const url of ext) {
    const r = await fetcher(url)
    // 401/403/429 = the site refuses robots, not a dead link: a warning, the fact checker already read it
    if ([401, 403, 429].includes(r.status)) { warnings.push(`source refuses an automated check (${r.status}): ${url}`); continue }
    if (r.status < 200 || r.status >= 400) { errors.push(`link does not resolve (${r.status || r.error}): ${url}`); continue }
    const text = stripTags(r.text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' '))
    const runs = sharedRuns(prose, text)
    if (runs.length) errors.push(`copied text from ${url}: "${runs[0]}"${runs.length > 1 ? ` (+${runs.length - 1} more)` : ''}`)
  }
  for (const l of linksOf(article).filter((x) => !x.image && x.url.startsWith('/'))) {
    const p = l.url.split('#')[0].replace(/\/$/, '')
    const ok = ['', '/design', '/points', '/member', '/policies', '/contact'].includes(p) || fs.existsSync(path.join(root, p.slice(1))) || fs.existsSync(path.join(root, p.slice(1), 'index.html'))
    if (!ok) errors.push('internal link target not found: ' + l.url)
  }
  return { errors, warnings }
}

// ---------- CLI
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const args = process.argv.slice(2); const file = args.find((a) => !a.startsWith('--'))
  if (!file) { console.error('usage: node scripts/news/gate.mjs content/news/<file>.md [--online] [--json]'); process.exit(2) }
  const { fm, body } = parseFrontMatter(fs.readFileSync(path.resolve(file), 'utf8'))
  const off = gatePost(fm, body, { file: path.basename(file) })
  const on = args.includes('--online') ? await gateOnline(fm, body) : { errors: [], warnings: [] }
  const res = { ok: !off.errors.length && !on.errors.length, errors: [...off.errors, ...on.errors], warnings: [...off.warnings, ...on.warnings], stats: off.stats }
  if (args.includes('--json')) console.log(JSON.stringify(res, null, 2))
  else { console.log(`gate ${res.ok ? 'OK' : 'FAILED'}: ${path.basename(file)} (${res.stats.words} words, grade ${res.stats.grade}, ${res.stats.sources} sources)`); for (const e of res.errors) console.log('- ' + e); for (const w of res.warnings) console.log('  (warning) ' + w) }
  process.exit(res.ok ? 0 : 1)
}
