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
 * Honest wording: the first bubble is a LOCAL greeting (never sent, never stored on the server) that says the assistant is an AI helping
 * Hannah's team; every later line and every reply comes from the desk. While no reply has come a 'typing' indicator shows for at most 60 s.
 * If the server answers "closed" (kill switch), is unreachable, or an older server does not know the path, the panel says so and
 * points to the design tool. Messenger-style window: avatar, name, Online dot, bubbles with time, typing dots, growing composer.
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

  var state = { id: null, last: 0, open: false, busy: false, timer: 0, idleSince: Date.now(), seen: {}, files: [], closed: false, lastFrom: '', typing: null, typingTimer: 0 }
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
    '.lcochat-panel{position:fixed;right:16px;bottom:76px;z-index:2147483001;width:380px;max-width:calc(100vw - 32px);height:min(600px,calc(100dvh - 100px));display:flex;flex-direction:column;background:#fff;color:#1b2733;',
    'border-radius:14px;box-shadow:0 12px 40px rgba(8,20,34,.3);overflow:hidden;font:15px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}',
    '.lcochat-panel[hidden]{display:none}',
    '.lcochat-head{display:flex;align-items:center;gap:12px;padding:12px 14px;background:#0e2740;color:#fff}',
    '.lcochat-av{position:relative;flex:0 0 40px;width:40px;height:40px;border-radius:50%;background:#14365a;border:1px solid #b4862f;color:#e9c46a;display:flex;align-items:center;justify-content:center;font:600 18px/1 Georgia,"Times New Roman",serif}',
    '.lcochat-av.sm{flex:0 0 28px;width:28px;height:28px;font-size:13px}',
    '.lcochat-who{flex:1;min-width:0}',
    '.lcochat-who h2{margin:0;font:600 16px/1.2 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#fff}',
    '.lcochat-st{display:flex;align-items:center;gap:6px;margin-top:3px;font-size:12.5px;color:#cfd8e3}',
    '.lcochat-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#2fb26a;box-shadow:0 0 0 2px rgba(47,178,106,.25)}',
    '.lcochat-x{min-width:44px;min-height:44px;margin:-8px -8px -8px 0;border:0;background:transparent;color:#fff;font-size:26px;line-height:1;cursor:pointer;border-radius:8px}',
    '.lcochat-log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#f6f4ef}',
    '.lcochat-r{display:flex;gap:8px;align-items:flex-end;max-width:92%}',
    '.lcochat-r.you{align-self:flex-end;flex-direction:row-reverse}',
    '.lcochat-r.us{align-self:flex-start}',
    '.lcochat-c{display:flex;flex-direction:column;gap:3px;min-width:0}',
    '.lcochat-r.you .lcochat-c{align-items:flex-end}',
    '.lcochat-m{padding:9px 13px;border-radius:16px;white-space:pre-wrap;overflow-wrap:anywhere}',
    '.lcochat-r.you .lcochat-m{background:#0e2740;color:#fff;border-bottom-right-radius:4px}',
    '.lcochat-r.us .lcochat-m{background:#fff;color:#1b2733;border:1px solid #e3ded4;border-bottom-left-radius:4px}',
    '.lcochat-m small{display:block;margin-top:4px;opacity:.75;font-size:12px}',
    '.lcochat-t{font-size:11px;color:#7a7468;padding:0 4px}',
    '.lcochat-typing .lcochat-m{display:flex;gap:4px;align-items:center;padding:13px 14px}',
    '.lcochat-typing i{width:7px;height:7px;border-radius:50%;background:#9aa3ad;animation:lcochat-b 1.2s infinite ease-in-out}',
    '.lcochat-typing i:nth-child(2){animation-delay:.15s}.lcochat-typing i:nth-child(3){animation-delay:.3s}',
    '@keyframes lcochat-b{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-4px);opacity:1}}',
    '@media (prefers-reduced-motion:reduce){.lcochat-typing i{animation:none;opacity:.7}}',
    '.lcochat-err{padding:6px 14px;font-size:13px;background:#fdecea;color:#8a1c12}',
    '.lcochat-err[hidden]{display:none}',
    '.lcochat-box{display:flex;flex-direction:column;gap:4px;padding:10px 14px 6px;border-top:1px solid #e3ded4;background:#fff}',
    '.lcochat-row{display:flex;gap:8px;align-items:flex-end}',
    '.lcochat-box textarea{flex:1;min-height:44px;max-height:120px;resize:none;overflow-y:auto;padding:11px 12px;border:1px solid #bdb6a8;border-radius:22px;font:inherit;line-height:1.35;color:inherit}',
    '.lcochat-ic,.lcochat-send{flex:0 0 44px;width:44px;height:44px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}',
    '.lcochat-ic{border:1px solid #bdb6a8;background:#fff;color:#0e2740}',
    '.lcochat-send{border:0;background:#0e2740;color:#fff}',
    '.lcochat-send:hover{background:#14365a}',
    '.lcochat-ic:disabled,.lcochat-send:disabled{opacity:.45;cursor:default}',
    '.lcochat-mini{min-height:44px;padding:0 16px;border:0;border-radius:10px;background:#0e2740;color:#fff;font:600 14px/1 system-ui,sans-serif;cursor:pointer}',
    '.lcochat-mini.alt{background:#fff;color:#0e2740;border:1px solid #0e2740}',
    '.lcochat-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:13px}',
    '.lcochat-tools:empty{display:none}',
    '.lcochat-lnk{align-self:flex-start;min-height:36px;padding:0 4px;border:0;background:transparent;color:#0e2740;text-decoration:underline;cursor:pointer;font:inherit;font-size:13px}',
    '.lcochat-email{display:flex;gap:8px}',
    '.lcochat-email[hidden]{display:none}',
    '.lcochat-email input{flex:1;min-height:44px;padding:0 10px;border:1px solid #bdb6a8;border-radius:10px;font:inherit}',
    '.lcochat-foot{padding:2px 14px 10px;font-size:12.5px;background:#fff}',
    '.lcochat-foot a{color:#0e2740;font-weight:600}',
    '@media (max-width:520px){.lcochat-panel{inset:0;width:auto;max-width:none;height:auto;border-radius:0;box-shadow:none}.lcochat-head,.lcochat-log,.lcochat-box,.lcochat-foot,.lcochat-err{padding-left:16px;padding-right:16px}.lcochat-btn.open{display:none}.lcochat-box textarea,.lcochat-email input{font-size:16px}}',
    '@media print{.lcochat-btn,.lcochat-panel{display:none}}'
  ].join('')

  var btn, panel, log, err, ta, sendB, photoIn, photoB, chips, emailRow, emailIn, emailMsg

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

  function avatar(sm) { return el('span', 'lcochat-av' + (sm ? ' sm' : ''), 'H') }
  function stamp(v) {
    var d = null
    if (typeof v === 'number') d = new Date(v < 1e12 ? v * 1000 : v)
    else if (typeof v === 'string' && v) d = new Date(v)
    if (!d || isNaN(d.getTime())) d = new Date()
    var h = d.getHours(), m = d.getMinutes()
    return (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m + ' ' + (h < 12 ? 'AM' : 'PM')
  }
  function row(from, textNode, time, photos) {
    var r = el('div', 'lcochat-r ' + from)
    if (from === 'us') r.appendChild(avatar(true))
    var c = el('div', 'lcochat-c')
    var b = el('div', 'lcochat-m')
    if (textNode != null) b.appendChild(document.createTextNode(String(textNode)))
    if (photos && photos.length) b.appendChild(el('small', '', 'Photo sent: ' + photos.map(function (p) { return String(p && p.name || 'photo') }).join(', ')))
    c.appendChild(b)
    if (time) c.appendChild(el('span', 'lcochat-t', time))
    r.appendChild(c)
    return r
  }
  function hideTyping() {
    clearTimeout(state.typingTimer)
    if (state.typing && state.typing.parentNode) state.typing.parentNode.removeChild(state.typing)
    state.typing = null
  }
  function showTyping() {
    hideTyping()
    var r = el('div', 'lcochat-r us lcochat-typing'); r.setAttribute('aria-label', 'Hannah is typing')
    r.appendChild(avatar(true))
    var b = el('div', 'lcochat-m'); b.appendChild(el('i')); b.appendChild(el('i')); b.appendChild(el('i'))
    r.appendChild(b); log.appendChild(r); state.typing = r; scrollDown()
    state.typingTimer = setTimeout(hideTyping, 60000)
  }
  // Our own local greeting, never sent to the server and never stored: the AI says so in its first words.
  function greet() {
    log.appendChild(row('us', "Hi, I'm Muse, the AI assistant for Luxova Home, here with Hannah's team to help with layouts and pricing.", ''))
    log.appendChild(row('us', 'What are you planning: kitchen, vanity or closet?', stamp()))
  }
  function resetLog() { hideTyping(); log.textContent = ''; greet() }
  function addMsg(m) {
    if (state.seen[m.seq]) return
    state.seen[m.seq] = 1
    var from = m.from === 'us' ? 'us' : 'you'
    if (from === 'us') hideTyping()
    var r = row(from, String(m.text || ''), stamp(m.ts || m.at || m.time || m.created_at || m.created), m.photos)
    if (state.typing) log.insertBefore(r, state.typing); else log.appendChild(r)
    state.last = Math.max(state.last, m.seq)
    state.lastFrom = from
  }
  function scrollDown() { log.scrollTop = log.scrollHeight }
  function grow() { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px' }

  function poll() {
    clearTimeout(state.timer)
    if (!state.id || !state.open) return
    if (document.hidden) { state.timer = setTimeout(poll, 8000); return }
    fetch(API + 'messages?after=' + state.last, { headers: headers(), cache: 'no-store' }).then(function (r) {
      if (r.status === 404 || r.status === 400) { // the server does not know this conversation (any more): start clean on the next message
        state.id = null; state.last = 0; state.seen = {}; state.lastFrom = ''; remember(); resetLog(); return null
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
        ta.value = ''; grow(); state.files = []; paintChips(); state.idleSince = Date.now()
        showTyping()
        poll()
        return
      }
      if (x.s === 404 && state.id) { state.id = null; state.last = 0; state.seen = {}; state.lastFrom = ''; remember(); resetLog(); showErr('That chat had ended. Please send your message again.'); return }
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
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Chat with Hannah at Luxova Home')
    var head = el('div', 'lcochat-head')
    head.appendChild(avatar(false))
    var who = el('div', 'lcochat-who')
    who.appendChild(el('h2', '', 'Hannah'))
    var st = el('div', 'lcochat-st'); st.appendChild(el('span', 'lcochat-dot')); st.appendChild(el('span', '', 'Online')); st.appendChild(el('span', '', '· Luxova Home'))
    who.appendChild(st); head.appendChild(who)
    var x = el('button', 'lcochat-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close chat'); x.setAttribute('data-track', 'chat-close')
    head.appendChild(x)
    log = el('div', 'lcochat-log'); log.setAttribute('role', 'log'); log.setAttribute('aria-live', 'polite'); log.setAttribute('aria-label', 'Conversation')
    err = el('div', 'lcochat-err'); err.hidden = true; err.setAttribute('role', 'alert')

    var box = el('div', 'lcochat-box')
    chips = el('div', 'lcochat-tools')
    var rw = el('div', 'lcochat-row')
    photoIn = el('input'); photoIn.type = 'file'; photoIn.accept = 'image/jpeg,image/png,image/webp,image/heic'; photoIn.hidden = true
    photoB = el('button', 'lcochat-ic'); photoB.type = 'button'; photoB.disabled = !state.id; photoB.title = 'Add a photo (available after your first message)'; photoB.setAttribute('aria-label', 'Add a photo')
    photoB.appendChild(svg('M21 19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3l2-2h4l2 2h3a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'))
    photoB.addEventListener('click', function () { if (state.id) photoIn.click() })
    ta = el('textarea'); ta.rows = 1; ta.maxLength = MAX_TEXT; ta.placeholder = 'Type your message'; ta.setAttribute('aria-label', 'Your message')
    sendB = el('button', 'lcochat-send'); sendB.type = 'button'; sendB.setAttribute('aria-label', 'Send'); sendB.setAttribute('data-track', 'chat-send')
    sendB.appendChild(svg('M22 2L11 13M22 2l-7 20-4-9-9-4z'))
    rw.appendChild(photoB); rw.appendChild(ta); rw.appendChild(sendB); rw.appendChild(photoIn)
    var emailB = el('button', 'lcochat-lnk', 'Leave your email'); emailB.type = 'button'
    emailRow = el('div', 'lcochat-email'); emailRow.hidden = true
    emailIn = el('input'); emailIn.type = 'email'; emailIn.placeholder = 'you@example.com'; emailIn.setAttribute('aria-label', 'Your email'); emailIn.autocomplete = 'email'
    var emailGo = el('button', 'lcochat-mini', 'Save'); emailGo.type = 'button'
    emailRow.appendChild(emailIn); emailRow.appendChild(emailGo)
    emailMsg = el('div', '', ''); emailMsg.style.fontSize = '13px'; emailMsg.setAttribute('role', 'status')
    box.appendChild(chips); box.appendChild(rw); box.appendChild(emailB); box.appendChild(emailRow); box.appendChild(emailMsg)

    var foot = el('div', 'lcochat-foot')
    var a = el('a', '', 'Open the full design tool'); a.href = DESIGN; a.setAttribute('data-track', 'chat-design-link')
    foot.appendChild(a)

    panel.appendChild(head); panel.appendChild(log); panel.appendChild(err); panel.appendChild(box); panel.appendChild(foot)
    document.body.appendChild(btn); document.body.appendChild(panel)
    greet()

    btn.addEventListener('click', function () { state.open ? close() : open() })
    x.addEventListener('click', close)
    sendB.addEventListener('click', send)
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send() } })
    ta.addEventListener('input', grow)
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
