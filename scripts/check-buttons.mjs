#!/usr/bin/env node
// Button contrast guard:  node scripts/check-buttons.mjs [--base http://127.0.0.1:8080] [--json out.json] [--only /path/,/path2/]
// Loads every built page (all *.html the site serves) in headless Chrome at 390 px (phone) and 1280 px, finds every visible button-class
// link or button (class "btn" or "btn-*"), and checks it normally and with :hover forced:
//   1. the contrast of each piece of its text against the button background is at least 4.5:1 (WCAG AA). For a gradient every stop is
//      tested (so the lightest and the darkest stop both count); a transparent button is tested against the first painted ancestor;
//   2. the text is not underlined (a button inside article text must not pick up the prose link style).
// A transparent button over a photo (hero ghost buttons) cannot be measured against a colour and is listed as skipped, not failed.
// Without --base it serves the repo root itself on a free local port. Needs Google Chrome; exits 1 on any failure.
import { spawn } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SKIP = new Set(['.git', 'node_modules', 'docs', 'deploy', 'scripts', 'content', 'logo-src', '.github', 'bk'])
const SKIP_PATH = new Set(['catalog/src'])
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const MIN = 4.5
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null }

function pages() {
  const out = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${e.name}` : e.name
      if (e.isDirectory()) { if (!SKIP.has(e.name) && !SKIP_PATH.has(rel)) walk(rel) }
      else if (e.name.endsWith('.html')) out.push('/' + (e.name === 'index.html' ? (dir ? dir + '/' : '') : rel))
    }
  }
  walk('')
  return out.sort()
}

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json', '.ico': 'image/x-icon', '.mp4': 'video/mp4' }
function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
      let f = path.join(ROOT, p)
      if (!f.startsWith(ROOT)) { rsp.writeHead(403); return rsp.end() }
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html')
      if (!fs.existsSync(f)) { rsp.writeHead(404); return rsp.end() }
      rsp.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' })
      fs.createReadStream(f).pipe(rsp)
    })
    srv.listen(0, '127.0.0.1', () => res(srv))
  })
}

// runs in the page, on one button element
const MEASURE = function () {
  const el = this
  const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 } }
  const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b) }
  const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 })
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
  let stops = null, n = el
  while (n && n.nodeType === 1) {
    const s = getComputedStyle(n)
    if (/url\(/.test(s.backgroundImage) && !/gradient/.test(s.backgroundImage)) return { label: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50), cls: el.className, onPhoto: true, visible: true, texts: [] }
    if (/gradient/.test(s.backgroundImage)) { stops = (s.backgroundImage.match(/rgba?\([^)]+\)/g) || []).map(parse); break }
    const c = parse(s.backgroundColor)
    if (c && c.a >= 0.5) { stops = [c]; break }
    n = n.parentElement
  }
  if (!stops || !stops.length) stops = [{ r: 255, g: 255, b: 255, a: 1 }]
  const texts = []
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let t
  while ((t = tw.nextNode())) {
    if (!t.nodeValue.trim()) continue
    const p = t.parentElement, s = getComputedStyle(p)
    if (s.visibility === 'hidden' || s.display === 'none') continue
    const fg = parse(s.color)
    let worst = Infinity
    for (const st of stops) worst = Math.min(worst, ratio(blend(fg, { ...st, a: 1 }), st))
    texts.push({ text: t.nodeValue.trim().slice(0, 40), color: s.color, ratio: +worst.toFixed(2), underline: /underline/.test(s.textDecorationLine) || /underline/.test(getComputedStyle(el).textDecorationLine) })
  }
  const r = el.getBoundingClientRect()
  return { label: (el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 50), cls: el.className, bg: stops.map((c) => `rgb(${c.r},${c.g},${c.b})`).join(' > '), visible: r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden', texts }
}

async function main() {
  const only = arg('--only') ? arg('--only').split(',') : null
  const list = only || pages()
  let srv = null, base = arg('--base')
  if (!base) { srv = await serve(); base = `http://127.0.0.1:${srv.address().port}` }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lco-btncheck-'))
  const port = 9400 + Math.floor(Math.random() * 400)
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  let ws, id = 0
  const pending = new Map()
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
  const results = []
  const skipped = new Set()
  try {
    let targets
    for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break } catch { await sleep(250) } }
    ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
    await new Promise((r) => ws.addEventListener('open', r))
    ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || { error: m.error }); pending.delete(m.id) } })
    await send('Page.enable'); await send('DOM.enable'); await send('CSS.enable')
    const fn = MEASURE.toString()
    for (const vp of [{ name: '390', width: 390, height: 844, dpr: 2, mobile: true }, { name: '1280', width: 1280, height: 900, dpr: 1, mobile: false }]) {
      await send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr, mobile: vp.mobile })
      for (const p of list) {
        await send('Page.navigate', { url: base + p })
        await sleep(1500)
        // no transitions or rise-in animations while measuring, so a forced :hover reads its final colours
        await send('Runtime.evaluate', { expression: `(() => { const s = document.createElement('style'); s.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}'; document.head.appendChild(s) })()` })
        const doc = await send('DOM.getDocument', { depth: 0 })
        const q = await send('DOM.querySelectorAll', { nodeId: doc.root.nodeId, selector: 'a[class~="btn"], a[class*="btn-"], button[class~="btn"], button[class*="btn-"]' })
        for (const nodeId of q.nodeIds || []) {
          const obj = await send('DOM.resolveNode', { nodeId })
          if (!obj.object) continue
          for (const state of ['normal', 'hover']) {
            await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: state === 'hover' ? ['hover'] : [] })
            const r = await send('Runtime.callFunctionOn', { objectId: obj.object.objectId, functionDeclaration: fn, returnByValue: true })
            const v = r.result && r.result.value
            if (!v || !v.visible) break
            if (v.onPhoto) { skipped.add(`${p} @${vp.name}: "${v.label}" (on a photo)`); break }
            for (const t of v.texts) results.push({ page: p, vp: vp.name, state, label: v.label, cls: v.cls, bg: v.bg, text: t.text, color: t.color, ratio: t.ratio, underline: t.underline, ok: t.ratio >= MIN && !t.underline })
          }
          await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] })
        }
      }
    }
  } finally { try { ws && ws.close() } catch {} proc.kill('SIGTERM'); if (srv) srv.close() }
  const bad = results.filter((r) => !r.ok)
  if (arg('--json')) fs.writeFileSync(arg('--json'), JSON.stringify(results, null, 1))
  const seen = new Set()
  for (const b of bad) {
    const k = `${b.page} ${b.vp} ${b.state} ${b.label} ${b.text}`
    if (seen.has(k)) continue
    seen.add(k)
    console.log(`FAIL ${b.page} @${b.vp} ${b.state}: "${b.label}" text "${b.text}" ${b.color} on ${b.bg} = ${b.ratio}:1${b.underline ? ', underlined' : ''}`)
  }
  for (const k of skipped) console.log(`skip ${k}`)
  console.log(bad.length ? `check-buttons: ${bad.length} failing text pieces (${list.length} pages x 2 widths, ${results.length} checked)` : `check-buttons: OK (${list.length} pages x 2 widths, ${results.length} button texts, normal and :hover)`)
  process.exit(bad.length ? 1 : 0)
}
main()
