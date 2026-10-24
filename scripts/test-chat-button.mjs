#!/usr/bin/env node
// Chat button browser test:  node scripts/test-chat-button.mjs [--base http://127.0.0.1:8080] [--page /p/p_sliding_wardrobe/]
// Headless Chrome (CDP) at 390 px (touch) and 1280 px (mouse). The chat API (/design/api/visit/*) is stubbed in the browser, nothing is sent.
// 1. a fresh visitor: ONE tap/click on "Chat with us" opens the "AI assistant / Talk to a person" choice;
// 2. the owner's sequence with a running conversation: open, type and send a message, close with the x, then
//    scroll down (button hidden the whole time, no flicker between the pill and the round icon), stop (back within ~1 s and stays),
//    scroll up (shown), page end (shown); while the chat is open it is never hidden.
// 3. honest states (stubbed server state, no page timers): no typing dots after sending until the server says typing: true;
//    "Seen" from read_seq; a holding line is drawn and the answer stays owed; with the panel closed the page keeps asking while
//    a reply is owed and shows an unread dot (label says so); opening clears it.
// Serves the repo root itself without --base. Exits 1 on any failed check.
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

// canned API answers (the page only needs ok shapes)
// `api` is the scripted server state the test moves through (section 3)
const api = { typing: false, read: 0, lines: [] }
function stub(url, method) {
  const u = new URL(url)
  const p = u.pathname.replace('/design/api/visit/', '')
  if (p === 'config') return { enabled: true, email_gate: 'off' }
  if (p === 'message' && method === 'POST') return { ok: true, conversation: VISIT, seq: 1, mode: 'ai' }
  if (p.startsWith('messages')) {
    const after = Number(u.searchParams.get('after') || 0)
    const msgs = api.lines.filter((m) => m.seq > after)
    return { messages: msgs, last_seq: Math.max(0, ...api.lines.map((m) => m.seq)), mode: 'ai', typing: api.typing, read_seq: api.read, ...(api.working ? { working: api.working } : {}) }
  }
  return { ok: true }
}

async function main() {
  let srv = null, base = arg('--base')
  if (!base) { srv = await serve(); base = `http://127.0.0.1:${srv.address().port}` }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lco-chatbtn-'))
  const port = 9800 + Math.floor(Math.random() * 150)
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })
  let ws, id = 0
  const pending = new Map()
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value
  const fails = [], log = (ok, vp, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} @${vp} ${what}${extra ? ' ' + extra : ''}`); if (!ok) fails.push(`${vp} ${what}`) }
  try {
    let targets
    for (let i = 0; i < 160; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break } catch { await sleep(250) } }
    ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
    await new Promise((r) => ws.addEventListener('open', r))
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data)
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || {}); pending.delete(m.id) }
      if (process.env.DEBUG && m.method === 'Runtime.exceptionThrown') console.log('page error:', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)
      if (process.env.DEBUG && m.method === 'Fetch.requestPaused') console.log('api', m.params.request.method, m.params.request.url.replace(/^.*visit\//, ''))
      if (m.method === 'Fetch.requestPaused') {
        const body = Buffer.from(JSON.stringify(stub(m.params.request.url, m.params.request.method))).toString('base64')
        send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'application/json' }], body })
      }
    })
    await send('Page.enable'); await send('Runtime.enable')
    await send('Fetch.enable', { patterns: [{ urlPattern: '*/design/api/visit/*' }] })
    // the catalog popup never appears during the test
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('lco_catalog_pop_v1', '1') } catch (e) {}` })

    const btnState = `(() => { const b = document.querySelector('button[data-lco-chat]'); const r = b.getBoundingClientRect(); return { hide: b.classList.contains('lcochat-hide'), sm: b.classList.contains('lcochat-sm'), open: b.getAttribute('aria-expanded') === 'true', x: r.x + r.width / 2, y: r.y + r.height / 2, w: Math.round(b.offsetWidth), end: innerHeight + scrollY >= document.documentElement.scrollHeight - 4 } })()`
    for (const vp of [{ name: '390', width: 390, height: 844, dpr: 2, mobile: true, touch: true }, { name: '1280', width: 1280, height: 900, dpr: 1, mobile: false, touch: false }]) {
      await send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr, mobile: vp.mobile })
      await send('Emulation.setTouchEmulationEnabled', { enabled: vp.touch, maxTouchPoints: vp.touch ? 5 : 0 })
      const tap = async (x, y) => {
        if (vp.touch) { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }) }
        else { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }) }
      }
      const wheel = async (dy, steps) => {   // a real user scroll (wheel at 1280, a finger swipe at 390)
        const out = []
        for (let i = 0; i < steps; i++) {
          if (vp.touch) await send('Input.synthesizeScrollGesture', { x: 200, y: 600, yDistance: -dy, speed: 2000, gestureSourceType: 'touch' })
          else await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 640, y: 450, deltaX: 0, deltaY: dy })
          await sleep(70)
          out.push(await ev(btnState))
        }
        return out
      }
      const clickSel = async (sel) => { const r = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`); if (r) await tap(r.x, r.y); return !!r }

      // 1. fresh visitor: one tap opens the choice
      await send('Runtime.evaluate', { expression: `try { localStorage.removeItem('lco_visit_v1') } catch (e) {}` })
      await send('Page.navigate', { url: base + PAGE }); await sleep(2500)
      let s = await ev(btnState)
      await tap(s.x, s.y); await sleep(600)
      const cards = await ev(`[...document.querySelectorAll('.lcoroute-b')].filter(e => e.getBoundingClientRect().width > 0).length`)
      log(cards >= 2, vp.name, 'one tap opens the "How would you like to chat?" choice', `(${cards} choice cards)`)

      // 2. the owner's sequence, with a conversation already running
      await send('Runtime.evaluate', { expression: `localStorage.setItem('lco_visit_v1', '${VISIT}')` })
      await send('Page.navigate', { url: base + PAGE }); await sleep(2500)
      s = await ev(btnState)
      await tap(s.x, s.y); await sleep(500)
      s = await ev(btnState)
      log(s.open, vp.name, 'open: panel open')
      await ev(`(() => { const t = document.querySelector('.lcochat-panel textarea'); t.value = 'Hi, can you quote a 10 ft closet wall?'; t.dispatchEvent(new Event('input', { bubbles: true })) })()`)
      await clickSel('.lcochat-send'); await sleep(800)
      const sentOk = await ev(`document.querySelector('.lcochat-panel textarea').value === ''`)
      log(sentOk, vp.name, 'send: message accepted (stubbed API)')
      // scrolling the page behind an open chat never hides the button (desktop; on phones the panel covers the page)
      if (!vp.mobile) { const w = await wheel(240, 3); log(w.every((x) => !x.hide), vp.name, 'chat open + page scrolled: button never hidden') }
      await clickSel('.lcochat-panel .lcochat-hb button.lcochat-x'); await sleep(500)
      s = await ev(btnState)
      log(!s.open && !s.hide, vp.name, 'close: button back, chat closed')
      await ev(`window.scrollTo(0, 0)`); await sleep(900)
      // scroll down: hidden the whole time, and no pill/round flicker
      const down = await wheel(240, 8)
      const hiddenAll = down.slice(1).every((x) => x.hide || x.end)   // at the page end it comes back by design
      const flips = down.reduce((n, x, i) => n + (i && x.sm !== down[i - 1].sm ? 1 : 0), 0)
      log(hiddenAll, vp.name, 'after send+close, scrolling down: button hidden', `(${down.map((x) => (x.end ? 'E' : x.hide ? 'h' : 'v')).join('')})`)
      log(flips === 0, vp.name, 'after send+close, scrolling down: no pill/round flicker', `(${flips} flips)`)
      // stop: back within ~1 s, then stays put
      await sleep(1100)
      const st1 = await ev(btnState); await sleep(800); const st2 = await ev(btnState)
      log(!st1.hide && !st2.hide && st1.sm === st2.sm, vp.name, 'scrolling stopped: button back and steady')
      // scroll up: shown
      const up = await wheel(-240, 3)
      log(up.every((x) => !x.hide), vp.name, 'scrolling up: button shown')
      // page end: shown
      await ev(`window.scrollTo(0, document.documentElement.scrollHeight)`); await sleep(400)
      s = await ev(btnState)
      log(!s.hide, vp.name, 'page end: button shown')
      // and it still opens with one tap after all that
      await tap(s.x, s.y); await sleep(500)
      s = await ev(btnState)
      log(s.open, vp.name, 'one tap after scrolling opens the chat again')

      // 3. honest states
      Object.assign(api, { typing: false, read: 0, lines: [] })
      await send('Page.navigate', { url: base + PAGE }); await sleep(2500)
      s = await ev(btnState); await tap(s.x, s.y); await sleep(500)
      await ev(`(() => { const t = document.querySelector('.lcochat-panel textarea'); t.value = 'Do you ship to Ohio?'; t.dispatchEvent(new Event('input', { bubbles: true })) })()`)
      await clickSel('.lcochat-send'); await sleep(3000)
      const dots = `!!document.querySelector('.lcochat-typing')`
      log(!(await ev(dots)), vp.name, 'after sending, no typing dots while the server says nothing is being written')
      api.lines.push({ seq: 1, from: 'you', text: 'Do you ship to Ohio?', at: new Date().toISOString() })
      api.read = 1; await sleep(2600)
      log(await ev(`[...document.querySelectorAll('.lcochat-seenl')].some(e => /Seen|已读/.test(e.textContent))`), vp.name, '"Seen" once the server has read the line (read_seq)')
      api.typing = true; await sleep(2600)
      log(await ev(dots), vp.name, 'typing dots while the server says a reply is being written (typing: true)')
      api.lines.push({ seq: 2, from: 'us', holding: true, text: 'Thanks, let me check that for you, one moment.', at: new Date().toISOString() })
      await sleep(2600)
      log(await ev(`document.querySelector('.lcochat-log').textContent.includes('let me check that')`), vp.name, 'holding line drawn')
      // close while the real answer is still owed: the page keeps asking and shows a dot when it lands
      await clickSel('.lcochat-panel .lcochat-hb button.lcochat-x'); await sleep(400)
      api.typing = false
      api.lines.push({ seq: 3, from: 'us', text: 'Yes, we ship to Ohio from our Ohio warehouse.', at: new Date().toISOString() })
      await sleep(6500)
      const un = await ev(`(() => { const b = document.querySelector('button[data-lco-chat]'); return { dot: !!b.querySelector('.lcochat-unread'), label: b.getAttribute('aria-label') } })()`)
      log(un.dot && /new message|新消息/.test(un.label), vp.name, 'panel closed: the owed answer still arrives, unread dot + label', `(${un.label})`)
      s = await ev(btnState); await tap(s.x, s.y); await sleep(600)
      const after = await ev(`(() => { const b = document.querySelector('button[data-lco-chat]'); return { dot: !!b.querySelector('.lcochat-unread'), dots: !!document.querySelector('.lcochat-typing'), answer: document.querySelector('.lcochat-log').textContent.includes('Ohio warehouse') } })()`)
      log(!after.dot && !after.dots && after.answer, vp.name, 'opening shows the answer, clears the dot, no dots left')
      // 4a. the real step while a reply is owed: the typing line says it, and follows it (owner 2026-10-24, T-261024-11)
      api.working = { step: 'checking', text: 'Checking your sizes…' }; await sleep(7000)   // the poll has backed off after the quiet stretch above
      const cap = `(document.querySelector('.lcochat-typing .lcochat-tcap') || {}).textContent || ''`
      log((await ev(cap)) === 'Checking your sizes…', vp.name, 'the typing line shows the real step (working)')
      api.working = { step: 'rendering', text: 'Rendering the 3D view…' }; await sleep(2800)
      log((await ev(cap)) === 'Rendering the 3D view…', vp.name, 'and follows it to the next step')
      api.working = null; await sleep(2800)
      log(!(await ev(`!!document.querySelector('.lcochat-typing')`)), vp.name, 'nothing owed: the line goes')
      // 4b. the measure question's guide: a link button to our own how-to-measure page under the bubble (T-261024-13)
      api.lines.push({ seq: 5, from: 'us', text: 'Thanks, noted. What are the wall lengths?', upload: true, link: { label: 'How to measure your kitchen', url: 'https://thelocalcabinetry.com/how-to-measure-your-kitchen/' }, at: new Date().toISOString() })
      api.lines.push({ seq: 6, from: 'us', text: 'Bad link test', link: { label: 'Elsewhere', url: 'https://example.com/x' }, at: new Date().toISOString() })
      await sleep(5000)
      const gd = await ev(`[...document.querySelectorAll('.lcochat-guide')].map((a) => a.textContent + '|' + a.getAttribute('href'))`)
      log(gd.length === 1 && gd[0] === 'How to measure your kitchen|https://thelocalcabinetry.com/how-to-measure-your-kitchen/', vp.name, 'the measure guide is a link button; a foreign link is never drawn', `(${JSON.stringify(gd)})`)
      // 4. a fresh scripted reply (the guided start's next question, with chips) pauses on the typing line first, like a person (owner 2026-10-24, T-261024-10)
      await ev(`(() => { window.__t = {}; const lg = document.querySelector('.lcochat-log'); new MutationObserver(() => { const now = performance.now(); if (!window.__t.typing && document.querySelector('.lcochat-typing')) window.__t.typing = now; if (!window.__t.line && lg.textContent.includes('Which door style')) window.__t.line = now }).observe(lg, { childList: true, subtree: true, characterData: true }) })()`)
      api.lines.push({ seq: 7, from: 'us', text: 'Which door style do you like?', chips: [{ label: 'Shaker', value: 'door:shaker' }, { label: 'Flat slab', value: 'door:slab' }], at: new Date().toISOString() })
      await sleep(5500)
      const tt = await ev(`window.__t`)
      log(!!(tt.typing && tt.line && tt.line - tt.typing >= 600), vp.name, 'a fresh scripted reply shows the typing line first, then the question', `(${tt.line && tt.typing ? Math.round(tt.line - tt.typing) : '?'} ms)`)
      log(await ev(`!!document.querySelector('.lcochat-chips') && !document.querySelector('.lcochat-typing')`), vp.name, 'its chips are there and the typing line is gone')
      await clickSel('.lcochat-panel .lcochat-hb button.lcochat-x'); await sleep(300)
    }
  } finally { try { ws && ws.close() } catch {} proc.kill('SIGTERM'); if (srv) srv.close() }
  console.log(fails.length ? `test-chat-button: ${fails.length} FAILED` : 'test-chat-button: OK')
  process.exit(fails.length ? 1 : 0)
}
main()
