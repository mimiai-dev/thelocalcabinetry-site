#!/usr/bin/env node
// Phone number shown to people, not to bots (owner 2026-10-23):  node scripts/test-phone.mjs
//   1. grep the served files for the digits ("8579308324", "930-8324", "(857)") and tel: links: 0 hits;
//   2. call.js unit test with a stub DOM: the number appears after load, the aria-label is set, the tel: href exists only after a click;
//   3. headless Chrome (skipped with a notice if there is none; env CHROME overrides the path): the real pages' DOM after load holds the number
//      and the raw HTML does not.
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import http from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const run = promisify(execFile)
import { fileURLToPath } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let fail = 0
const ok = (c, m) => { if (!c) { fail++; console.error('FAIL', m) } else console.log('ok  ', m) }
const SKIP = new Set(['.git', 'node_modules', 'docs', 'catalog', 'brand-kit-a5649501d5a1feec', 'scripts', '.github'])
const served = []
;(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!(SKIP.has(e.name) && d === ROOT)) walk(p) } else if (/\.(html|txt|js|json|xml)$/.test(e.name) && e.name !== 'site.config.json') served.push(p) } })(ROOT)
for (const [name, re] of [['8579308324', /8579308324/], ['930-8324', /930-8324/], ['(857)', /\(857\)/], ['tel: link', /href="tel:/i], ['JSON-LD telephone', /"telephone"/]]) {
  const hit = served.filter((f) => re.test(fs.readFileSync(f, 'utf8')))
  ok(hit.length === 0, `${served.length} served files: 0 hits for ${name}${hit.length ? ' in ' + hit.slice(0, 5).map((f) => path.relative(ROOT, f)).join(', ') : ''}`)
}
const pages = served.filter((f) => f.endsWith('.html') && /data-call/.test(fs.readFileSync(f, 'utf8')))
ok(pages.length >= 30 && pages.every((f) => /<noscript><a href="\/contact">Use the contact form<\/a><\/noscript>/.test(fs.readFileSync(f, 'utf8')) && /src="\/call\.js"/.test(fs.readFileSync(f, 'utf8'))), `${pages.length} pages carry the Call us link, the noscript line and /call.js`)
// 2. stub DOM
{
  const attrs = {}, style = { display: 'none' }
  const ns = { tagName: 'NOSCRIPT', parentNode: { removeChild() { ns.gone = true } } }
  const a = { textContent: 'Call us', style, nextElementSibling: ns, getAttribute: (k) => attrs[k], setAttribute: (k, v) => { attrs[k] = v }, closest: () => a }
  attrs.href = '/contact'
  const handlers = {}
  const document = { readyState: 'complete', querySelectorAll: () => [a], addEventListener: (t, f) => { handlers[t] = f } }
  const timers = []
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'call.js'), 'utf8'), { document, setTimeout: (f) => timers.push(f) })
  ok(a.textContent === 'Call (857) 930-8324' && style.display === '' && ns.gone, 'call.js: number shown after load, noscript line removed')
  ok(/^Call us at 8 5 7 9 3 0 8 3 2 4$/.test(attrs['aria-label']), 'call.js: aria-label set after reveal')
  ok(attrs.href === '/contact', 'call.js: no tel: href before a click')
  handlers.click({ target: a })
  ok(attrs.href === 'tel:+18579308324', 'call.js: tel: href built on click')
  timers.forEach((f) => f())
  ok(attrs.href === '/contact', 'call.js: href back to /contact after the click')
}
// 3. headless Chrome
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if (!fs.existsSync(CHROME)) console.log('skip: no Chrome at', CHROME)
else {
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'
    const f = path.join(ROOT, p)
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.statusCode = 404; return r.end() }
    r.setHeader('content-type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html'); r.end(fs.readFileSync(f))
  })
  await new Promise((res) => srv.listen(0, '127.0.0.1', res))
  const port = srv.address().port
  for (const p of ['/', '/contact/', '/houston/', '/news/']) {
    const raw = await (await fetch(`http://127.0.0.1:${port}${p}`)).text()
    const r = await run(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--user-data-dir=' + fs.mkdtempSync('/tmp/phone-test-'), '--virtual-time-budget=4000', '--dump-dom', `http://127.0.0.1:${port}${p}`], { timeout: 60000 }).catch((e) => ({ stdout: '' }))
    ok(!/930-8324|8579308324/.test(raw) && /\(857\) 930-8324/.test(r.stdout) && /aria-label="Call us at 8 5 7 9 3 0 8 3 2 4"/.test(r.stdout), `chrome ${p}: not in the HTML, shown after load with its aria-label`)
  }
  srv.close()
}
process.exit(fail ? 1 : 0)
