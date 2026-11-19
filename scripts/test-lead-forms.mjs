#!/usr/bin/env node
// Lead forms browser test (owner 2026-11-17):  node scripts/test-lead-forms.mjs [--page /p/p_sliding_wardrobe/] [--shots DIR]
// Headless Chrome (CDP) against the repo root served on a free local port. chat.js draws both:
//   A. the Black Friday popup: 3-5 s (random) after load; x / Escape / outside click close it for the page; from the 2nd display a
//      "Don't show again today" button hides it until the end of the visitor's local day (it shows again the next day; owner 2026-11-18); a sent form
//      hides it for the campaign; both keys carry the campaign id; an old "never" no longer hides it; storage blocked = it shows; never after
//      Nov 30 2026 end of day US Central (2026-12-01T06:00Z); never on /contact; never over the open chat panel; dialog, labels, focus trap, Esc.
//   B. the contact band right before the site footer (every page but /contact): fields, consent, product_id = the project.
// /api/inquiry is stubbed IN THE PAGE (window.fetch): nothing is ever sent to a server. The clock and Math.random are stubbed per case.
// The form funnel (owner 2026-11-18): chat.js tells window.__tlcForm (stubbed here) the popup shown (which display), closed (x / backdrop / Esc / after sending), "not today" (wire kind popup_never), and its refused fields.
// --shots DIR saves the popup and the band at 1280 and 375 px. Exits 1 on any failed check.
import { spawn } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null }
const PAGE = arg('--page') || '/p/p_sliding_wardrobe/'
const SHOTS = arg('--shots')
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OFF = 'lco_bfpop26_off', N = 'lco_bfpop26_n'

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      let f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname))
      if (!f.startsWith(ROOT)) { rsp.writeHead(403); return rsp.end() }
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html')
      if (!fs.existsSync(f)) { rsp.writeHead(404); return rsp.end() }
      rsp.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' })
      fs.createReadStream(f).pipe(rsp)
    })
    srv.listen(0, '127.0.0.1', () => res(srv))
  })
}

// the page-side stubs: clock (an absolute instant that keeps flowing), Math.random, blocked storage, the /api/inquiry answer, and the time the popup appeared
function initSource({ now = null, rnd = null, blocked = false, welcome = false, popOff = false, legacyNever = false, reply = { status: 200, body: { ok: true } } } = {}) {
  return `(() => {
    ${now ? `const R = Date, off = R.parse(${JSON.stringify(now)}) - R.now(); class D extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + off) } static now() { return R.now() + off } } window.Date = D;` : ''}
    ${rnd != null ? `Math.random = () => ${rnd};` : ''}
    ${blocked ? `Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked') } });` : welcome ? '' : `try { localStorage.setItem('lco_welcome_v1', '1') } catch (e) {}`}
    ${popOff ? `try { localStorage.setItem('lco_bfpop26_off', 'sent') } catch (e) {}` : ''}
    ${legacyNever ? `try { localStorage.setItem('lco_bfpop26_off', 'never'); localStorage.setItem('lco_bfpop26_n', '3') } catch (e) {}` : ''}
    window.__posts = []
    // the form funnel hook t.js would define on the real site (t.js is silent on 127.0.0.1): what chat.js reports, [kind, display, how, field]
    window.__tlc = []; window.__tlcForm = (k, o) => { window.__tlc.push([k, o && o.n || null, o && o.h || null, o && o.f || null]) }
    const real = window.fetch.bind(window)
    window.fetch = (url, opt = {}) => {
      if (String(url).includes('/api/inquiry')) {
        window.__posts.push({ url: String(url), method: opt.method, entries: opt.body && opt.body.entries ? [...opt.body.entries()].map(([k, v]) => [k, String(v)]) : null })
        const r = ${JSON.stringify(reply)}
        return Promise.resolve(new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } }))
      }
      if (String(url).includes('/design/api/')) return Promise.resolve(new Response('{"enabled":true,"email_gate":"off"}', { status: 200, headers: { 'content-type': 'application/json' } }))
      return real(url, opt)
    }
    new MutationObserver(() => { if (!window.__bfAt && document.querySelector('.lcobf')) window.__bfAt = performance.now() }).observe(document, { childList: true, subtree: true })
  })()`
}

async function main() {
  const srv = await serve(), base = `http://127.0.0.1:${srv.address().port}`
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lco-leadforms-'))
  const port = 9600 + Math.floor(Math.random() * 150)   // never 9222 (the owner's Chrome)
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })
  let ws, id = 0, initId = null
  const pending = new Map()
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value
  const fails = [], log = (ok, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? ' ' + extra : ''}`); if (!ok) fails.push(what) }
  const viewport = (w, h, mobile) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile })
  // a fresh page: new stubs, and (unless keep) this origin's storage cleared first
  const load = async (url, opts = {}, keep = false) => {
    if (initId) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: initId })
    initId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: initSource(opts) })).identifier
    if (!keep) await send('Storage.clearDataForOrigin', { origin: base, storageTypes: 'local_storage,session_storage' })
    await send('Page.navigate', { url: base + url })
    await sleep(400)
  }
  const pop = `(() => { const p = document.querySelector('.lcobf'); return p && !p.hidden ? p : null })()`
  const popOn = async () => !!(await ev(`!!${pop}`))
  const key = async (k, code, shift) => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: k === 'Tab' ? 9 : 27, modifiers: shift ? 8 : 0 }) }
  const shot = async (name, sel) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const clip = sel ? await ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: 0, y: r.top + scrollY, width: innerWidth, height: r.height, scale: 1 } })()`) : null; const r = await send('Page.captureScreenshot', clip ? { format: 'png', clip, captureBeyondViewport: true } : { format: 'png' }); const f = path.join(SHOTS, name); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); console.log('shot ' + f) }
  const fill = (sel, vals) => ev(`(() => { const f = document.querySelector(${JSON.stringify(sel)}); const v = ${JSON.stringify(vals)}; for (const k in v) { const n = f.elements[k]; if (n.type === 'checkbox') n.checked = !!v[k]; else n.value = v[k] } return true })()`)
  try {
    let targets
    for (let i = 0; i < 160; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break } catch { await sleep(250) } }
    ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
    await new Promise((r) => ws.addEventListener('open', r))
    ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || {}); pending.delete(m.id) } })
    await send('Page.enable'); await send('Runtime.enable')
    await viewport(1280, 900, false)
    const NOV = '2026-11-20T15:00:00Z'
    const delay = `Math.round(window.__bfAt - performance.getEntriesByType('navigation')[0].domInteractive)`

    // 1. the delay: 3 s with random 0, 5 s with random ~1, between with a real random
    await load(PAGE, { now: NOV, rnd: 0 }); await sleep(2200)
    log(!(await popOn()), 'random 0: no popup before 3 s')
    await sleep(1200)
    let d = await ev(delay)
    log((await popOn()) && d >= 2950 && d <= 3400, 'random 0: the popup appears at 3 s', `(${d} ms after the page was read)`)
    await load(PAGE, { now: NOV, rnd: 0.9999 }); await sleep(4200)
    log(!(await popOn()), 'random ~1: no popup before 5 s')
    await sleep(1300)
    d = await ev(delay)
    log((await popOn()) && d >= 4950 && d <= 5400, 'random ~1: the popup appears at 5 s', `(${d} ms)`)
    await load(PAGE, { now: NOV }); await sleep(5600)
    d = await ev(delay)
    log((await popOn()) && d >= 2950 && d <= 5400, 'real random: between 3 and 5 s', `(${d} ms)`)

    // 2. the first display: dialog, labels, the sale facts, the privacy link, no "Don't show" button; x closes it for this page only
    await load(PAGE, { now: NOV, rnd: 0 }); await sleep(3600)
    const first = await ev(`(() => { const p = ${pop}; if (!p) return null; return { role: p.getAttribute('role'), modal: p.getAttribute('aria-modal'), label: document.getElementById(p.getAttribute('aria-labelledby'))?.textContent,
      text: p.textContent, labelled: [...p.querySelectorAll('input')].every((i) => i.closest('label') && i.closest('label').textContent.trim().length > 0), fields: [...p.querySelectorAll('input')].map((i) => i.name + (i.required ? '*' : '')),
      priv: p.querySelector('.lcobf-priv a')?.getAttribute('href'), terms: p.querySelector('.lcobf-body > p a')?.getAttribute('href'), never: !!p.querySelector('.lcobf-never'), focus: p.contains(document.activeElement), n: localStorage.getItem('${N}') } })()`)
    log(!!first && first.role === 'dialog' && first.modal === 'true' && first.label === '10% off your cabinets' && /Nov 11–30/.test(first.text) && first.labelled && first.fields.join() === 'name*,email*,phone' && first.priv === '/black-friday/' && !first.terms && first.focus,
      'first display: role=dialog, labelled fields Name / Email / Phone (optional), the bar\'s sale facts, one terms & privacy link, focus inside', `(${JSON.stringify(first)})`)
    log(first && !first.never && String(first.n).endsWith(':1'), 'first display: no "Don\'t show this again" button, counted 1')
    await ev(`document.querySelector('.lcobf-x').click(); true`)
    log(!(await popOn()), 'x closes it')
    log((await ev(`JSON.stringify(window.__tlc)`)) === JSON.stringify([['popup_shown', 1, null, null], ['popup_closed', null, 'x', null]]), 'funnel: shown (display 1), closed by the x', `(${await ev(`JSON.stringify(window.__tlc)`)})`)
    await sleep(2500)
    log(!(await popOn()), 'closed stays closed on this page')

    // 2b. owner 2026-11-19: a display more than 10 minutes after the last one has just the X (the button is only for a popup that comes back within 10 minutes)
    await ev(`localStorage.setItem('lco_bfpop26_t', String(Date.parse('${NOV}') - 11 * 60 * 1000)); true`)
    await load(PAGE, { now: NOV, rnd: 0 }, true); await sleep(3600)
    log((await popOn()) && !(await ev(`!!document.querySelector('.lcobf-never')`)), 'a display 11 minutes after the last: no "Don\'t show again today" button')
    await ev(`document.querySelector('.lcobf-x').click(); true`)

    // 3. the second display: the "Don't show again today" button; focus trap and Escape; the button hides it for the rest of the local day
    await load(PAGE, { now: NOV, rnd: 0 }, true); await sleep(3600)
    log((await popOn()) && (await ev(`document.querySelector('.lcobf-never')?.textContent`)) === 'Don’t show again today' && String(await ev(`localStorage.getItem('${N}')`)).endsWith(':3'), 'display within 10 minutes of the last: "Don\'t show again today" is there (counted 3)')
    await ev(`(() => { const f = [...document.querySelectorAll('.lcobf-card button, .lcobf-card a[href], .lcobf-card input')]; f[f.length - 1].focus(); return true })()`)
    await key('Tab', 'Tab')
    const wrap = await ev(`(() => { const f = [...document.querySelectorAll('.lcobf-card button, .lcobf-card a[href], .lcobf-card input')]; return document.activeElement === f[0] })()`)
    await key('Tab', 'Tab', true)
    const back = await ev(`(() => { const f = [...document.querySelectorAll('.lcobf-card button, .lcobf-card a[href], .lcobf-card input')]; return document.activeElement === f[f.length - 1] })()`)
    log(wrap && back, 'focus trap: Tab from the last goes to the first, Shift+Tab back')
    await key('Escape', 'Escape')
    log(!(await popOn()), 'Escape closes it')
    log((await ev(`JSON.stringify(window.__tlc)`)) === JSON.stringify([['popup_shown', 3, null, null], ['popup_closed', null, 'esc', null]]), 'funnel: shown (display 3), closed by Escape', `(${await ev(`JSON.stringify(window.__tlc)`)})`)
    await load(PAGE, { now: NOV, rnd: 0 }, true); await sleep(3600)
    await ev(`document.querySelector('.lcobf').dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
    log(!(await popOn()), 'a click on the backdrop closes it')
    log((await ev(`JSON.stringify(window.__tlc.map((x) => x[2]))`)) === JSON.stringify([null, 'backdrop']), 'funnel: closed by the backdrop')
    await load(PAGE, { now: NOV, rnd: 0 }, true); await sleep(3600)
    await ev(`document.querySelector('.lcobf-never').click(); true`)
    const today = await ev(`(() => { const d = new Date(), p = (n) => (n < 10 ? '0' : '') + n; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) })()`)
    log(!(await popOn()) && (await ev(`localStorage.getItem('${OFF}')`)) === today, '"Don\'t show again today" closes it and keeps the visitor\'s local day', `(${today})`)
    log((await ev(`JSON.stringify(window.__tlc.map((x) => x[0]))`)) === JSON.stringify(['popup_shown', 'popup_never']), 'funnel: "not today" is its own step (popup_never), not a close')
    await load(PAGE, { now: NOV, rnd: 0 }, true); await sleep(5600)
    log(!(await popOn()), 'after "Don\'t show again today": not again the same day')
    await load(PAGE, { now: '2026-11-21T15:00:00Z', rnd: 0 }, true); await sleep(3600)
    log((await popOn()) && !(await ev(`!!document.querySelector('.lcobf-never')`)), 'the next day: it shows again, first display of the day has only the x (owner 2026-11-18)')
    await load(PAGE, { now: NOV, rnd: 0, legacyNever: true }); await sleep(3600)
    log(await popOn(), 'an old "never" (stored before 2026-11-18) holds no day: it shows')
    await load(PAGE, { now: NOV, rnd: 0 }); await ev(`localStorage.setItem('lco_bfpop25_off', 'sent'); localStorage.setItem('lco_otherpop_off', ${JSON.stringify('2026-11-20')}); true`)
    await load(PAGE, { now: NOV, rnd: 0 }, true); await sleep(3600)
    log(await popOn(), 'another campaign\'s opt-out or sent form (another id) does not hide this one')

    // 4. sending: the fields the server takes, product_id "Black Friday sale", thank-you, never again
    await load(PAGE, { now: NOV, rnd: 0 }); await sleep(3600)
    await ev(`document.querySelector('.lcobf .lcof-go').click(); true`); await sleep(200)
    log((await ev(`document.querySelector('.lcobf .lcof-msg').textContent`)) === 'Please tell us your name.' && (await ev(`window.__posts.length`)) === 0, 'empty form: "Please tell us your name.", nothing sent')
    log((await ev(`JSON.stringify(window.__tlc.filter((x) => x[0] === 'invalid').map((x) => x[3]))`)) === JSON.stringify(['name', 'email']), 'funnel: every refused field is told (name, email)')
    await fill('.lcobf form', { name: 'Test Buyer', email: 'buyer@example.com', phone: 'abc' })
    await ev(`document.querySelector('.lcobf .lcof-go').click(); true`); await sleep(200)
    log((await ev(`document.querySelector('.lcobf .lcof-msg').textContent`)) === 'Please check the phone number.' && (await ev(`window.__posts.length`)) === 0, 'bad phone: "Please check the phone number.", nothing sent')
    await fill('.lcobf form', { phone: '' })
    await ev(`document.querySelector('.lcobf .lcof-go').click(); true`); await sleep(500)
    const post = await ev(`window.__posts[0]`)
    const keys = post && post.entries ? post.entries.map((e) => e[0]).filter((k) => k !== 'src') : []
    const pid = post && post.entries ? (post.entries.find((e) => e[0] === 'product_id') || [])[1] : null
    log(!!post && post.method === 'POST' && post.url === '/api/inquiry' && keys.sort().join() === 'email,name,product_id' && pid === 'Black Friday sale' && !/member/i.test(pid),
      'sent as FormData to /api/inquiry: name, email, product_id "Black Friday sale" (no empty phone, no company / business_type, never "member")', `(${JSON.stringify(post)})`)
    log(/Thank you/.test(await ev(`document.querySelector('.lcobf .lcof-ok')?.textContent || ''`)) && (await ev(`localStorage.getItem('${OFF}')`)) === 'sent', 'sent: thank-you in the popup, kept off')
    await ev(`document.querySelector('.lcobf .lcof-ok + button').click(); true`)
    log(!(await popOn()) && (await ev(`JSON.stringify(window.__tlc.at(-1))`)) === JSON.stringify(['popup_closed', null, 'done', null]), 'funnel: the Close after sending is told as "done"')
    await load(PAGE, { now: NOV, rnd: 0 }, true); await sleep(5600)
    log(!(await popOn()), 'after sending: never shows again')
    await load(PAGE, { now: '2026-11-22T15:00:00Z', rnd: 0 }, true); await sleep(5600)
    log(!(await popOn()), 'after sending: not the next days either (a sent form holds for the campaign)')
    await load(PAGE, { now: NOV, rnd: 0 }); await sleep(3600)
    await fill('.lcobf form', { name: 'Test Buyer', email: 'buyer@example.com', phone: '(12) 34 ext 5' })
    await ev(`document.querySelector('.lcobf .lcof-go').click(); true`); await sleep(500)
    log((await ev(`(window.__posts[0].entries.find((e) => e[0] === 'phone') || [])[1]`)) === '(12) 34 ext 5', 'a phone in the server\'s format is sent')

    // 5. server answers in plain words: its own error on a 200 / 429, one fixed line for a 403
    await load(PAGE, { now: NOV, rnd: 0, reply: { status: 429, body: { ok: false, error: 'Please try again later or email us directly.' } } }); await sleep(3600)
    await fill('.lcobf form', { name: 'Test Buyer', email: 'buyer@example.com' })
    await ev(`document.querySelector('.lcobf .lcof-go').click(); true`); await sleep(500)
    log((await ev(`document.querySelector('.lcobf .lcof-msg').textContent`)) === 'Please try again later or email us directly.' && (await ev(`!localStorage.getItem('${OFF}')`)), '429: the server\'s words, the popup stays on')
    await load(PAGE, { now: NOV, rnd: 0, reply: { status: 403, body: { ok: false, error: 'forbidden' } } }); await sleep(3600)
    await fill('.lcobf form', { name: 'Test Buyer', email: 'buyer@example.com' })
    await ev(`document.querySelector('.lcobf .lcof-go').click(); true`); await sleep(500)
    log(/^Something went wrong\. Please try again, or email us at info@thelocalcabinetry\.com\.$/.test(await ev(`document.querySelector('.lcobf .lcof-msg').textContent`)), '403: a plain fixed line with our email, never "forbidden"')

    // 6. the end: Nov 30 end of day US Central = 2026-12-01T06:00Z
    await load(PAGE, { now: '2026-12-01T05:58:00Z', rnd: 0 }); await sleep(3600)
    log(await popOn(), 'Nov 30, 11:58 pm Central: shows')
    await load(PAGE, { now: '2026-12-01T06:00:01Z', rnd: 0 }); await sleep(5600)
    log(!(await popOn()), 'Dec 1, 12:00 am Central: never shows')

    // 7. never on /contact (no band there either); never over the open chat panel
    await load('/contact/', { now: NOV, rnd: 0 }); await sleep(5600)
    log(!(await popOn()) && !(await ev(`!!document.querySelector('.lcoband')`)), '/contact: no popup, no band')
    await load('/contact', { now: NOV, rnd: 0 }); await sleep(3600)
    log(!(await popOn()), '/contact without the slash: no popup')
    await load(PAGE, { now: NOV, rnd: 0 }); await sleep(1200)
    await ev(`document.querySelector('button[data-lco-chat]').click(); true`); await sleep(4400)
    log((await ev(`document.querySelector('button[data-lco-chat]').getAttribute('aria-expanded')`)) === 'true' && !(await popOn()), 'chat panel open: the popup does not show over it')

    // 7b. a first desktop visit: the welcome card (5 s) does not follow right after the popup on the same page
    await load(PAGE, { now: NOV, rnd: 0, welcome: true }); await sleep(3600)
    log(await popOn(), 'first visit: the popup shows at 3 s')
    await ev(`document.querySelector('.lcobf-x').click(); true`); await sleep(2600)
    log(!(await ev(`!!document.querySelector('.lcocat:not([hidden])')`)) && !(await ev(`localStorage.getItem('lco_welcome_v1')`)), 'the welcome card does not open right after it (it waits for a later page)')

    // 8. storage blocked: it shows (never hides by error), without the button it could not keep
    await load(PAGE, { now: NOV, rnd: 0, blocked: true }); await sleep(3600)
    log((await popOn()) && !(await ev(`!!document.querySelector('.lcobf-never')`)), 'storage blocked: it shows, no "Don\'t show" button')

    // 9. the contact band, right before the site footer
    await load(PAGE, { now: NOV, rnd: 0 }); await sleep(800)
    const band = await ev(`(() => { const b = document.querySelector('.lcoband'); if (!b) return null; return { next: b.nextElementSibling && b.nextElementSibling.matches('footer.site-footer'), h: b.querySelector('h2').textContent, sub: b.querySelector('.lcoband-sub').textContent,
      fields: [...b.querySelectorAll('input,select,textarea')].map((i) => i.name + (i.required ? '*' : '')), opts: [...b.querySelectorAll('select option')].map((o) => o.value), priv: b.querySelector('.lcof-c a')?.getAttribute('href'), mark: b.querySelector('.lcoband-div img')?.getAttribute('src'), count: document.querySelectorAll('.lcoband').length } })()`)
    log(!!band && band.next && band.count === 1 && band.h === 'Get a free design consultation' && !/same[- ]day/i.test(band.sub) && band.fields.join() === 'name*,email*,phone,project*,message,agree*' && band.opts.join() === ',Kitchen,Bathroom vanity,Closet,Other' && band.priv === '/policies#privacy' && /tlc-avatar/.test(band.mark),
      'band: one, right before footer.site-footer, heading, fields Name / Email / Phone / Project / Message / consent, the logo mark', `(${JSON.stringify(band)})`)
    await fill('.lcoband form', { name: 'Test Buyer', email: 'buyer@example.com', project: 'Kitchen', message: 'L-shape 10 x 12 ft' })
    await ev(`document.querySelector('.lcoband .lcof-go').click(); true`); await sleep(300)
    log(/privacy policy/.test(await ev(`document.querySelector('.lcoband .lcof-msg').textContent`)) && (await ev(`window.__posts.length`)) === 0, 'band: consent not ticked = a plain error, nothing sent')
    await fill('.lcoband form', { agree: true })
    await ev(`document.querySelector('.lcoband .lcof-go').click(); true`); await sleep(500)
    const bp = await ev(`window.__posts[0]`)
    const bk = bp && bp.entries ? bp.entries.map((e) => e[0]).filter((k) => k !== 'src') : []
    const bpid = bp && bp.entries ? (bp.entries.find((e) => e[0] === 'product_id') || [])[1] : null
    log(!!bp && bk.sort().join() === 'email,message,name,product_id' && bpid === 'Kitchen', 'band: sends name, email, message, product_id "Kitchen" (no project / agree / company / business_type)', `(${JSON.stringify(bp)})`)
    log(/Thank you/.test(await ev(`document.querySelector('.lcoband .lcof-ok')?.textContent || ''`)) && !(await ev(`!!document.querySelector('.lcoband form')`)) && (await ev(`localStorage.getItem('${OFF}')`)) === 'sent', 'band: thank-you inline; the sale popup stays away after it')
    await load('/', { now: NOV, rnd: 0 }); await sleep(800)
    log(await ev(`!!document.querySelector('.lcoband') && document.querySelector('.lcoband').nextElementSibling.tagName === 'FOOTER'`), 'home page: the band sits before the footer too')

    // 10. phones: 320 px, nothing wider than the screen; the popup fits (scrolls inside when it must)
    for (const [w, h] of [[320, 568], [375, 667]]) {
      await viewport(w, h, true)
      await load(PAGE, { now: NOV, rnd: 0 }); await sleep(3600)
      const fit = await ev(`(() => { const c = document.querySelector('.lcobf-card').getBoundingClientRect(); return { left: c.left, right: c.right, top: c.top, bottom: c.bottom, wide: document.documentElement.scrollWidth > innerWidth, iw: innerWidth, ih: innerHeight } })()`)
      log(fit.left >= 0 && fit.right <= fit.iw && fit.top >= 0 && fit.bottom <= fit.ih && !fit.wide, `${w} px: the popup fits the screen, no side scroll`, `(${JSON.stringify(fit)})`)
      if (w === 375) await shot('popup-375.png')
      await ev(`document.querySelector('.lcobf-x').click(); document.querySelector('.lcoband').scrollIntoView(); true`); await sleep(500)
      log(!(await ev(`document.documentElement.scrollWidth > innerWidth`)), `${w} px: the band has no side scroll`)
      if (w === 375) await shot('band-375.png', '.lcoband')
      // the second display on a small phone: Send and "Don't show this again" are on the screen without scrolling the card
      await load(PAGE, { now: NOV, rnd: 0 }, true); await sleep(3600)
      const vis = await ev(`(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight } ; return { send: r('.lcobf .lcof-go'), never: r('.lcobf-never') } })()`)
      log(vis.send === true && vis.never === true, `${w}x${h}: second display, Send and "Don't show this again" in view`, `(${JSON.stringify(vis)})`)
      if (w === 375) await shot('popup-375-second-display.png')
    }
    // 11. every page that loads chat.js: one band, right before the footer, full width, no side scroll (popup kept off)
    await viewport(1280, 900, false)
    const pages = []
    ;(function walk(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (!/^(\.git|node_modules|scripts|docs|deploy|content|logo-src|brand-kit)/.test(e.name)) walk(p) } else if (e.name === 'index.html' && fs.readFileSync(p, 'utf8').includes('src="/chat.js')) pages.push('/' + path.relative(ROOT, path.dirname(p)).split(path.sep).join('/') + (dir === ROOT ? '' : '/')) } })(ROOT)
    const badPages = []
    for (const pg of pages.map((x) => x.replace(/^\/\/$/, '/'))) {
      await load(pg, { now: NOV, popOff: true }); await sleep(600)
      const r = await ev(`(() => { const b = document.querySelectorAll('.lcoband'); const c = /^\\/contact\\/?$/.test(location.pathname); if (c) return b.length === 0 ? 'ok' : 'band on /contact'; if (b.length !== 1) return 'bands: ' + b.length; const n = b[0].nextElementSibling; if (!n || n.tagName !== 'FOOTER') return 'not before the footer'; if (Math.abs(b[0].getBoundingClientRect().width - document.documentElement.clientWidth) > 1) return 'width ' + b[0].getBoundingClientRect().width; if (document.documentElement.scrollWidth > innerWidth) return 'side scroll'; return 'ok' })()`)
      if (r !== 'ok') badPages.push(pg + ': ' + r)
    }
    log(pages.length >= 50 && badPages.length === 0, `all ${pages.length} pages with chat.js: one band right before the footer, full width, no side scroll (none on /contact)`, badPages.length ? JSON.stringify(badPages) : '')

    await load(PAGE, { now: NOV, rnd: 0 }); await sleep(3600)
    await load(PAGE, { now: NOV, rnd: 0 }, true); await sleep(3600)
    await shot('popup-1280-second-display.png')
    await load(PAGE, { now: NOV, rnd: 0 }); await sleep(3600)
    await shot('popup-1280.png')
    await ev(`document.querySelector('.lcobf-x').click(); document.querySelector('.lcoband').scrollIntoView({ block: 'center' }); true`); await sleep(600)
    await shot('band-1280.png', '.lcoband')
  } finally { try { ws && ws.close() } catch {} proc.kill('SIGTERM'); srv.close(); try { fs.rmSync(profile, { recursive: true, force: true }) } catch {} }
  console.log(fails.length ? `test-lead-forms: ${fails.length} FAILED` : 'test-lead-forms: OK')
  process.exit(fails.length ? 1 : 0)
}
main()
