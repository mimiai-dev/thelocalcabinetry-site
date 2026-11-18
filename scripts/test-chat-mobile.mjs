#!/usr/bin/env node
// Phone checks for chat.js (owner 2026-11-18: "the button asking for email isn't smooth", "chat experience on mobile is glitchy when the keyboard opens and closes",
// "one email per visitor … Edit", "while this menu is open on the phone, scrolling scrolls the whole page"):  node scripts/test-chat-mobile.mjs [--page /p/p_sliding_wardrobe/]
// Headless Chrome (CDP) with mobile emulation (390 x 844, touch, dpr 2). A headless browser has no on-screen keyboard, so window.visualViewport is replaced IN THE PAGE by a
// fake the test moves (height / offsetTop + resize and scroll events), as iOS Safari moves the real one; one case shrinks the real layout viewport instead (Android Chrome).
// The chat API (/design/api/visit/*) and /api/inquiry are stubbed in the page (window.fetch): nothing is sent anywhere. Exits 1 on any failed check.
//   A. opening the chat with a finger never pops the keyboard on its own (not on open, not when the config answer comes, not on the route tap);
//   B. the open panel follows the visual viewport (height and offsetTop), at most one write a frame; the composer stays on screen;
//   C. the newest line stays in view when the keyboard opens (the visual one, and a layout viewport that shrinks first) and when a line arrives (the composer does not move);
//   D. the page behind the chat panel, the site menu and the popup does not scroll; the position comes back on close;
//   E. every email field has the phone email keyboard (type, inputmode, autocomplete, autocapitalize, enterkeyhint), 16 px text, 44 px+ buttons, touch-action manipulation;
//   F. a submit cannot fire twice (Enter / requestSubmit while the first is on its way), the button shows it is busy at once;
//   G. an error message does not move anything (popup, band, chat email step, chat email line);
//   H. one email per visitor: the line under the chat header, Edit / Save (replace: true to the server), a sent form's address used by the chat and the other forms.
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
const VISIT = 'a'.repeat(32)
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const W = 390, H = 844

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

// page-side stubs: the fake visualViewport, storage presets, the chat API and /api/inquiry (with delays the test sets on window.__api)
function initSource({ visit = false, email = '', route = '', gate = 'off', needEmail = false, lines = 0, popup = false } = {}) {
  return `(() => {
    let vh = null, vt = 0
    const vv = new EventTarget()
    Object.defineProperties(vv, { height: { get: () => vh == null ? innerHeight : vh }, width: { get: () => innerWidth }, offsetTop: { get: () => vt }, offsetLeft: { get: () => 0 }, pageTop: { get: () => scrollY + vt }, pageLeft: { get: () => 0 }, scale: { get: () => 1 } })
    Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => vv })
    window.__vvFake = vv
    window.__vv = (h, t) => { vh = h; vt = t || 0; vv.dispatchEvent(new Event('resize')); vv.dispatchEvent(new Event('scroll')) }
    try {
      localStorage.setItem('lco_welcome_v1', '1')
      ${popup ? '' : `localStorage.setItem('lco_bfpop26_off', 'sent')`}
      ${visit ? `localStorage.setItem('lco_visit_v1', '${VISIT}')` : ''}
      ${email ? `localStorage.setItem('lco_email_v1', ${JSON.stringify(email)})` : ''}
      ${route ? `sessionStorage.setItem('lco_route_v1', ${JSON.stringify(route)})` : ''}
    } catch (e) {}
    ${popup ? 'Math.random = () => 0;' : ''}
    const lines = []; for (let i = 1; i <= ${lines}; i++) lines.push({ seq: i, from: i % 2 ? 'us' : 'you', text: 'Line ' + i + ': a few words about the kitchen, so the bubble has some height.', at: '2026-01-05T10:00:00Z' })
    window.__api = { gate: ${JSON.stringify(gate)}, needEmail: ${needEmail}, lines, emails: [], posts: [], inquiries: [], emailDelay: 0, inqDelay: 0 }
    const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } })
    const later = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms))
    const real = window.fetch.bind(window)
    window.fetch = (url, opt = {}) => {
      const u = new URL(String(url), location.href), a = window.__api
      if (u.pathname.startsWith('/design/api/visit/')) {
        const p = u.pathname.slice('/design/api/visit/'.length)
        if (p === 'config') return Promise.resolve(json({ enabled: true, email_gate: a.gate, stream: false, long_poll: false }))
        if (p === 'message') { a.posts.push(JSON.parse(opt.body || '{}')); a.sentAt = performance.now(); if (a.ackOnPost) a.lines.push({ seq: a.lines.length + 1, from: 'us', text: a.ackOnPost, at: new Date().toISOString() }); return Promise.resolve(json({ ok: true, conversation: '${VISIT}', seq: 1000 + a.posts.length, mode: 'ai' })) }
        if (p === 'messages') { const after = Number(u.searchParams.get('after') || 0); return Promise.resolve(json({ messages: a.lines.filter((m) => m.seq > after), last_seq: a.lines.length, mode: 'ai', typing: false, read_seq: 0, need_email: a.needEmail })) }
        if (p === 'email') { a.emails.push(JSON.parse(opt.body || '{}')); return later(a.emailDelay, json({ ok: true })) }
        return Promise.resolve(json({ ok: true }))
      }
      if (u.pathname === '/api/inquiry') { a.inquiries.push(opt.body && opt.body.entries ? Object.fromEntries([...opt.body.entries()].map(([k, v]) => [k, String(v)])) : {}); return later(a.inqDelay, json({ ok: true })) }
      return real(url, opt)
    }
  })()`
}

async function main() {
  const srv = await serve(), base = `http://127.0.0.1:${srv.address().port}`
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lco-chatmobile-'))
  const port = 9300 + Math.floor(Math.random() * 150)   // never 9222 (the owner's Chrome)
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })
  let ws, id = 0, initId = null
  const pending = new Map(), errors = []
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) console.log('eval error:', r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value }
  const fails = [], log = (ok, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? ' ' + extra : ''}`); if (!ok) fails.push(what) }
  const phone = async (w = W, h = H) => { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true }); await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }) }
  const load = async (url, opts = {}) => {
    if (initId) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: initId })
    await send('Storage.clearDataForOrigin', { origin: base, storageTypes: 'local_storage,session_storage' })
    initId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: initSource(opts) })).identifier
    await send('Page.navigate', { url: base + url })
    await sleep(900)
  }
  const tapAt = async (x, y) => { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }) }
  const tap = async (sel) => { const r = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null })()`); if (r) await tapAt(r.x, r.y); return !!r }
  const typing = `(() => { const a = document.activeElement; return !!a && /^(INPUT|TEXTAREA)$/.test(a.tagName) })()`
  const rect = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top * 10) / 10, bottom: Math.round(r.bottom * 10) / 10, height: Math.round(r.height * 10) / 10 } })()`)
  // the email keyboard and target checks for one field and its submit button
  const emailOk = (inp, btn) => ev(`(() => { const i = document.querySelector(${JSON.stringify(inp)}), b = document.querySelector(${JSON.stringify(btn)}); if (!i || !b) return { missing: !i ? 'input' : 'button' }
    const cs = getComputedStyle(i), bs = getComputedStyle(b), br = b.getBoundingClientRect()
    return { type: i.type, inputmode: i.getAttribute('inputmode'), autocomplete: i.getAttribute('autocomplete'), autocapitalize: i.getAttribute('autocapitalize'), enterkeyhint: i.getAttribute('enterkeyhint'), spell: i.spellcheck,
      font: parseFloat(cs.fontSize), ih: Math.round(i.getBoundingClientRect().height), bh: Math.round(br.height), touch: bs.touchAction } })()`)
  const emailAttrsGood = (r) => !!r && r.type === 'email' && r.inputmode === 'email' && r.autocomplete === 'email' && r.autocapitalize === 'off' && r.enterkeyhint === 'send' && r.spell === false && r.font >= 16 && r.ih >= 44 && r.bh >= 44 && /manipulation/.test(r.touch)
  try {
    let targets
    for (let i = 0; i < 160; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break } catch { await sleep(250) } }
    ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
    await new Promise((r) => ws.addEventListener('open', r))
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data)
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m.error || {}); pending.delete(m.id) }
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)
    })
    await send('Page.enable'); await send('Runtime.enable')
    await phone()

    // 0. the fake visualViewport is what chat.js reads
    await load(PAGE, { route: 'ai', gate: 'first' })
    log(await ev(`window.visualViewport === window.__vvFake && typeof window.__vv === 'function'`), 'the fake visualViewport is installed before chat.js runs')

    // A. a finger opens the chat: no keyboard on its own
    await tap('button[data-lco-chat]'); await sleep(900)   // the config answer (email_gate first) has come and the email step shows
    log((await ev(`!document.querySelector('.lcochat-gate').hidden`)) && !(await ev(typing)), 'tap open with the email step: the step shows, no field focused (no keyboard pops)', `(active: ${await ev('document.activeElement && document.activeElement.className')})`)
    const gateAttr = await emailOk('.lcochat-gate input', '.lcochat-gate-go')
    log(emailAttrsGood(gateAttr), 'chat email step: email keyboard, 16 px, 44 px+ field and button, touch-action manipulation', `(${JSON.stringify(gateAttr)})`)
    // G. the error does not move the field or the button
    const g0 = { i: await rect('.lcochat-gate input'), b: await rect('.lcochat-gate-go') }
    await ev(`(() => { const i = document.querySelector('.lcochat-gate input'); i.value = 'not-an-email'; i.form.requestSubmit(); return true })()`); await sleep(150)
    const g1 = { i: await rect('.lcochat-gate input'), b: await rect('.lcochat-gate-go'), msg: await ev(`document.querySelector('.lcochat-gate-msg').textContent`) }
    log(!!g1.msg && g0.i.top === g1.i.top && g0.b.top === g1.b.top, 'chat email step: the error shows without moving the field or the button', `(${JSON.stringify({ g0, g1 })})`)
    // the keyboard is up in the email field; Start chat moves it to the message box in the same task (it does not drop and come back)
    const moved = await ev(`(() => { const i = document.querySelector('.lcochat-gate input'); i.focus(); i.value = 'buyer@example.com'; i.form.requestSubmit(); return document.activeElement === document.querySelector('.lcochat-panel textarea') })()`)
    log(moved, 'Start chat with the keyboard up: the message box has the focus at once (the keyboard stays)')
    await sleep(200)
    const line = await ev(`(() => { const m = document.querySelector('.lcochat-mail'); return m && !m.hidden ? m.textContent : null })()`)
    log(!!line && /buyer@example\.com/.test(line) && /Edit/.test(line) && (await ev(`localStorage.getItem('lco_email_v1')`)) === 'buyer@example.com', 'after the step: the line under the header shows the address with Edit', `(${line})`)

    await load(PAGE, { gate: 'first' })
    await tap('button[data-lco-chat]'); await sleep(700)
    await tap('.lcoroute-b.ai'); await sleep(700)
    log(!(await ev(typing)), 'route tap "AI assistant" with a finger: no field focused (the room chips stay in view, no keyboard)', `(active: ${await ev('document.activeElement && document.activeElement.tagName')})`)

    // B + D. a conversation; the page was scrolled; the panel locks the page and follows the visual viewport
    await load(PAGE, { visit: true, email: 'old@example.com', lines: 30 })
    await ev(`window.scrollTo({ top: 1500, behavior: 'instant' }); true`); await sleep(1100)   // the chat button hides while the page scrolls down and is back ~600 ms later
    const y0 = await ev(`Math.round(scrollY)`)
    await tap('button[data-lco-chat]'); await sleep(1200)
    const lk = await ev(`({ pos: document.body.style.position, top: document.body.style.top, open: document.querySelector('button[data-lco-chat]').getAttribute('aria-expanded') })`)
    log(lk.open === 'true' && lk.pos === 'fixed' && lk.top === `-${y0}px`, 'chat open on a phone: the page behind is locked where it was', `(${JSON.stringify(lk)}, was at ${y0})`)
    log(!(await ev(typing)), 'tap open with a conversation: no field focused')
    let p = await rect('.lcochat-panel')
    log(p && Math.abs(p.top) <= 1 && Math.abs(p.height - H) <= 1, 'panel = the whole visual viewport', `(${JSON.stringify(p)})`)
    const lastIn = `(() => { const l = document.querySelector('.lcochat-log'), r = [...l.querySelectorAll('.lcochat-r')].pop(); if (!r) return null; const a = r.getBoundingClientRect(), b = l.getBoundingClientRect(); return { ok: a.bottom <= b.bottom + 2 && a.top >= b.top - 2, row: Math.round(a.bottom), log: Math.round(b.bottom) } })()`
    log((await ev(lastIn))?.ok === true, 'the newest line is in view after opening', `(${JSON.stringify(await ev(lastIn))})`)
    // the keyboard opens (iOS: the visual viewport shrinks to 500)
    await ev(`window.__vv(500, 0); true`); await sleep(120)
    p = await rect('.lcochat-panel'); let bx = await rect('.lcochat-box'), tx = await rect('.lcochat-panel textarea')
    log(p && Math.abs(p.top) <= 1 && Math.abs(p.height - 500) <= 1 && bx.bottom <= 501 && tx.bottom <= 500 && tx.top >= 0, 'keyboard up (visual viewport 500): panel 500 tall, the composer and its box on screen above it', `(${JSON.stringify({ p, bx, tx })})`)
    log((await ev(lastIn))?.ok === true, 'keyboard up: the newest line still in view', `(${JSON.stringify(await ev(lastIn))})`)
    // iOS pans the visual viewport (offsetTop 200): the panel moves with it, the composer stays at its bottom
    await ev(`window.__vv(500, 200); true`); await sleep(120)
    p = await rect('.lcochat-panel'); bx = await rect('.lcochat-box')
    log(p && Math.abs(p.top - 200) <= 1 && Math.abs(bx.bottom - 700) <= 1, 'visual viewport panned (offsetTop 200): panel top 200, composer bottom at 700', `(${JSON.stringify({ p, bx })})`)
    // many events in one frame: one write
    const writes = await ev(`new Promise((done) => { let n = 0; const mo = new MutationObserver((r) => { n += r.length }); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
      for (let i = 0; i < 30; i++) window.__vv(480 + (i % 5), 0)
      requestAnimationFrame(() => requestAnimationFrame(() => { mo.disconnect(); done(n) })) })`)
    log(writes >= 1 && writes <= 4, '30 visualViewport events in one frame: written once a frame, not 30 times', `(${writes} style writes)`)
    // the keyboard closes
    await ev(`window.__vv(null, 0); true`); await sleep(120)
    p = await rect('.lcochat-panel')
    log(p && Math.abs(p.top) <= 1 && Math.abs(p.height - H) <= 1, 'keyboard down: panel back to the whole screen', `(${JSON.stringify(p)})`)
    // Android Chrome: the LAYOUT viewport shrinks (no visualViewport event first); the newest line stays in view
    await phone(W, 480); await sleep(400)
    p = await rect('.lcochat-panel'); bx = await rect('.lcochat-box')
    log(p && p.height <= 481 && bx.bottom <= 481, 'layout viewport shrinks to 480 (Android keyboard): panel and composer fit', `(${JSON.stringify({ p, bx })})`)
    log((await ev(lastIn))?.ok === true, 'layout viewport shrinks: the newest line still in view', `(${JSON.stringify(await ev(lastIn))})`)
    await phone(); await sleep(400)
    // C. a line arrives: the composer does not move, the line is in view
    const box0 = await rect('.lcochat-box')
    await ev(`window.__api.lines.push({ seq: 31, from: 'us', text: 'A new reply with a few words in it.', at: new Date().toISOString() }); true`); await sleep(7500)
    const box1 = await rect('.lcochat-box'), got = await ev(`[...document.querySelectorAll('.lcochat-r.us .lcochat-m')].some((m) => /A new reply/.test(m.textContent))`)
    log(got && box0.top === box1.top && (await ev(lastIn))?.ok === true, 'a new line arrives: drawn, in view, the composer did not move', `(${JSON.stringify({ got, box0, box1 })})`)

    // I. a fixed acknowledgement right after the visitor's line: typing dots first, the line no sooner than ~1.2 s after Send (owner 2026-11-18: "it's too fast, so unnatural")
    await ev(`(() => { const a = window.__api; a.ackOnPost = "Got it, I'll get that in! Our designer is working on your layout now and will work it in."; window.__ack = null; window.__dotsBefore = false
      new MutationObserver(() => { if (window.__ack) return; if (document.querySelector('.lcochat-typing')) window.__dotsBefore = true
        if ([...document.querySelectorAll('.lcochat-r.us .lcochat-m')].some((m) => /Got it, I'll get that in/.test(m.textContent))) window.__ack = performance.now() }).observe(document.querySelector('.lcochat-log'), { childList: true, subtree: true })
      const t = document.querySelector('.lcochat-panel textarea'); t.value = 'remove the crown for me'; t.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
    await tap('.lcochat-send'); await sleep(4000)
    const ack = await ev(`({ gap: window.__ack && window.__api.sentAt ? Math.round(window.__ack - window.__api.sentAt) : null, dots: window.__dotsBefore })`)
    log(ack.gap != null && ack.gap >= 1150 && ack.gap <= 3800 && ack.dots, 'a fixed acknowledgement: typing dots first, then the line 1.2-3 s after Send (never instant)', `(${JSON.stringify(ack)})`)

    // H. the email line: Edit, an error without a jump, Save once (replace: true), the new address everywhere
    log(/old@example\.com/.test(await ev(`document.querySelector('.lcochat-mail').textContent`)), 'email line shows the stored address')
    await tap('.lcochat-mail-e'); await sleep(200)
    const ed = await emailOk('.lcochat-mail input', '.lcochat-mail-s')
    log(emailAttrsGood(ed) && (await ev(`document.querySelector('.lcochat-mail input').value`)) === 'old@example.com' && !!(await ev(`document.querySelector('.lcochat-mail-c')`)), 'Edit: one field with the address, Save and Cancel; email keyboard, 16 px, 44 px+', `(${JSON.stringify(ed)})`)
    const m0 = await rect('.lcochat-mail')
    await ev(`(() => { const i = document.querySelector('.lcochat-mail input'); i.value = 'old@'; i.form.requestSubmit(); return true })()`); await sleep(100)
    const m1 = await rect('.lcochat-mail')
    log((await ev(`(document.querySelector('.lcochat-mail-msg') || {}).textContent`)) !== '' && !!m0 && !!m1 && m0.height === m1.height, 'email line: the error shows in its reserved slot (no jump)', `(${JSON.stringify({ m0, m1 })})`)
    const dbl = await ev(`(() => { window.__api.emailDelay = 600; const i = document.querySelector('.lcochat-mail input'); i.value = 'New@Example.com'; i.form.requestSubmit(); const b = document.querySelector('.lcochat-mail-s'); const busy = b.getAttribute('aria-busy') === 'true' && b.disabled; i.form.requestSubmit(); i.form.requestSubmit(); return busy })()`)
    log(dbl, 'Save: busy at once (aria-busy, disabled)')
    await sleep(900)
    const em = await ev(`({ posts: window.__api.emails, ls: localStorage.getItem('lco_email_v1'), line: document.querySelector('.lcochat-mail').textContent, editing: document.querySelector('.lcochat-mail').classList.contains('editing') })`)
    log(em.posts.length === 1 && em.posts[0].email === 'new@example.com' && em.posts[0].replace === true, 'Save pressed three times: ONE POST visit/email { email, replace: true }', `(${JSON.stringify(em.posts)})`)
    log(em.ls === 'new@example.com' && /new@example\.com/.test(em.line) && !em.editing, 'saved: stored for the site, the line shows the new address', `(${JSON.stringify(em)})`)
    log((await ev(`document.querySelector('.lcoband input[name=email]').value`)) === 'new@example.com', 'saved: the contact band\'s email field has the new address too')
    // D. close: the page is back where it was
    await tap('.lcochat-hb button.lcochat-x'); await sleep(500)
    const after = await ev(`({ y: Math.round(scrollY), pos: document.body.style.position, hide: document.querySelector('button[data-lco-chat]').classList.contains('lcochat-hide') })`)
    log(Math.abs(after.y - y0) <= 2 && after.pos === '' && !after.hide, 'close: the page is back at the same place, unlocked, the chat button shown', `(${JSON.stringify(after)}, was ${y0})`)

    // the server needs an address for this chat (need_email): the line opens for editing, no Cancel, no keyboard on its own
    await load(PAGE, { visit: true, needEmail: true, lines: 2 })
    await tap('button[data-lco-chat]'); await sleep(1500)
    const ne = await ev(`(() => { const m = document.querySelector('.lcochat-mail'); return { editing: !!m && !m.hidden && m.classList.contains('editing'), cancel: !!document.querySelector('.lcochat-mail-c'), card: !!document.querySelector('.lcochat-ask'), chipsOff: [...document.querySelectorAll('.lcochat-chip')].every((c) => c.disabled) } })()`)
    log(ne.editing && !ne.cancel && !ne.card && !(await ev(typing)), 'need_email: the email line asks (no Cancel, no card in the thread), no field focused', `(${JSON.stringify(ne)})`)

    // E + F + G + H. the Black Friday popup on a phone
    await load(PAGE, { popup: true, route: 'ai', gate: 'first' }); await sleep(3400)
    log(await ev(`!!document.querySelector('.lcobf')`), 'popup shows')
    log((await ev(`document.body.style.position`)) === 'fixed', 'popup open on a phone: the page behind is locked')
    const pa = await emailOk('.lcobf input[name=email]', '.lcobf .lcof-go')
    log(emailAttrsGood(pa), 'popup email: email keyboard, 16 px, 44 px+ field and Send, touch-action manipulation', `(${JSON.stringify(pa)})`)
    const c0 = { card: await rect('.lcobf-card'), go: await rect('.lcobf .lcof-go'), priv: await rect('.lcobf .lcof-slot') }
    await ev(`document.querySelector('.lcobf form').requestSubmit(); true`); await sleep(150)
    const c1 = { card: await rect('.lcobf-card'), go: await rect('.lcobf .lcof-go'), priv: await rect('.lcobf .lcof-slot'), msg: await ev(`document.querySelector('.lcobf .lcof-msg').textContent`) }
    log(!!c1.msg && c0.card.height === c1.card.height && c0.go.top === c1.go.top && c0.priv.height === c1.priv.height, 'popup: the error takes the privacy line\'s place, nothing moves', `(${JSON.stringify({ c0, c1 })})`)
    await ev(`(() => { const f = document.querySelector('.lcobf form'); f.elements.name.value = 'Test Buyer'; f.elements.email.value = 'Pop@Example.com'; return true })()`)
    const pb = await ev(`(() => { window.__api.inqDelay = 600; const f = document.querySelector('.lcobf form'); f.requestSubmit(); const b = f.querySelector('.lcof-go'); const busy = b.getAttribute('aria-busy') === 'true' && b.disabled; f.requestSubmit(); f.requestSubmit(); return busy })()`)
    log(pb, 'popup Send: busy at once')
    await sleep(900)
    log((await ev(`window.__api.inquiries.length`)) === 1, 'popup Send pressed three times: ONE post to /api/inquiry', `(${await ev(`window.__api.inquiries.length`)})`)
    log((await ev(`localStorage.getItem('lco_email_v1')`)) === 'pop@example.com' && (await ev(`document.querySelector('.lcoband input[name=email]').value`)) === 'pop@example.com', 'popup sent: its address is the visitor\'s address (stored, in the band\'s field)')
    await ev(`document.querySelector('.lcof-ok + button').click(); true`); await sleep(300)
    log((await ev(`document.body.style.position`)) === '', 'popup closed: the page is unlocked')
    // the chat now knows the address: no email step, the line shows it
    await tap('button[data-lco-chat]'); await sleep(900)
    const known = await ev(`({ gate: !document.querySelector('.lcochat-gate').hidden, line: (document.querySelector('.lcochat-mail:not([hidden])') || {}).textContent || '' })`)
    log(!known.gate && /pop@example\.com/.test(known.line), 'chat after the popup: no email step, the line shows the popup\'s address', `(${JSON.stringify(known)})`)
    await tap('.lcochat-hb button.lcochat-x'); await sleep(300)

    // the contact band
    await load(PAGE)
    await ev(`document.querySelector('.lcoband').scrollIntoView({ block: 'center', behavior: 'instant' }); true`); await sleep(300)
    const ba = await emailOk('.lcoband input[name=email]', '.lcoband .lcof-go')
    log(emailAttrsGood(ba), 'band email: email keyboard, 16 px, 44 px+ field and button, touch-action manipulation', `(${JSON.stringify(ba)})`)
    const b0 = { band: await rect('.lcoband'), go: await rect('.lcoband .lcof-go') }
    await ev(`document.querySelector('.lcoband form').requestSubmit(); true`); await sleep(150)
    const b1 = { band: await rect('.lcoband'), go: await rect('.lcoband .lcof-go'), msg: await ev(`document.querySelector('.lcoband .lcof-msg').textContent`) }
    log(!!b1.msg && b0.band.height === b1.band.height && b0.go.top === b1.go.top, 'band: the error shows in its reserved slot, nothing moves', `(${JSON.stringify({ b0, b1 })})`)
    const fh = (await rect('.lcoband form')).height
    await ev(`(() => { const f = document.querySelector('.lcoband form'); f.elements.name.value = 'Test Buyer'; f.elements.email.value = 'band@example.com'; f.elements.project.value = 'Kitchen'; f.elements.agree.checked = true; return true })()`)
    const bb = await ev(`(() => { window.__api.inqDelay = 600; const f = document.querySelector('.lcoband form'); f.requestSubmit(); const busy = f.querySelector('.lcof-go').getAttribute('aria-busy') === 'true'; f.requestSubmit(); return busy })()`)
    await sleep(900)
    log(bb && (await ev(`window.__api.inquiries.length`)) === 1, 'band Send: busy at once, ONE post for two submits')
    const bandH = await ev(`(() => { const d = document.querySelector('.lcoband .lcof-ok'); return d ? Math.round(d.getBoundingClientRect().height) : 0 })()`)
    log(bandH >= Math.round(fh) - 1, 'band sent: the thank-you keeps the form\'s height (the page below does not jump up)', `(${bandH} px, form was ${fh})`)

    // the site's own lead form (/contact)
    await load('/contact/')
    const ct = await ev(`(() => { const i = document.querySelector('form[data-lead] input[type=email]'); return i ? { inputmode: i.getAttribute('inputmode'), cap: i.getAttribute('autocapitalize'), key: i.getAttribute('enterkeyhint'), font: parseFloat(getComputedStyle(i).fontSize) } : null })()`)
    log(!!ct && ct.inputmode === 'email' && ct.cap === 'off' && ct.key === 'send' && ct.font >= 16, '/contact form email: email keyboard and 16 px on a phone', `(${JSON.stringify(ct)})`)

    // D. the site menu on a phone: the page behind does not scroll, the menu scrolls itself, the place comes back
    await load(PAGE)
    // down, then a little up: the header (hidden while scrolling down) comes back, as when a visitor reaches for the menu
    await ev(`window.scrollTo({ top: 1500, behavior: 'instant' }); true`); await sleep(300)
    await ev(`window.scrollTo({ top: 1440, behavior: 'instant' }); true`); await sleep(400)
    const ny = await ev(`Math.round(scrollY)`)
    await tap('#site-nav .nav-toggle'); await sleep(400)
    const nv = await ev(`(() => { const n = document.getElementById('site-nav'), h = document.querySelector('.hdr').getBoundingClientRect(), cs = getComputedStyle(n); return { open: n.classList.contains('is-open'), pos: document.body.style.position, hdrTop: Math.round(h.top), over: cs.overflowY, ob: cs.overscrollBehaviorY, max: parseFloat(n.style.maxHeight) || 0, bottom: Math.round(n.getBoundingClientRect().bottom) } })()`)
    log(nv.open && nv.pos === 'fixed' && Math.abs(nv.hdrTop) <= 1 && nv.over === 'auto' && nv.ob === 'contain' && nv.max > 0 && nv.bottom <= H + 1, 'menu open on a phone: page locked, the header in view, the menu scrolls inside (overscroll contained) and fits the screen', `(${JSON.stringify(nv)})`)
    await send('Input.synthesizeScrollGesture', { x: 200, y: 800, yDistance: -400, speed: 2000, gestureSourceType: 'touch' }); await sleep(300)
    log((await ev(`document.body.style.top`)) === `-${ny}px` && (await ev(`Math.round(scrollY)`)) === 0, 'menu open: a swipe does not move the page behind')
    await tap('#site-nav .nav-toggle'); await sleep(400)
    const na = await ev(`({ y: Math.round(scrollY), pos: document.body.style.position, hide: document.querySelector('.hdr').classList.contains('hdr-hide') })`)
    log(Math.abs(na.y - ny) <= 2 && na.pos === '' && !na.hide, 'menu closed: back at the same place, unlocked, the header still shown', `(${JSON.stringify(na)}, was ${ny})`)

    log(errors.length === 0, 'no page errors', errors.length ? JSON.stringify(errors.slice(0, 5)) : '')
  } finally { try { ws && ws.close() } catch {} proc.kill('SIGTERM'); srv.close(); try { fs.rmSync(profile, { recursive: true, force: true }) } catch {} }
  console.log(fails.length ? `test-chat-mobile: ${fails.length} FAILED` : 'test-chat-mobile: OK')
  process.exit(fails.length ? 1 : 0)
}
main()
