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
const api = { typing: false, read: 0, lines: [], posts: [] }
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
      // our signed file links (visit/file/<id>?s=…) answer with a real picture, so the bubble's <img> loads and lays out as on the site
      if (m.method === 'Fetch.requestPaused' && /\/visit\/file\/[\w-]+\?s=/.test(m.params.request.url)) {
        send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'image/jpeg' }], body: fs.readFileSync(path.join(ROOT, 'og-home.jpg')).toString('base64') })
      } else if (m.method === 'Fetch.requestPaused') {
        if (m.params.request.method === 'POST' && /\/visit\/message$/.test(m.params.request.url)) { try { api.posts.push(JSON.parse(m.params.request.postData || '{}')) } catch {} }
        const body = Buffer.from(JSON.stringify(stub(m.params.request.url, m.params.request.method))).toString('base64')
        send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'application/json' }], body })
      }
    })
    await send('Page.enable'); await send('Runtime.enable')
    await send('Fetch.enable', { patterns: [{ urlPattern: '*/design/api/visit/*' }] })
    // the catalog popup never appears during the test
    const preset = await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('lco_welcome_v1', '1'); localStorage.setItem('lco_ann_v1', '1') } catch (e) {}` })

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
      // 4c. the files WE send (BT-261027-568, 2026-11-04: Plan.png and the 3D views showed as "Photo sent: Plan.png", nothing to open; 2026-11-06 the owner: "like a person
      //     sending photos"): one picture as wide as the bubble, several in a two-column grid of square tiles, each loaded from its signed same-origin link and opening it full size;
      //     a PDF is a file card (badge, name, "Tap to open", 48 px tall); the "[File] …" label is not shown, a link that is not ours is never drawn, nothing scrolls sideways
      api.lines.push({ seq: 8, from: 'us', text: '[File] Plan.png (398687 B)', files: [
        { name: 'Plan.png', type: 'image/png', url: '/design/api/visit/file/f7cd022e-148d?s=0123abcd' },
        { name: 'Quote.pdf', type: 'application/pdf', url: '/design/api/visit/file/0a1b2c3d-4e5f?s=4567ef01' },
        { name: 'x.png', type: 'image/png', url: 'https://example.com/x.png' }], at: new Date().toISOString() })
      api.lines.push({ seq: 9, from: 'us', text: "Here's your layout: 3D views.", files: ['top wall', 'whole room', 'right wall', 'bottom wall'].map((w, i) => (
        { name: `3D view, ${w}.jpg`, type: 'image/jpeg', url: `/design/api/visit/file/3d0${i}-aaaa?s=89ab${i}` })), at: new Date().toISOString() })
      await sleep(5000)
      const ff = await ev(`(() => {
        const lg = document.getElementsByClassName('lcochat-log')[0], r = (e) => e.getBoundingClientRect()
        const groups = [...lg.getElementsByClassName('lcochat-pics')].map((g) => {
          const bub = r(g.closest('.lcochat-m'))
          return { grid: g.classList.contains('n2'), pics: [...g.getElementsByTagName('a')].map((a) => { const im = a.getElementsByTagName('img')[0], b = r(im); return { href: a.getAttribute('href'), target: a.getAttribute('target'), alt: im.alt, loaded: im.complete && im.naturalWidth > 0, w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.left), inside: b.left >= bub.left - 1 && b.right <= bub.right + 1 } }) }
        })
        const cards = [...lg.getElementsByClassName('lcochat-file')].map((a) => ({ text: a.textContent, href: a.getAttribute('href'), target: a.getAttribute('target'), h: Math.round(r(a).height) }))
        return { groups, cards, foreign: !!lg.querySelector('img[src^="https:"]'), label: lg.textContent.includes('[File] Plan.png'), sent: lg.textContent.includes('Photo sent: Plan.png'),
          side: lg.scrollWidth > lg.clientWidth + 1, bottom: lg.scrollHeight - lg.scrollTop - lg.clientHeight < 80 }
      })()`)
      const [one, four] = ff.groups
      log(ff.groups.length === 2 && one && !one.grid && one.pics.length === 1 && one.pics[0].href === '/design/api/visit/file/f7cd022e-148d?s=0123abcd' && one.pics[0].target === '_blank' && one.pics[0].loaded && one.pics[0].w >= (vp.mobile ? 150 : 200) && one.pics[0].inside,
        vp.name, 'one picture of ours: drawn in the bubble from its signed link, loaded, as wide as the bubble, tap opens it full size', `(${JSON.stringify(one)})`)
      log(!!four && four.grid && four.pics.length === 4 && four.pics.every((p) => p.loaded && p.inside && p.target === '_blank' && Math.abs(p.w - p.h) <= 2 && p.w >= (vp.mobile ? 90 : 110)) && new Set(four.pics.map((p) => p.x)).size === 2 && four.pics[1].alt === '3D view, whole room.jpg',
        vp.name, 'four 3D views: a two-column grid of square tiles, all loaded, each opens its picture', `(${JSON.stringify(four)})`)
      log(ff.cards.length === 1 && /^PDF/.test(ff.cards[0].text) && ff.cards[0].text.includes('Quote.pdf') && ff.cards[0].text.includes('Tap to open') && ff.cards[0].href === '/design/api/visit/file/0a1b2c3d-4e5f?s=4567ef01' && ff.cards[0].target === '_blank' && ff.cards[0].h >= 48,
        vp.name, 'our PDF: a file card (PDF badge, its name, Tap to open, 48 px tall) on its signed link', `(${JSON.stringify(ff.cards)})`)
      log(!ff.foreign && !ff.label && !ff.sent && !ff.side && ff.bottom, vp.name, 'no foreign link, no "[File]" label, no "Photo sent", no sideways scroll; the pictures loading keep the reader at the bottom', `(${JSON.stringify({ foreign: ff.foreign, label: ff.label, sent: ff.sent, side: ff.side, bottom: ff.bottom })})`)
      // 4d. the finish step as /design draws it (web-portal CR finish-preview-other, owner 2026-11-10): a finish chip (it has `line`) shows its door picture from the signed same-origin
      //     link in `img`, with a magnifier beside it; hover (1280) or the magnifier (390) opens a large preview card (picture, name, line, "Choose …") above the chips, and Choose picks
      //     it like the chip; a finish with no picture keeps its colour dot; an img on another host is never drawn (the page allows img-src 'self'); Other colour / Skip stay plain chips
      api.lines.push({ seq: 10, from: 'us', text: 'Shaker it is. Which finish?', chips: [
        { label: 'Floral Espresso', value: 'finish:floral-espresso', swatch: '#4a3426', line: 'Essential shaker', img: '/design/api/visit/file/fin-espresso-01?s=a1b2c3d4' },
        { label: 'Pure White', value: 'finish:pure-white', swatch: '#f4f3ef', line: 'Essential shaker' },
        { label: 'Sage Green', value: 'finish:sage-green', swatch: '#8a9a7b', line: 'Essential shaker', img: 'https://example.com/sage.jpg' },
        { label: 'Other colour', value: 'finish:other' }, { label: 'Skip', value: 'finish:skip' }], at: new Date().toISOString() })
      await sleep(5500)
      const fc = await ev(`(() => {
        const box = document.getElementsByClassName('lcochat-chips'), b = box[box.length - 1]
        if (!b) return null
        return [...b.getElementsByClassName('lcochat-chip')].map((c) => { const im = c.getElementsByTagName('img')[0]; return { t: c.textContent, img: im ? im.getAttribute('src') : null, loaded: !!im && im.complete && im.naturalWidth > 0, dot: !!c.getElementsByClassName('lcochat-sw')[0], zoom: !!(c.parentNode.classList.contains('lcochat-qkw') && c.parentNode.getElementsByClassName('lcochat-qkz')[0]) } })
      })()`)
      log(Array.isArray(fc) && fc.length === 5 && fc[0].img === '/design/api/visit/file/fin-espresso-01?s=a1b2c3d4' && fc[0].loaded && !fc[0].dot && fc[0].zoom,
        vp.name, 'a finish chip with a picture: drawn from its signed link, loaded, with a magnifier', `(${JSON.stringify(fc)})`)
      log(!!fc && fc[1].img === null && fc[1].dot && fc[1].zoom && fc[2].img === null && fc[2].dot && fc[2].zoom && !fc[3].zoom && !fc[3].dot && !fc[4].zoom,
        vp.name, 'no picture keeps the colour dot; a picture on another host is never drawn; Other colour / Skip are plain chips')
      const fz = await ev(`(() => { const z = document.getElementsByClassName('lcochat-qkz'), e = z[z.length - 3], c = e.parentNode.firstChild, r = c.getBoundingClientRect(), q = e.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, zx: q.x + q.width / 2, zy: q.y + q.height / 2 } })()`)
      if (vp.touch) await tap(fz.zx, fz.zy); else await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: fz.cx, y: fz.cy })
      await sleep(400)
      const pv = await ev(`(() => { const p = document.getElementsByClassName('lcochat-qkp')[0]; if (!p) return null; const im = p.getElementsByTagName('img')[0], r = p.getBoundingClientRect(), lg = document.getElementsByClassName('lcochat-log')[0]
        return { label: p.getAttribute('aria-label'), name: p.getElementsByTagName('b')[0].textContent, line: p.getElementsByTagName('span')[0].textContent, img: im && im.getAttribute('src'), loaded: !!im && im.complete && im.naturalWidth > 0, w: im ? Math.round(im.getBoundingClientRect().width) : 0,
          go: p.getElementsByClassName('lcochat-qkp-go')[0].textContent, above: r.bottom <= p.nextSibling.getBoundingClientRect().top + 1, side: lg.scrollWidth > lg.clientWidth + 1 } })()`)
      log(!!pv && pv.label === 'Floral Espresso preview' && pv.name === 'Floral Espresso' && pv.line === 'Essential shaker' && pv.img === '/design/api/visit/file/fin-espresso-01?s=a1b2c3d4' && pv.loaded && pv.w >= 100 && pv.go === 'Choose Floral Espresso' && pv.above && !pv.side,
        vp.name, vp.touch ? 'the magnifier opens the preview card: door picture, name, line, Choose; above the chips, no sideways scroll' : 'hovering the chip opens the preview card: door picture, name, line, Choose; above the chips, no sideways scroll', `(${JSON.stringify(pv)})`)
      if (process.env.SHOT_DIR) { const s = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(process.env.SHOT_DIR, `finish-preview-${vp.name}.png`), Buffer.from(s.data, 'base64')) }
      if (!vp.touch) {   // Escape closes the card, not the chat
        await ev(`document.getElementsByClassName('lcochat-qkp-go')[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`); await sleep(200)
        log(!(await ev(`!!document.getElementsByClassName('lcochat-qkp')[0]`)) && (await ev(`document.querySelector('button[data-lco-chat]').getAttribute('aria-expanded')`)) === 'true', vp.name, 'Escape closes the preview card and leaves the chat open')
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 }); await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: fz.cx, y: fz.cy }); await sleep(300)
      }
      const n0 = api.posts.length
      await clickSel('.lcochat-qkp-go'); await sleep(800)
      const last = api.posts[api.posts.length - 1]
      log(api.posts.length === n0 + 1 && !!last && last.chip === 'finish:floral-espresso' && last.text === 'Floral Espresso' && !(await ev(`!!document.getElementsByClassName('lcochat-qkp')[0]`)),
        vp.name, '"Choose Floral Espresso" picks it like the chip (one post, its chip value) and closes the card', `(${JSON.stringify(last)})`)
      await clickSel('.lcochat-panel .lcochat-hb button.lcochat-x'); await sleep(300)
    }
    // 5. a first visit (owner 2026-10-24, T-261024-23: "I don't see the first open up banner ever"; "a welcome banner on first visit and a top announcement bar"):
    //    the top bar on the page, closable for good; the welcome card ~5 s in at 1280 (its "Design my room" opens the chat), once per browser
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: preset.identifier })
    // the Black Friday bar (owner 2026-10-31) holds the top place until 2026-11-30: sections 5 and 6 test the membership bar, so they run on a page whose clock is moved to 2026-12-05 (time still flows)
    const decStub = await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const R = Date, off = new R(2026, 11, 5, 12).getTime() - R.now(); class D extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + off) } static now() { return R.now() + off } } window.Date = D })()` })
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
    await send('Emulation.setTouchEmulationEnabled', { enabled: false, maxTouchPoints: 0 })
    await send('Page.navigate', { url: base + PAGE }); await sleep(1500)
    await ev(`localStorage.removeItem('lco_welcome_v1'); localStorage.removeItem('lco_ann_v2'); localStorage.removeItem('lco_visit_v1'); true`)
    await send('Page.navigate', { url: base + PAGE }); await sleep(2000)
    const bar = `(() => { const b = document.querySelector('.lcoann'); return b && !b.hidden ? b.textContent : null })()`
    log(/first month of membership free: 10% off/.test(String(await ev(bar))) && (await ev(`document.body.firstElementChild.classList.contains('lcoann')`)), '1280', 'first visit: the announcement bar (the free-month offer, T-261025-20) is at the top of the page')
    log((await ev(`document.querySelector('.lcoann a').getAttribute('href')`)) === '/member/annual/?offer=free-month', '1280', '"Claim it" goes to the membership form with the offer')
    log(!(await ev(`!!document.querySelector('.lcocat:not([hidden])')`)), '1280', 'no welcome card in the first seconds')
    await sleep(4500)
    const wc = await ev(`(() => { const c = document.querySelector('.lcocat:not([hidden])'); return c ? [...c.querySelectorAll('h2,button,a')].map((x) => x.textContent) : null })()`)
    log(Array.isArray(wc) && wc[0] === 'Welcome to The Local Cabinetry' && wc.includes('Design my room') && wc.includes('Download the catalog'), '1280', 'the welcome card opens ~5 s in', `(${JSON.stringify(wc)})`)
    await ev(`[...document.querySelectorAll('.lcocat button')].find((b) => b.textContent === 'Design my room').click(); true`); await sleep(500)
    log((await ev(`!!document.querySelector('.lcocat[hidden]')`)) && (await ev(`document.querySelector('button[data-lco-chat]').getAttribute('aria-expanded')`)) === 'true', '1280', '"Design my room" closes the card and opens the chat')
    await ev(`document.querySelector('.lcoann-x').click(); true`)
    await send('Page.navigate', { url: base + PAGE }); await sleep(7000)
    log(!(await ev(bar)) && !(await ev(`!!document.querySelector('.lcocat:not([hidden])')`)), '1280', 'next visit: the closed bar and the seen card stay away')
    // 6. the claim (T-261025-20): /member/annual/?offer=free-month at phone width: the form's product_id carries the offer, the note and the button say it, the bar fits (no side scroll)
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
    await ev(`localStorage.removeItem('lco_ann_v2'); true`)
    await send('Page.navigate', { url: base + '/member/annual/?offer=free-month' }); await sleep(2000)
    const claim = await ev(`(() => { const f = document.querySelector('form.member-form'); return f && { pid: f.querySelector('input[name=product_id]').value, btn: f.querySelector('button[type=submit]').textContent, note: !!document.querySelector('.lcooffer'), wide: document.documentElement.scrollWidth > innerWidth, bar: !!document.querySelector('.lcoann:not([hidden])') } })()`)
    log(!!claim && claim.pid === 'Member application: free first month' && claim.btn === 'Claim my free month' && claim.note && claim.bar && !claim.wide, '390', 'the claim page: offer on the form, note, button; bar fits the phone', `(${JSON.stringify(claim)})`)
    await send('Page.navigate', { url: base + '/member/annual/' }); await sleep(1500)
    log((await ev(`document.querySelector('form.member-form input[name=product_id]').value`)) === 'Member application' && !(await ev(`!!document.querySelector('.lcooffer')`)), '390', 'the plain membership form claims nothing')
    // 7. the Black Friday bar (owner 2026-10-31), on the real clock, only while it is in force (until 2026-11-30)
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: decStub.identifier })
    const today = new Date(), ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    if (ymd <= '2026-11-30') {
      await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
      await send('Page.navigate', { url: base + PAGE }); await sleep(1000)
      await ev(`localStorage.removeItem('lco_ann_bf26_v1'); true`)
      await send('Page.navigate', { url: base + PAGE }); await sleep(2000)
      const bf = await ev(`(() => { const b = document.querySelector('.lcoann'); if (!b || b.hidden) return null; const [go, det] = b.querySelectorAll('a'); return { t: b.textContent, bg: getComputedStyle(b).backgroundColor, go: go.getAttribute('href'), det: det && det.getAttribute('href'), wide: document.documentElement.scrollWidth > innerWidth, first: document.body.firstElementChild === b } })()`)
      log(!!bf && /Black Friday/.test(bf.t) && /save 10% on your order/.test(bf.t) && bf.bg === 'rgb(0, 0, 0)' && bf.go === '/design' && bf.det === '/black-friday/' && bf.first && !bf.wide, '390', 'the Black Friday bar: black, a fixed 10% (fbfba5e, #125, owner 2026-10-31), Plan my kitchen -> /design, Details -> /black-friday/, no side scroll', `(${JSON.stringify(bf)})`)
      await ev(`document.querySelector('.lcoann-x').click(); true`)
      await send('Page.navigate', { url: base + PAGE }); await sleep(2000)
      log(!(await ev(bar)), '390', 'closed Black Friday bar stays closed (its own key)')
    }
  } finally { try { ws && ws.close() } catch {} proc.kill('SIGTERM'); if (srv) srv.close() }
  console.log(fails.length ? `test-chat-button: ${fails.length} FAILED` : 'test-chat-button: OK')
  process.exit(fails.length ? 1 : 0)
}
main()
