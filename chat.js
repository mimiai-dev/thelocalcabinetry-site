/* Chat bubble for thelocalcabinetry.com. One same-origin file: no third party, no cookie, no account.
 *
 *   <script src="/chat.js" defer data-label="Chat with us"></script>
 *
 * It replaces the old floating link (luxova-contact.js). The corner button looks and sits the same (bottom right, dark navy pill,
 * chat-bubble icon) but opens a panel. Lines go to OUR server (same origin, /design/api/visit/*) and land with the team; the
 * replies come back into the panel (polling). The panel keeps a clear link to the full design tool (/design).
 *
 * Sends NOTHING until the visitor presses Send on a first message: no request on page load, none when the panel opens
 * (the old conversation, if the browser kept one, is only re-read). The server mints the conversation id on the first message;
 * it is kept in this browser's localStorage under lco_visit_v1 and sent in the x-lco-visit header (never in a URL).
 * Text only: every string from the server is put in with textContent, never as HTML.
 * CSP (meta tag): script-src 'self', connect-src 'self', style-src allows the one inline <style> this file adds. No change needed.
 *
 * Honest wording: the panel says who answers (the team and the shop's assistant) and shows a holding line while no reply has come.
 * If the server answers "closed" (kill switch), is unreachable, or an older server does not know the path, the panel says so and
 * points to the design tool. Nothing is invented here: the welcome line and every reply come from the desk.
 */
(function () {
  'use strict'
  if (window.__lcoChat) return
  window.__lcoChat = true
  var s = document.currentScript
  var label = ((s && s.dataset && s.dataset.label) || 'Chat with us').trim().slice(0, 40)
  var DESIGN = '/design'
  var API = '/design/api/visit/'
  var KEY = 'lco_visit_v1'
  var MAX_TEXT = 1200, MAX_PHOTO = 5 * 1024 * 1024

  var state = { id: null, last: 0, open: false, busy: false, timer: 0, idleSince: Date.now(), seen: {}, files: [], closed: false, lastFrom: '' }
  try { var saved = localStorage.getItem(KEY); if (saved && /^[0-9a-f]{32}$/.test(saved)) state.id = saved } catch (e) { /* storage blocked: memory only */ }
  function remember() { try { if (state.id) localStorage.setItem(KEY, state.id); else localStorage.removeItem(KEY) } catch (e) { /* ignore */ } }

  function el(tag, cls, text) {
    var n = document.createElement(tag)
    if (cls) n.className = cls
    if (text != null) n.textContent = text
    return n
  }
  function svg(d) {
    var NS = 'http://www.w3.org/2000/svg', v = document.createElementNS(NS, 'svg')
    ;[['width', '18'], ['height', '18'], ['viewBox', '0 0 24 24'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '2'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round'], ['aria-hidden', 'true']].forEach(function (kv) { v.setAttribute(kv[0], kv[1]) })
    var p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); v.appendChild(p)
    return v
  }

  var CSS = [
    '.lcochat-btn{position:fixed;right:16px;bottom:16px;z-index:2147483000;display:inline-flex;align-items:center;gap:8px;min-height:48px;padding:0 20px;border:0;border-radius:999px;background:#0e2740;color:#fff;cursor:pointer;',
    'font:600 15px/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 6px 24px rgba(8,20,34,.25)}',
    '.lcochat-btn:hover{background:#14365a}',
    '.lcochat-btn svg{flex:0 0 18px}',
    '.lcochat-btn:focus-visible,.lcochat-panel button:focus-visible,.lcochat-panel a:focus-visible,.lcochat-panel textarea:focus-visible,.lcochat-panel input:focus-visible{outline:3px solid #b4862f;outline-offset:2px}',
    '.lcochat-panel{position:fixed;right:16px;bottom:76px;z-index:2147483001;width:360px;max-width:calc(100vw - 32px);height:min(560px,calc(100dvh - 100px));display:flex;flex-direction:column;background:#fff;color:#1b2733;',
    'border-radius:14px;box-shadow:0 12px 40px rgba(8,20,34,.3);overflow:hidden;font:15px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}',
    '.lcochat-panel[hidden]{display:none}',
    '.lcochat-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px;background:#0e2740;color:#fff}',
    '.lcochat-head h2{margin:0;font:600 16px/1.2 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#fff}',
    '.lcochat-x{min-width:44px;min-height:44px;margin:-8px -8px -8px 0;border:0;background:transparent;color:#fff;font-size:24px;line-height:1;cursor:pointer;border-radius:8px}',
    '.lcochat-note{padding:8px 14px;background:#f3efe7;color:#4a3d31;font-size:13px}',
    '.lcochat-log{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:8px;background:#fafaf8}',
    '.lcochat-m{max-width:85%;padding:8px 12px;border-radius:12px;white-space:pre-wrap;overflow-wrap:anywhere}',
    '.lcochat-m.you{align-self:flex-end;background:#0e2740;color:#fff;border-bottom-right-radius:4px}',
    '.lcochat-m.us{align-self:flex-start;background:#fff;border:1px solid #e3ded4;border-bottom-left-radius:4px}',
    '.lcochat-m small{display:block;margin-top:4px;opacity:.75;font-size:12px}',
    '.lcochat-hold,.lcochat-err{padding:6px 14px;font-size:13px}',
    '.lcochat-hold{background:#f3efe7;color:#4a3d31}',
    '.lcochat-err{background:#fdecea;color:#8a1c12}',
    '.lcochat-err[hidden],.lcochat-hold[hidden]{display:none}',
    '.lcochat-box{display:flex;flex-direction:column;gap:6px;padding:10px 14px;border-top:1px solid #e3ded4;background:#fff}',
    '.lcochat-row{display:flex;gap:8px;align-items:flex-end}',
    '.lcochat-box textarea{flex:1;min-height:44px;max-height:120px;resize:none;padding:10px;border:1px solid #bdb6a8;border-radius:10px;font:inherit;color:inherit}',
    '.lcochat-send,.lcochat-mini{min-height:44px;padding:0 16px;border:0;border-radius:10px;background:#0e2740;color:#fff;font:600 14px/1 system-ui,sans-serif;cursor:pointer}',
    '.lcochat-send:disabled,.lcochat-mini:disabled{opacity:.5;cursor:default}',
    '.lcochat-mini.alt{background:#fff;color:#0e2740;border:1px solid #0e2740}',
    '.lcochat-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:13px}',
    '.lcochat-tools button.lnk{min-height:44px;padding:0 4px;border:0;background:transparent;color:#0e2740;text-decoration:underline;cursor:pointer;font:inherit}',
    '.lcochat-email{display:flex;gap:8px}',
    '.lcochat-email[hidden]{display:none}',
    '.lcochat-email input{flex:1;min-height:44px;padding:0 10px;border:1px solid #bdb6a8;border-radius:10px;font:inherit}',
    '.lcochat-foot{padding:8px 14px 12px;font-size:13px;border-top:1px solid #e3ded4;background:#fff}',
    '.lcochat-foot a{color:#0e2740;font-weight:600}',
    '@media (max-width:520px){.lcochat-panel{right:8px;left:8px;bottom:8px;width:auto;max-width:none;height:min(78dvh,640px)}.lcochat-btn.open{display:none}}',
    '@media print{.lcochat-btn,.lcochat-panel{display:none}}'
  ].join('')

  var btn, panel, log, hold, err, ta, sendB, photoIn, photoB, chips, emailRow, emailIn, emailMsg

  function headers(extra) {
    var h = { 'x-lco-design': '1' }
    if (state.id) h['x-lco-visit'] = state.id
    for (var k in extra) h[k] = extra[k]
    return h
  }
  function showErr(t) { err.textContent = t || ''; err.hidden = !t }
  function fallback(msg) {
    showErr(msg || 'Chat is not available right now. You can still open the full design tool and leave a message there.')
  }

  function paintHold() {
    // the holding line: our own words about the wait, never a chat message and never from the server
    hold.hidden = !(state.id && state.lastFrom === 'you')
  }
  function addMsg(m) {
    if (state.seen[m.seq]) return
    state.seen[m.seq] = 1
    var b = el('div', 'lcochat-m ' + (m.from === 'us' ? 'us' : 'you'), String(m.text || ''))
    if (m.photos && m.photos.length) {
      var names = m.photos.map(function (p) { return String(p && p.name || 'photo') }).join(', ')
      b.appendChild(el('small', '', 'Photo sent: ' + names))
    }
    log.appendChild(b)
    state.last = Math.max(state.last, m.seq)
    state.lastFrom = m.from === 'us' ? 'us' : 'you'
  }
  function scrollDown() { log.scrollTop = log.scrollHeight }

  function poll() {
    clearTimeout(state.timer)
    if (!state.id || !state.open) return
    if (document.hidden) { state.timer = setTimeout(poll, 8000); return }
    fetch(API + 'messages?after=' + state.last, { headers: headers(), cache: 'no-store' }).then(function (r) {
      if (r.status === 404 || r.status === 400) { // the server does not know this conversation (any more): start clean on the next message
        state.id = null; state.last = 0; state.seen = {}; state.lastFrom = ''; remember(); log.textContent = ''; paintHold(); return null
      }
      if (r.status === 429) { state.timer = setTimeout(poll, 30000); return null }
      if (r.status === 503) { fallback(); return null }
      if (!r.ok) throw new Error('x')
      return r.json()
    }).then(function (j) {
      if (!j) return
      showErr('')
      var fresh = (j.messages || []).length
      ;(j.messages || []).forEach(addMsg)
      if (fresh) { state.idleSince = Date.now(); scrollDown() }
      paintHold()
      var idle = Date.now() - state.idleSince
      state.timer = setTimeout(poll, idle < 120000 ? 4000 : idle < 600000 ? 8000 : 15000)
    }).catch(function () { state.timer = setTimeout(poll, 15000) })
  }

  function send() {
    if (state.busy) return
    var text = ta.value.trim()
    if (!text && !state.files.length) return
    if (text.length > MAX_TEXT) { showErr('That is a bit long. Please keep it under ' + MAX_TEXT + ' characters.'); return }
    state.busy = true; sendB.disabled = true; showErr('')
    var body = { text: text }
    if (state.files.length) body.file_ids = state.files.map(function (f) { return f.id })
    fetch(API + 'message', { method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify(body), cache: 'no-store' }).then(function (r) {
      return r.json().catch(function () { return {} }).then(function (j) { return { s: r.status, j: j } })
    }).then(function (x) {
      state.busy = false; sendB.disabled = false
      if (x.s === 200 && x.j && x.j.ok) {
        if (x.j.conversation) { state.id = x.j.conversation; remember(); photoB.disabled = false; emailMsg.textContent = '' }
        ta.value = ''; state.files = []; paintChips(); state.idleSince = Date.now()
        poll()
        return
      }
      if (x.s === 404 && state.id) { state.id = null; state.last = 0; state.seen = {}; state.lastFrom = ''; remember(); log.textContent = ''; showErr('That chat had ended. Please send your message again.'); return }
      if (x.s === 429) return showErr('Please slow down a little and try again in a minute.')
      if (x.s === 413) return showErr('That message is too long.')
      if (x.s === 503 || x.s === 403 || x.s === 404) return fallback()
      showErr((x.j && x.j.message) || 'Sorry, that did not send. Please try again.')
    }).catch(function () { state.busy = false; sendB.disabled = false; fallback('We could not reach the server. Please try again, or open the full design tool.') })
  }

  function paintChips() {
    chips.textContent = ''
    state.files.forEach(function (f, i) {
      var c = el('button', 'lcochat-mini alt', 'Photo: ' + f.name + '  ×')
      c.type = 'button'
      c.setAttribute('aria-label', 'Remove photo ' + f.name)
      c.addEventListener('click', function () { state.files.splice(i, 1); paintChips() })
      chips.appendChild(c)
    })
  }
  function pickPhoto() {
    var f = photoIn.files && photoIn.files[0]
    photoIn.value = ''
    if (!f || !state.id) return
    if (!/^image\//.test(f.type)) return showErr('Please choose a photo (JPEG, PNG, WebP or HEIC).')
    if (f.size > MAX_PHOTO) return showErr('That photo is over 5 MB. Please choose a smaller one.')
    if (state.files.length >= 3) return showErr('Three photos at most in one message.')
    showErr('')
    fetch(API + 'file', { method: 'POST', headers: headers({ 'x-file-name': encodeURIComponent(f.name.slice(0, 80)), 'content-type': 'application/octet-stream' }), body: f, cache: 'no-store' })
      .then(function (r) { return r.json().catch(function () { return {} }).then(function (j) { return { s: r.status, j: j } }) })
      .then(function (x) {
        if (x.s === 200 && x.j.file_id) { state.files.push({ id: x.j.file_id, name: f.name.slice(0, 30) }); paintChips(); return }
        showErr(x.s === 415 ? 'Only photos please (JPEG, PNG, WebP or HEIC).' : x.s === 429 ? 'Too many photos for now. Please try again later.' : 'That photo did not upload. Please try again.')
      }).catch(function () { showErr('That photo did not upload. Please try again.') })
  }
  function saveEmail() {
    var v = emailIn.value.trim()
    if (!state.id) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { emailMsg.textContent = 'Please enter a valid email address.'; return }
    fetch(API + 'email', { method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify({ email: v }), cache: 'no-store' })
      .then(function (r) {
        if (r.ok) { emailMsg.textContent = 'Thanks. We will use it to follow up.'; emailIn.value = ''; emailRow.hidden = true; poll(); return }
        emailMsg.textContent = r.status === 429 ? 'Please try again later.' : 'That did not save. Please try again.'
      }).catch(function () { emailMsg.textContent = 'That did not save. Please try again.' })
  }

  function open() {
    state.open = true; panel.hidden = false; btn.setAttribute('aria-expanded', 'true'); btn.classList.add('open')
    if (state.id) poll()   // only re-reads a conversation this browser already has
    setTimeout(function () { ta.focus() }, 0)
  }
  function close() {
    state.open = false; panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.classList.remove('open'); clearTimeout(state.timer)
    btn.focus()
  }

  function mount() {
    if (document.querySelector('[data-lco-chat]')) return
    var css = el('style'); css.textContent = CSS; document.head.appendChild(css)

    btn = el('button', 'lcochat-btn')
    btn.type = 'button'
    btn.setAttribute('data-lco-chat', '')
    btn.setAttribute('data-track', 'chat-open')
    btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', label)
    btn.appendChild(svg('M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'))
    btn.appendChild(el('span', '', label))

    panel = el('div', 'lcochat-panel'); panel.hidden = true
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Chat with The Local Cabinetry')
    var head = el('div', 'lcochat-head'); head.appendChild(el('h2', '', 'Chat with us'))
    var x = el('button', 'lcochat-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close chat'); x.setAttribute('data-track', 'chat-close')
    head.appendChild(x)
    var note = el('div', 'lcochat-note', 'Replies come from The Local Cabinetry assistant and our team.')
    log = el('div', 'lcochat-log'); log.setAttribute('role', 'log'); log.setAttribute('aria-live', 'polite'); log.setAttribute('aria-label', 'Conversation')
    hold = el('div', 'lcochat-hold', 'We got your message. A person replies here soon.'); hold.hidden = true; hold.setAttribute('role', 'status')
    err = el('div', 'lcochat-err'); err.hidden = true; err.setAttribute('role', 'alert')

    var box = el('div', 'lcochat-box')
    chips = el('div', 'lcochat-tools')
    var row = el('div', 'lcochat-row')
    ta = el('textarea'); ta.rows = 2; ta.maxLength = MAX_TEXT; ta.placeholder = 'Type your message'; ta.setAttribute('aria-label', 'Your message')
    sendB = el('button', 'lcochat-send', 'Send'); sendB.type = 'button'; sendB.setAttribute('data-track', 'chat-send')
    row.appendChild(ta); row.appendChild(sendB)
    var tools = el('div', 'lcochat-tools')
    photoIn = el('input'); photoIn.type = 'file'; photoIn.accept = 'image/jpeg,image/png,image/webp,image/heic'; photoIn.hidden = true
    photoB = el('button', 'lnk', 'Add a photo'); photoB.type = 'button'; photoB.disabled = !state.id; photoB.title = 'Available after your first message'
    photoB.addEventListener('click', function () { if (state.id) photoIn.click() })
    var emailB = el('button', 'lnk', 'Leave your email'); emailB.type = 'button'
    tools.appendChild(photoB); tools.appendChild(emailB); tools.appendChild(photoIn)
    emailRow = el('div', 'lcochat-email'); emailRow.hidden = true
    emailIn = el('input'); emailIn.type = 'email'; emailIn.placeholder = 'you@example.com'; emailIn.setAttribute('aria-label', 'Your email'); emailIn.autocomplete = 'email'
    var emailGo = el('button', 'lcochat-mini', 'Save'); emailGo.type = 'button'
    emailRow.appendChild(emailIn); emailRow.appendChild(emailGo)
    emailMsg = el('div', '', ''); emailMsg.style.fontSize = '13px'; emailMsg.setAttribute('role', 'status')
    box.appendChild(chips); box.appendChild(row); box.appendChild(tools); box.appendChild(emailRow); box.appendChild(emailMsg)

    var foot = el('div', 'lcochat-foot')
    var a = el('a', '', 'Open the full design tool'); a.href = DESIGN; a.setAttribute('data-track', 'chat-design-link')
    foot.appendChild(a)

    panel.appendChild(head); panel.appendChild(note); panel.appendChild(log); panel.appendChild(hold); panel.appendChild(err); panel.appendChild(box); panel.appendChild(foot)
    document.body.appendChild(btn); document.body.appendChild(panel)

    btn.addEventListener('click', function () { state.open ? close() : open() })
    x.addEventListener('click', close)
    sendB.addEventListener('click', send)
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send() } })
    photoIn.addEventListener('change', pickPhoto)
    emailB.addEventListener('click', function () { if (!state.id) { emailMsg.textContent = 'Send us a first message, then you can leave your email.'; return } emailRow.hidden = !emailRow.hidden; if (!emailRow.hidden) emailIn.focus() })
    emailGo.addEventListener('click', saveEmail)
    emailIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); saveEmail() } })
    panel.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); return }
      if (e.key !== 'Tab') return
      var f = Array.prototype.filter.call(panel.querySelectorAll('button,a[href],textarea,input:not([hidden])'), function (n) { return !n.disabled && n.offsetParent !== null })
      if (!f.length) return
      var first = f[0], last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    })
    document.addEventListener('visibilitychange', function () { if (!document.hidden && state.open && state.id) poll() })
  }

  if (document.body) mount()
  else document.addEventListener('DOMContentLoaded', mount)
})()
