#!/usr/bin/env node
// Site-wide synthetic check:  node scripts/site-check.mjs [--base https://thelocalcabinetry.com] [--out DIR] [--no-perf] [--limit N] [--fail-on-perf]
// Run it after every site deploy and once a day. It never writes real data anywhere (see FORMS below).
//   1. Pages:  the sitemaps plus every internal link found by crawling from /, each fetched; a 4xx / 5xx / network error is a BROKEN PAGE.
//   2. Links:  every <a href>, and every img / script / stylesheet the pages load, is resolved. Dead (404, 5xx), "#", "" and javascript: hrefs,
//              "#anchor" links whose id is not on the target page, malformed tel: / mailto: are BROKEN LINKS. External links that only
//              refuse bots (401, 403, 429, 999) are warnings. Buttons: a submit button outside a form, or a form without an action, is broken.
//   3. Perf:   per page at 390 px (phone) with 4G throttling (150 ms RTT, 1.6 Mbps down, 750 kbps up) in headless Chrome over CDP: TTFB and LCP.
//              Over the budget (TTFB 1800 ms, LCP 4000 ms) is a WARNING; --fail-on-perf makes it fail the run.
//   4. Forms:  every <form> found is checked: action, method, the fields it needs, a submit button, and a live GET of the endpoint (405 = route alive).
//              FORMS ARE NEVER SUBMITTED WITH FAKE LEADS: the server has no test-mode flag yet, so a POST to /api/inquiry would create a real
//              thread and a lead message, and the design sign-in would email a code. Those are listed under "needs a server test flag".
//              The one read-only form, /points (card lookup, writes nothing, mails nobody), is submitted once with a card id that cannot exist.
// Output: DIR/site-check-<stamp>.json and .md, plus latest.json / latest.md. Default DIR is ~/lco-site-check-results (NOT inside the site
// folder, which the VPS serves). Exit 1 on a broken page or link, 0 otherwise (perf and "needs a flag" are in the report, not the exit code).
// Needs Node 22+ and Google Chrome (env CHROME overrides the path) for step 3; --no-perf skips Chrome.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null }
const has = (n) => process.argv.includes(n)
const BASE = (arg('--base') || 'https://thelocalcabinetry.com').replace(/\/+$/, '')
const HOST = new URL(BASE).host
const OUT = arg('--out') || path.join(os.homedir(), 'lco-site-check-results')
const LIMIT = +(arg('--limit') || 400)
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const TTFB_MAX = 1800, LCP_MAX = 4000
const UA = 'lco-site-check/1 (+synthetic monitor)'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const problems = []   // { level: 'broken' | 'warn', page, what }
const bad = (page, what) => problems.push({ level: 'broken', page, what })
const warn = (page, what) => problems.push({ level: 'warn', page, what })

async function get(url, { method = 'GET', body, headers = {}, timeout = 20000 } = {}) {
  const t0 = Date.now()
  try {
    const r = await fetch(url, { method, body, headers: { 'user-agent': UA, ...headers }, redirect: 'follow', signal: AbortSignal.timeout(timeout) })
    const ttfb = Date.now() - t0
    const type = r.headers.get('content-type') || ''
    const text = method !== 'HEAD' && /text|json|xml/.test(type) ? await r.text() : (await r.body?.cancel(), '')
    return { status: r.status, url: r.url, ttfb, type, text }
  } catch (e) { return { status: 0, url, ttfb: Date.now() - t0, type: '', text: '', error: String(e.cause?.code || e.message || e) } }
}
const norm = (u) => { try { const x = new URL(u); x.hash = ''; return x.href } catch { return u } }
const sameHost = (u) => { try { return new URL(u).host === HOST } catch { return false } }
const pagePath = (u) => { try { const x = new URL(u); return x.pathname + x.search } catch { return u } }

// ---- 1. sitemap + crawl
async function sitemapUrls() {
  const out = new Set(); const seen = new Set()
  const walk = async (u) => {
    if (seen.has(u)) return; seen.add(u)
    const r = await get(u)
    if (r.status !== 200) { bad(pagePath(u), `sitemap answers ${r.status || r.error}`); return }
    for (const m of r.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
      const loc = m[1].replace(/^https?:\/\/[^/]+/, BASE)
      if (/\.xml$/.test(loc)) await walk(loc); else out.add(norm(loc))
    }
  }
  await walk(BASE + '/sitemap-index.xml')
  await walk(BASE + '/sitemap-news.xml')
  return out
}
const attr = (tag, name) => { const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag); return m ? (m[2] ?? m[3] ?? m[4]) : null }
const unesc = (s) => s == null ? s : s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
function parse(html) {
  const a = [...html.matchAll(/<a\b[^>]*>/gi)].map((m) => ({ href: unesc(attr(m[0], 'href')), tag: m[0] }))
  const res = [...html.matchAll(/<(img|script|source|video|link)\b[^>]*>/gi)].flatMap((m) => {
    const t = m[0], k = m[1].toLowerCase()
    if (k === 'link' && !/rel\s*=\s*["']?(stylesheet|icon|apple-touch-icon|preload)/i.test(t)) return []
    const u = unesc(attr(t, k === 'link' ? 'href' : 'src'))
    return u ? [u] : []
  })
  const ids = new Set([...html.matchAll(/\s(?:id|name)\s*=\s*["']?([^\s"'>]+)/gi)].map((m) => m[1]))
  const forms = [...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/gi)].map((m) => {
    const open = /<form\b[^>]*>/i.exec(m[0])[0], inner = m[1]
    const fields = [...inner.matchAll(/<(input|textarea|select)\b[^>]*>/gi)].map((f) => ({ name: attr(f[0], 'name'), id: attr(f[0], 'id'), type: (attr(f[0], 'type') || f[1]).toLowerCase(), required: /\srequired\b/i.test(f[0]) }))
    const buttons = [...inner.matchAll(/<button\b[^>]*>/gi)].map((b) => attr(b[0], 'type') || 'submit')
    return { action: unesc(attr(open, 'action')), method: (attr(open, 'method') || 'GET').toUpperCase(), id: attr(open, 'id'), cls: attr(open, 'class'), fields, submit: buttons.includes('submit') || fields.some((f) => f.type === 'submit') }
  })
  const outsideForms = html.replace(/<form\b[\s\S]*?<\/form>/gi, '')
  const looseSubmit = [...outsideForms.matchAll(/<button\b[^>]*>/gi)].filter((b) => (attr(b[0], 'type') || 'submit') === 'submit' && !/\sform\s*=/.test(b[0])).length
  const title = (/<title>([^<]*)/i.exec(html) || [])[1] || ''
  return { a, res, ids, forms, looseSubmit, title }
}
const MAIL_RE = /^mailto:[^@\s?]+@[^@\s?]+\.[a-z]{2,}(\?.*)?$/i, TEL_RE = /^tel:\+\d{8,15}$/

async function pool(items, n, fn) {
  const q = [...items]; const workers = Array.from({ length: n }, async () => { while (q.length) { const x = q.shift(); await fn(x) } })
  await Promise.all(workers)
}

const pages = new Map()   // url -> { status, ttfb, title, info }
async function crawl(seed) {
  const todo = [...seed]; const queued = new Set(todo); const linkedOnly = []
  const sitemap = new Set(seed)
  while (todo.length && pages.size < LIMIT) {
    const batch = todo.splice(0, 8)
    await pool(batch, 8, async (u) => {
      const r = await get(u)
      const info = r.status === 200 && /html/.test(r.type) ? parse(r.text) : null
      pages.set(u, { status: r.status, finalUrl: r.url, ttfb: r.ttfb, error: r.error, info, title: info?.title || '' })
      if (r.status !== 200) { bad(pagePath(u), `page answers ${r.status || r.error}`); return }
      if (!sameHost(r.url)) { pages.get(u).info = null; pages.get(u).offsite = new URL(r.url).host; return }   // /design hands over to the design app; its forms are checked in checkForms
      if (!info) return
      if (!info.title.trim()) warn(pagePath(u), 'page has no <title>')
      for (const l of info.a) {
        if (!l.href || /^(#|mailto:|tel:|javascript:|data:)/.test(l.href) || l.href.startsWith('/cdn-cgi/')) continue
        let abs; try { abs = norm(new URL(l.href, r.url).href) } catch { continue }
        if (sameHost(abs) && !/\.(pdf|jpe?g|png|webp|svg|mp4|xml|txt|json|js|css|zip|ico)$/i.test(new URL(abs).pathname) && !queued.has(abs) && !queued.has(abs.replace(/\/$/, '')) && !queued.has(abs + '/')) {
          queued.add(abs); todo.push(abs); if (!sitemap.has(abs)) linkedOnly.push(pagePath(abs))
        }
      }
    })
  }
  return linkedOnly
}

// ---- 2. links
const linkCache = new Map()
async function resolveLink(abs) {
  if (linkCache.has(abs)) return linkCache.get(abs)
  const p = (async () => {
    let r = await get(abs, { method: 'HEAD', timeout: 15000 })
    if (r.status === 0 || r.status >= 400) r = await get(abs, { method: 'GET', timeout: 20000 })
    return { status: r.status, error: r.error }
  })()
  linkCache.set(abs, p); return p
}
async function checkLinks() {
  const jobs = []   // { page, abs, kind }
  const stats = { links: 0, resources: 0 }
  for (const [u, pg] of pages) {
    if (!pg.info) continue
    const pp = pagePath(u)
    for (const l of pg.info.a) {
      if (/\shidden\b/i.test(l.tag) && !l.href) continue   // a hidden anchor a script fills in later
      if (l.href && l.href.startsWith('/cdn-cgi/')) continue   // Cloudflare's own email-obfuscation link, decoded in the browser
      stats.links++
      const h = l.href
      if (h == null || h === '' || h === '#' || /^javascript:/i.test(h)) { bad(pp, `dead link href="${h ?? '(missing)'}" (${(/>([^<]*)</.exec(l.tag) || [])[1] || l.tag.slice(0, 60)})`); continue }
      if (h.startsWith('mailto:')) { if (!MAIL_RE.test(h)) bad(pp, `malformed mailto: ${h}`); continue }
      if (h.startsWith('tel:')) { if (!TEL_RE.test(h)) bad(pp, `malformed tel: ${h} (want tel:+<digits>)`); continue }
      if (/^(data|sms|whatsapp):/.test(h)) continue
      let abs; try { abs = new URL(h, pg.finalUrl || u) } catch { bad(pp, `unparseable href ${h}`); continue }
      if (!/^https?:$/.test(abs.protocol)) { bad(pp, `unsupported link scheme ${h}`); continue }
      if (h.startsWith('#')) { if (!pg.info.ids.has(decodeURIComponent(h.slice(1)))) bad(pp, `anchor ${h} has no matching id on the page`); continue }
      if (abs.hash && sameHost(abs.href)) {   // another page's #anchor
        const target = pages.get(norm(abs.href)) || pages.get(norm(abs.href).replace(/\/$/, '')) || pages.get(norm(abs.href) + '/')
        const frag = decodeURIComponent(abs.hash.slice(1))
        if (target?.info && frag && !target.info.ids.has(frag)) bad(pp, `${h} points at #${frag}, which is not on the target page`)
      }
      jobs.push({ page: pp, abs: norm(abs.href), kind: 'link', ext: !sameHost(abs.href) })
    }
    for (const r of pg.info.res) {
      stats.resources++
      let abs; try { abs = new URL(r, pg.finalUrl || u) } catch { continue }
      if (!/^https?:$/.test(abs.protocol)) continue
      jobs.push({ page: pp, abs: norm(abs.href), kind: 'resource', ext: !sameHost(abs.href) })
    }
    if (pg.info.looseSubmit) bad(pp, `${pg.info.looseSubmit} submit button(s) outside any form (they do nothing)`)
  }
  const uniq = [...new Set(jobs.map((j) => j.abs))]
  await pool(uniq, 10, async (u) => { await resolveLink(u) })
  for (const j of jobs) {
    const r = await resolveLink(j.abs)
    if (r.status >= 200 && r.status < 400) continue
    const soft = j.ext && [0, 401, 403, 429, 999].includes(r.status)   // external sites that refuse bots or time out
    const what = `${j.kind} ${j.abs.length > 90 ? j.abs.slice(0, 90) + '...' : j.abs} answers ${r.status || r.error}`
    if (soft) warn(j.page, what + ' (external, may only refuse bots)'); else bad(j.page, what)
  }
  return stats
}

// ---- 4. forms
const forms = []   // report rows
const DESIGN_HOST = 'https://design.thelocalcabinetry.com'
async function checkForms() {
  const seenSig = new Map()
  for (const [u, pg] of pages) for (const f of pg.info?.forms || []) {
    const pp = pagePath(u)
    if (!f.action) {   // a form with an id and no action is handled by the page's own script (the /design app); its host is checked below
      if (!f.id) bad(pp, 'form has no action and no id (nothing can handle it)')
      continue
    }
    if (!f.submit) bad(pp, `form ${f.action} has no submit button`)
    const sig = f.method + ' ' + f.action
    const row = seenSig.get(sig) || { kind: 'site form', endpoint: sig, pages: [], fields: [...new Set(f.fields.filter((x) => x.name).map((x) => x.name))], required: f.fields.filter((x) => x.required && x.name).map((x) => x.name) }
    row.pages.push(pp); seenSig.set(sig, row)
  }
  for (const row of seenSig.values()) {
    const [method, action] = row.endpoint.split(' ')
    const url = new URL(action, BASE).href
    const probe = await get(url, { method: 'GET' })
    row.get_status = probe.status
    row.pages = [...new Set(row.pages)]
    if (probe.status === 0 || probe.status >= 500 || probe.status === 404) { bad(row.pages[0], `form endpoint ${action} answers ${probe.status || probe.error} to GET (a live POST-only route answers 405)`); row.result = 'BROKEN endpoint'; forms.push(row); continue }
    if (action === '/api/inquiry') {
      for (const need of ['name', 'email', 'phone']) if (!row.fields.includes(need)) bad(row.pages[0], `form ${action} lost the field "${need}"`)
      row.result = 'static check OK, endpoint answers; NOT submitted: needs a server test flag (a POST creates a real thread and lead message)'
      row.needs_flag = true
    } else if (action === '/points') {
      if (!row.fields.includes('card')) bad(row.pages[0], 'points form lost the field "card"')
      const r = await get(BASE + '/points', { method: 'POST', body: 'card=TEST-SITE-CHECK', headers: { 'content-type': 'application/x-www-form-urlencoded' } })
      row.post_status = r.status
      // by design an unknown card answers HTTP 404 with the "couldn't find that card" page (lib/design-site/points.ts)
      if (r.status === 404 && /find that card/i.test(r.text)) row.result = 'submitted (read-only lookup, card id cannot exist): answers "card not found" (404 page) as designed'
      else if (/too many/i.test(r.text)) { row.result = 'submitted: answers "too many tries" (rate limit hit)'; warn('/points', 'points lookup answered "too many tries" to the check') }
      else { row.result = `submitted: unexpected answer ${r.status || r.error}`; bad('/points', `points lookup POST answered ${r.status || r.error} without the "couldn't find that card" page`) }
    } else { row.result = 'static check OK, endpoint answers; not submitted (unknown form, needs a server test flag)'; row.needs_flag = true }
    forms.push(row)
  }
  // chat start (chat.js on every page): GET config answers; the POSTs create a thread
  const cfg = await get(BASE + '/design/api/visit/config', { headers: { 'x-lco-design': '1' } })
  let ok = cfg.status === 200; try { JSON.parse(cfg.text) } catch { ok = false }
  if (!ok) bad('/ (chat widget)', `chat config GET /design/api/visit/config answers ${cfg.status || cfg.error}`)
  forms.push({ kind: 'chat start', endpoint: 'POST /design/api/visit/message', pages: ['every page (chat.js)'], get_status: cfg.status, result: (ok ? 'config GET OK; ' : 'config GET FAILED; ') + 'message POST not sent: needs a server test flag (it opens a real chat thread)', needs_flag: true })
  // design sign-in (on the design host): static check only, submitting it emails a one-time code
  const d = await get(DESIGN_HOST + '/design')
  const dform = d.status === 200 ? parse(d.text).forms : []
  const hasSign = dform.some((f) => f.fields.some((x) => x.type === 'email')) && dform.length >= 2
  if (!hasSign) bad('/design', `design sign-in form not found on ${DESIGN_HOST}/design (status ${d.status || d.error})`)
  forms.push({ kind: 'design request / sign-in', endpoint: DESIGN_HOST + '/design (email + one-time code)', pages: ['/design'], get_status: d.status, result: (hasSign ? 'forms present (email, code, message); ' : 'FORM MISSING; ') + 'not submitted: needs a server test flag (it emails a real code to the address)', needs_flag: true })
  forms.push({ kind: 'newsletter', endpoint: '-', pages: [], result: 'none exists on the site (no form or script collects a newsletter signup)' })
}

// ---- 3. perf (Chrome over CDP)
async function perf(list) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lco-sitecheck-'))
  const port = 9800 + Math.floor(Math.random() * 150)
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })
  let ws, id = 0; const pending = new Map(); const rows = []
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
  try {
    let targets
    for (let i = 0; i < 120; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break } catch { await sleep(250) } }
    if (!targets) throw new Error('Chrome did not start')
    ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
    await new Promise((r) => ws.addEventListener('open', r))
    ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || { error: m.error }); pending.delete(m.id) } })
    await send('Page.enable'); await send('Network.enable')
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
    await send('Network.setCacheDisabled', { cacheDisabled: true })
    await send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8, connectionType: 'cellular4g' })
    for (const u of list) {
      await send('Page.navigate', { url: 'about:blank' })
      // observer installed before the page's own scripts run
      const sc = await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__lcp=0;try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lcp=e.startTime}).observe({type:"largest-contentful-paint",buffered:true})}catch(e){}' })
      await send('Page.navigate', { url: u })
      let loaded = false
      for (let i = 0; i < 60 && !loaded; i++) { await sleep(500); const r = await send('Runtime.evaluate', { expression: 'document.readyState==="complete"', returnByValue: true }); loaded = r.result?.value === true && !(await send('Runtime.evaluate', { expression: 'location.href', returnByValue: true })).result?.value?.startsWith('about:') }
      await sleep(1200)
      const r = await send('Runtime.evaluate', { expression: 'JSON.stringify({lcp:window.__lcp||null,ttfb:(()=>{const n=performance.getEntriesByType("navigation")[0];return n?Math.round(n.responseStart):null})()})', returnByValue: true })
      let v = {}; try { v = JSON.parse(r.result.value) } catch {}
      if (sc.identifier) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: sc.identifier })
      rows.push({ page: pagePath(u), ttfb_ms: v.ttfb, lcp_ms: v.lcp ? Math.round(v.lcp) : null, loaded })
    }
  } finally { try { ws && ws.close() } catch {} proc.kill('SIGTERM') }
  return rows
}

// ---- main
const started = new Date()
console.error(`site-check: ${BASE}`)
const sm = await sitemapUrls()
console.error(`sitemap: ${sm.size} urls`)
const linkedOnly = await crawl(sm)
console.error(`crawled ${pages.size} pages`)
const stats = await checkLinks()
await checkForms()
let perfRows = [], perfError = null
if (!has('--no-perf')) {
  const list = [...pages].filter(([, p]) => p.status === 200 && p.info).map(([u]) => u)
  try { perfRows = await perf(list) } catch (e) { perfError = String(e.message || e); warn('(perf)', `Chrome performance run failed: ${perfError}`) }
  for (const r of perfRows) {
    if (!r.loaded) warn(r.page, 'page did not finish loading in 30 s at 4G / 390 px')
    if (r.ttfb_ms != null && r.ttfb_ms > TTFB_MAX) (has('--fail-on-perf') ? bad : warn)(r.page, `TTFB ${r.ttfb_ms} ms at 4G (budget ${TTFB_MAX})`)
    if (r.lcp_ms != null && r.lcp_ms > LCP_MAX) (has('--fail-on-perf') ? bad : warn)(r.page, `LCP ${r.lcp_ms} ms at 4G (budget ${LCP_MAX})`)
  }
}
for (const [u, p] of pages) if (p.status === 200) { const fetchTtfb = p.ttfb; if (fetchTtfb > 2500) warn(pagePath(u), `server answered in ${fetchTtfb} ms (unthrottled fetch)`) }

const broken = problems.filter((p) => p.level === 'broken'), warns = problems.filter((p) => p.level === 'warn')
const report = {
  base: BASE, started: started.toISOString(), seconds: Math.round((Date.now() - started) / 1000),
  summary: { pages: pages.size, pages_ok: [...pages.values()].filter((p) => p.status === 200).length, links_checked: stats.links, resources_checked: stats.resources, broken: broken.length, warnings: warns.length, perf_pages: perfRows.length, forms_needing_server_test_flag: forms.filter((f) => f.needs_flag).length },
  broken, warnings: warns, linked_but_not_in_sitemap: linkedOnly, forms, perf: perfRows,
  pages: [...pages].map(([u, p]) => ({ page: pagePath(u), status: p.status, server_ms: p.ttfb })),
}
fs.mkdirSync(OUT, { recursive: true })
const stamp = started.toISOString().replace(/[:T]/g, '-').slice(0, 16)
const esc = (s) => String(s).replace(/\|/g, '\\|')
const slow = [...perfRows].filter((r) => r.lcp_ms).sort((a, b) => b.lcp_ms - a.lcp_ms).slice(0, 10)
const md = [
  `# Site check ${BASE} ${started.toISOString().slice(0, 16)}Z`, '',
  `${report.summary.pages} pages (${report.summary.pages_ok} OK), ${stats.links} links and ${stats.resources} resources resolved, ${broken.length} broken, ${warns.length} warnings, ${report.seconds}s. Result: **${broken.length ? 'FAIL' : 'PASS'}**`, '',
  '## Broken', '', broken.length ? '| Page | Problem |\n|---|---|\n' + broken.map((p) => `| ${esc(p.page)} | ${esc(p.what)} |`).join('\n') : 'Nothing broken.', '',
  '## Forms', '', '| Form | Endpoint | Where | Result |\n|---|---|---|---|\n' + forms.map((f) => `| ${esc(f.kind)} | ${esc(f.endpoint)} | ${esc((f.pages || []).slice(0, 3).join(', ') + ((f.pages || []).length > 3 ? ` +${f.pages.length - 3}` : ''))} | ${esc(f.result)} |`).join('\n'), '',
  '## Needs a server test flag', '', forms.filter((f) => f.needs_flag).map((f) => `- ${f.kind}: ${f.endpoint}`).join('\n') || 'None.', '',
  '## Slowest pages at 390 px, 4G (LCP / TTFB)', '', slow.length ? '| Page | LCP ms | TTFB ms |\n|---|---|---|\n' + slow.map((r) => `| ${esc(r.page)} | ${r.lcp_ms} | ${r.ttfb_ms} |`).join('\n') : (perfError ? `Perf run failed: ${perfError}` : 'Perf not run.'), '',
  '## Warnings', '', warns.length ? '| Page | Warning |\n|---|---|\n' + warns.map((p) => `| ${esc(p.page)} | ${esc(p.what)} |`).join('\n') : 'None.', '',
  linkedOnly.length ? `## Linked but not in the sitemap\n\n${linkedOnly.map((p) => '- ' + p).join('\n')}\n` : '',
].join('\n')
for (const n of [`site-check-${stamp}`, 'latest']) { fs.writeFileSync(path.join(OUT, n + '.json'), JSON.stringify(report, null, 1)); fs.writeFileSync(path.join(OUT, n + '.md'), md) }
console.log(`site-check: ${broken.length ? 'FAIL' : 'PASS'}  pages ${report.summary.pages}  broken ${broken.length}  warnings ${warns.length}  -> ${path.join(OUT, 'latest.md')}`)
process.exit(broken.length ? 1 : 0)
