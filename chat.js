/* Chat bubble for thelocalcabinetry.com. One same-origin file: no third party, no cookie, no account.
 *
 *   <script src="/chat.js" defer data-label="Chat with Hannah"></script>
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
 * points to the design tool. A WhatsApp link (header icon + a round corner button) only opens WhatsApp on the owner's phone: it sends nothing. Messenger-style window: avatar, name, Online dot, bubbles with time, typing dots, growing composer.
 */
(function () {
  'use strict'
  if (window.__lcoChat) return
  window.__lcoChat = true
  var s = document.currentScript
  var label = ((s && s.dataset && s.dataset.label) || 'Chat with Hannah').trim().slice(0, 40)
  var DESIGN = '/design'
  // The owner's WhatsApp number: the ONE place to change it (country code, digits only, no + and no leading 0).
  // A placeholder-looking number renders no WhatsApp button at all: a button that dials a stranger is worse than none.
  var WHATSAPP = '84976096632'
  var WA_TEXT = 'Hi, I saw your kitchens on thelocalcabinetry.com'
  var PLACEHOLDERS = [/^0+$/, /^(\d)\1+$/, /^1?234567890$/, /^1?5551?\d{4}$/, /^123456789\d*$/, /^(44)?0?7700900\d{3}$/, /^1?5550\d{3}$/]
  function waOk(n) { return /^[1-9]\d{7,14}$/.test(n) && !PLACEHOLDERS.some(function (re) { return re.test(n) }) }
  var WA_URL = waOk(WHATSAPP) ? 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(WA_TEXT) : ''
  var WA_PATH = 'M3 21l1.6-5A8.5 8.5 0 1 1 8 19.4zM9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.5-2-1-1 .8c-1-.4-2-1.4-2.4-2.4l.8-1-1-2z'
  var API = '/design/api/visit/'
  var CATALOG = '/catalog/The-Local-Cabinetry-Catalog.pdf'
  var CAT_KEY = 'lco_catalog_pop_v1'   // set once the popup was shown: it never comes back for this browser
  var KEY = 'lco_visit_v1'
  var MAX_TEXT = 1200, MAX_PHOTO = 5 * 1024 * 1024

  var state = { id: null, last: 0, open: false, busy: false, timer: 0, idleSince: Date.now(), seen: {}, files: [], closed: false, lastFrom: '', typing: null, typingTimer: 0, emailAsked: false, emailTimer: 0, sentOnce: false, day: '', owedSince: 0, ackSeen: false, still: null, chipsEl: null }
  try { var saved = localStorage.getItem(KEY); if (saved && /^[0-9a-f]{32}$/.test(saved)) state.id = saved } catch (e) { /* storage blocked: memory only */ }
  var EMAIL_KEY = 'lco_email_asked_v1'
  try { if (state.id && localStorage.getItem(EMAIL_KEY) === state.id) state.emailAsked = true } catch (e) { /* ignore */ }
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
    '.lcochat-wa{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:calc(max(16px,env(safe-area-inset-bottom)) + 60px);z-index:2147483000;width:48px;height:48px;border-radius:50%;background:#1f9d55;color:#fff;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;box-shadow:0 6px 24px rgba(8,20,34,.25)}',
    '.lcochat-wa:hover{background:#188548}',
    '.lcochat-wa svg{width:24px;height:24px}',
    '.lcochat-wa:focus-visible{outline:3px solid #b4862f;outline-offset:3px}',
    '.lcochat-wa.open{display:none}',
    '.lcochat-btn svg{flex:0 0 18px}',
    '.lcochat-btn:focus-visible,.lcochat-panel button:focus-visible,.lcochat-panel a:focus-visible,.lcochat-panel textarea:focus-visible,.lcochat-panel input:focus-visible{outline:3px solid #b4862f;outline-offset:2px}',
    '.lcochat-panel{position:fixed;right:16px;bottom:76px;z-index:2147483001;width:380px;max-width:calc(100vw - 32px);height:min(600px,calc(100dvh - 100px));display:flex;flex-direction:column;background:#fff;color:#1b2733;',
    'border-radius:14px;box-shadow:0 12px 40px rgba(8,20,34,.3);overflow:hidden;font:15px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}',
    '.lcochat-panel[hidden]{display:none}',
    '.lcochat-head{display:flex;align-items:center;gap:12px;padding:12px 14px;background:#0e2740;color:#fff}',
    '.lcochat-av{position:relative;flex:0 0 40px;width:40px;height:40px;border-radius:50%;background:#f3efe7;border:1px solid #b4862f;color:#0e2740;display:flex;align-items:center;justify-content:center;font:600 18px/1 Georgia,"Times New Roman",serif}',
    '.lcochat-av.ai{background:#1d4a78;color:#e9c46a}',
    '.lcochat-av.sm{flex:0 0 28px;width:28px;height:28px;font-size:13px}',
    '.lcochat-who{flex:1;min-width:0}',
    '.lcochat-who h2{margin:0;font:600 16px/1.2 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#fff}',
    '.lcochat-st{display:flex;align-items:center;gap:6px;margin-top:3px;font-size:12.5px;color:#cfd8e3}',
    '.lcochat-dot.off{background:#9aa3ad;box-shadow:0 0 0 2px rgba(154,163,173,.25)}',
    '.lcochat-day{align-self:center;padding:3px 12px;border-radius:999px;background:#e9e4d9;color:#5d574b;font-size:12px;font-weight:600}',
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
    '.lcochat-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;max-width:100%}',
    '.lcochat-chip{display:inline-flex;align-items:center;gap:7px;min-height:40px;padding:0 14px;border:1px solid #0e2740;border-radius:20px;background:#fff;color:#0e2740;font:600 14px/1.1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;cursor:pointer}',
    '.lcochat-chip:hover:not(:disabled){background:#0e2740;color:#fff}',
    '.lcochat-chip:disabled{opacity:.55;cursor:default}',
    '.lcochat-sw{display:inline-block;width:16px;height:16px;border-radius:50%;border:1px solid rgba(14,39,64,.35);flex:0 0 16px}',
    '.lcochat-ic.hot{border-color:#b4862f;box-shadow:0 0 0 3px rgba(180,134,47,.28)}',
    '.lcochat-still{font-size:12px;color:#7a7468;margin:2px 4px 0}',
    '.lcochat-typing .lcochat-m{display:flex;gap:4px;align-items:center;padding:13px 14px}',
    '.lcochat-typing i{width:7px;height:7px;border-radius:50%;background:#9aa3ad;animation:lcochat-b 1.2s infinite ease-in-out}',
    '.lcochat-typing i:nth-child(2){animation-delay:.15s}.lcochat-typing i:nth-child(3){animation-delay:.3s}',
    '@keyframes lcochat-b{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-4px);opacity:1}}',
    '@media (prefers-reduced-motion:reduce){.lcochat-typing i{animation:none;opacity:.7}}',
    '.lcochat-err{padding:6px 14px;font-size:13px;background:#fdecea;color:#8a1c12}',
    '.lcochat-err[hidden]{display:none}',
    '.lcochat-box{display:flex;flex-direction:column;gap:4px;padding:10px 14px 12px;border-top:1px solid #e3ded4;background:#fff}',
    '.lcochat-row{display:flex;gap:8px;align-items:flex-end}',
    '.lcochat-box textarea{flex:1;min-height:44px;max-height:120px;resize:none;overflow-y:auto;padding:11px 12px;border:1px solid #bdb6a8;border-radius:22px;font:inherit;line-height:1.35;color:inherit}',
    '.lcochat-ic,.lcochat-send{flex:0 0 44px;width:44px;height:44px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}',
    '.lcochat-ic{border:1px solid #bdb6a8;background:#fff;color:#0e2740}',
    '.lcochat-send{border:0;background:#0e2740;color:#fff}',
    '.lcochat-send:hover{background:#14365a}',
    '.lcochat-send:disabled,.lcochat-ic[aria-disabled=true]{opacity:.45;cursor:default}',
    '.lcochat-ext{margin:-8px 0 -8px auto;display:inline-flex;align-items:center;justify-content:center;text-decoration:none}',
    '.lcochat-ext+.lcochat-x{margin-left:-6px}',
    '.lcochat-ask{position:relative;min-width:230px;padding-right:34px}',
    '.lcochat-ask-x{position:absolute;top:2px;right:2px;width:32px;height:32px;border:0;background:transparent;color:#7a7468;font-size:18px;line-height:1;cursor:pointer;border-radius:50%}',
    '.lcochat-ask-f{display:flex;gap:6px;margin-top:8px;align-items:center}',
    '.lcochat-ask-f input{flex:1;min-width:0;min-height:40px;padding:0 12px;border:1px solid #bdb6a8;border-radius:20px;font:inherit;font-size:14px}',
    '.lcochat-ask-f button{flex:0 0 40px;width:40px;height:40px;border:0;border-radius:50%;background:#0e2740;color:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}',
    '.lcochat-ask-msg{margin-top:4px;font-size:12.5px;color:#8a1c12}',
    '.lcochat-mini{min-height:44px;padding:0 16px;border:0;border-radius:10px;background:#0e2740;color:#fff;font:600 14px/1 system-ui,sans-serif;cursor:pointer}',
    '.lcochat-mini.alt{background:#fff;color:#0e2740;border:1px solid #0e2740}',
    '.lcochat-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:13px}',
    '.lcochat-tools:empty{display:none}',
    '@media (max-width:520px){.lcochat-panel{inset:0;width:auto;max-width:none;height:auto;border-radius:0;box-shadow:none}.lcochat-head,.lcochat-log,.lcochat-box,.lcochat-err{padding-left:16px;padding-right:16px}.lcochat-btn.open{display:none}.lcochat-box textarea,.lcochat-ask-f input{font-size:16px}}',
    '.lcocat{position:fixed;inset:0;z-index:2147483002;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(8,20,34,.55)}',
    '.lcocat[hidden]{display:none}',
    '.lcocat-card{position:relative;display:flex;width:760px;max-width:100%;max-height:calc(100dvh - 32px);overflow:auto;background:#fff;color:#1b2733;border-radius:14px;box-shadow:0 12px 40px rgba(8,20,34,.35);font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}',
    '.lcocat-img{flex:0 0 42%;min-height:0;overflow:hidden;background:#0e2740}',
    '.lcocat-img img{display:block;width:100%;height:100%;object-fit:cover;object-position:top}',
    '.lcocat-tx{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;padding:36px 32px}',
    '.lcocat-tx h2{margin:0 0 10px;font:600 26px/1.15 Georgia,"Times New Roman",serif;color:#0e2740}',
    '.lcocat-tx p{margin:0 0 20px;color:#4a5560}',
    '.lcocat-go{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 24px;border-radius:8px;background:#b4862f;color:#fff;font-weight:600;text-decoration:none}',
    '.lcocat-go:hover{background:#9a7226}',
    '.lcocat-x{position:absolute;top:6px;right:6px;width:44px;height:44px;border:0;border-radius:50%;background:rgba(255,255,255,.9);color:#0e2740;font-size:26px;line-height:1;cursor:pointer}',
    '.lcocat-go:focus-visible,.lcocat-x:focus-visible{outline:3px solid #0e2740;outline-offset:2px}',
    '@media (max-width:620px){.lcocat-card{flex-direction:column}.lcocat-img{flex:0 0 150px}.lcocat-tx{padding:22px 20px 24px}.lcocat-tx h2{font-size:22px}}',
    '@media print{.lcocat{display:none}.lcochat-btn,.lcochat-panel,.lcochat-wa{display:none}}'
  ].join('')

  var dot, stText, checked = 0, btn, wa, panel, log, err, ta, sendB, photoIn, photoB, chips

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

  function avatar(sm, ai) { return el('span', 'lcochat-av' + (sm ? ' sm' : '') + (ai ? ' ai' : ''), ai ? 'M' : 'H') }
  function stamp(v) {
    var d = toDate(v)
    var h = d.getHours(), m = d.getMinutes()
    return (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m + ' ' + (h < 12 ? 'AM' : 'PM')
  }
  function dayKey(d) { return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate() }
  function dayLabel(d) {
    var now = new Date(), y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
    if (dayKey(d) === dayKey(now)) return 'Today'
    if (dayKey(d) === dayKey(y)) return 'Yesterday'
    var M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return M[d.getMonth()] + ' ' + d.getDate() + (d.getFullYear() !== now.getFullYear() ? ', ' + d.getFullYear() : '')
  }
  // A centred 'Today' / 'Yesterday' / 'Oct 17' chip whenever the day changes from the last stamped line (viewer's local time zone).
  function daySep(d) {
    var k = dayKey(d)
    if (state.day === k) return
    state.day = k
    var n = el('div', 'lcochat-day', dayLabel(d)); n.setAttribute('role', 'separator')
    if (state.typing) log.insertBefore(n, state.typing); else log.appendChild(n)
  }
  function toDate(v) {
    var d = null
    if (typeof v === 'number') d = new Date(v < 1e12 ? v * 1000 : v)
    else if (typeof v === 'string' && v) d = new Date(v)
    return d && !isNaN(d.getTime()) ? d : new Date()
  }
  function row(from, textNode, time, photos, human) {
    var r = el('div', 'lcochat-r ' + from)
    if (from === 'us') r.appendChild(avatar(true, !human))
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
    state.typing = null; state.still = null
  }
  // After 60 s: if the server acknowledged our line (ack: true) a designer really is on it, so the dots stay and a quiet line says so;
  // without an ack nothing promised an answer, so the dots go away as before.
  function stillOrHide() {
    if (!state.typing) return
    if (!state.ackSeen) { hideTyping(); return }
    if (state.still) return
    state.still = el('div', 'lcochat-still', 'Still here, a designer is on it')
    var c = state.typing.querySelector('.lcochat-c'); if (c) c.appendChild(state.still)
    scrollDown()
  }
  function showTyping() {
    hideTyping()
    var r = el('div', 'lcochat-r us lcochat-typing'); r.setAttribute('aria-label', 'Muse is typing')
    r.appendChild(avatar(true, true))
    var c = el('div', 'lcochat-c')
    var b = el('div', 'lcochat-m'); b.appendChild(el('i')); b.appendChild(el('i')); b.appendChild(el('i'))
    c.appendChild(b); r.appendChild(c); log.appendChild(r); state.typing = r; scrollDown()
    var left = Math.max(0, 60000 - (Date.now() - (state.owedSince || Date.now())))
    if (left === 0) stillOrHide(); else state.typingTimer = setTimeout(stillOrHide, left)
  }
  // Our own local greeting, never sent to the server and never stored: the AI says so in its first words.
  function greet() {
    log.appendChild(row('us', "Hi, I'm Muse, the AI assistant for The Local Cabinetry, here with Hannah's team to help with layouts and pricing.", ''))
    var q = row('us', 'What are you planning: kitchen, vanity or closet?', '')
    log.appendChild(q)
    // The server never sends the first set: the widget offers the rooms itself, but only for a NEW conversation (a returning visitor sees the thread instead).
    if (!state.id) renderChips(q, [{ label: 'Kitchen', value: 'room:kitchen' }, { label: 'Vanity', value: 'room:vanity' }, { label: 'Closet', value: 'room:closet' }, { label: 'Not sure', value: 'room:unsure' }])
  }
  function resetLog() { hideTyping(); clearChips(); hotUpload(false); state.owedSince = 0; state.ackSeen = false; clearTimeout(state.emailTimer); state.emailAsked = false; state.sentOnce = false; log.textContent = ''; state.day = ''; greet(); if (photoB) setPhoto() }
  function setPhoto() { photoB.setAttribute('aria-disabled', state.id ? 'false' : 'true'); photoB.title = state.id ? 'Add a photo' : 'Send a message first, then add photos' }
  // Quick replies: optional `chips: [{label, value, swatch?}]` on OUR lines. Shown only under the LAST 'us' line; any newer line or a tap removes them.
  function clearChips() { if (state.chipsEl && state.chipsEl.parentNode) state.chipsEl.parentNode.removeChild(state.chipsEl); state.chipsEl = null }
  function setChipsDisabled(on) { if (state.chipsEl) Array.prototype.forEach.call(state.chipsEl.querySelectorAll('button'), function (b) { b.disabled = !!on }) }
  function hotUpload(on) { if (!photoB) return; photoB.classList.toggle('hot', !!on); if (on) photoB.title = 'Add a photo or sketch' }
  function renderChips(r, chips) {
    var c = r.querySelector('.lcochat-c'); if (!c) return
    var box = el('div', 'lcochat-chips'); box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Quick replies')
    chips.slice(0, 8).forEach(function (ch) {
      if (!ch || typeof ch.label !== 'string' || typeof ch.value !== 'string' || !ch.label || !ch.value) return
      var b = el('button', 'lcochat-chip'); b.type = 'button'
      if (typeof ch.swatch === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(ch.swatch)) { var sw = el('i', 'lcochat-sw'); sw.style.background = ch.swatch; b.appendChild(sw) }
      b.appendChild(document.createTextNode(ch.label.slice(0, 40)))
      b.addEventListener('click', function () { if (state.busy) return; setChipsDisabled(true); post({ text: ch.label.slice(0, 40), chip: ch.value.slice(0, 64) }) })
      box.appendChild(b)
    })
    if (!box.childNodes.length) return
    c.appendChild(box); state.chipsEl = box
  }
  function addMsg(m) {
    if (state.seen[m.seq]) return
    state.seen[m.seq] = 1
    var from = m.from === 'us' ? 'us' : 'you'
    var isAck = from === 'us' && m.ack === true
    clearChips(); hotUpload(false)
    if (isAck) state.ackSeen = true
    else if (from === 'us') { hideTyping(); state.owedSince = 0; state.ackSeen = false }
    var at = m.at || m.ts || m.time || m.created_at || m.created
    daySep(toDate(at))
    var r = row(from, String(m.text || ''), stamp(at), m.photos, m.human === true || m.by === 'human')
    if (state.typing) log.insertBefore(r, state.typing); else log.appendChild(r)
    state.last = Math.max(state.last, m.seq)
    state.lastFrom = from
    if (isAck && !state.typing && state.owedSince) showTyping()
    if (from === 'us' && !isAck) { if (Array.isArray(m.chips) && m.chips.length) renderChips(r, m.chips); if (m.upload === true) hotUpload(true) }
    if (from === 'us' && !isAck && state.sentOnce) setTimeout(promptEmail, 800)
  }
  function scrollDown() { log.scrollTop = log.scrollHeight }
  function grow() { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px' }

  // One message-style prompt inside the conversation, once per conversation: after our first reply (or 20 s without one).
  function promptEmail() {
    if (!state.id || state.emailAsked) return
    if (state.chipsEl) { clearTimeout(state.emailTimer); state.emailTimer = setTimeout(promptEmail, 8000); return }   // not while quick replies are on offer
    state.emailAsked = true; clearTimeout(state.emailTimer)
    try { localStorage.setItem(EMAIL_KEY, state.id) } catch (e) { /* ignore */ }
    var r = el('div', 'lcochat-r us'); r.appendChild(avatar(true, true))
    var c = el('div', 'lcochat-c'); var b = el('div', 'lcochat-m lcochat-ask')
    b.appendChild(el('span', '', 'Want us to follow up by email too?'))
    var xb = el('button', 'lcochat-ask-x', '×'); xb.type = 'button'; xb.setAttribute('aria-label', 'No thanks'); xb.title = 'No thanks'
    var f = el('form', 'lcochat-ask-f'); f.noValidate = true
    var inp = el('input'); inp.type = 'email'; inp.placeholder = 'you@example.com'; inp.autocomplete = 'email'; inp.setAttribute('aria-label', 'Your email')
    var go = el('button'); go.type = 'submit'; go.setAttribute('aria-label', 'Save email'); go.appendChild(svg('M5 12h14M13 6l6 6-6 6'))
    var msg = el('div', 'lcochat-ask-msg'); msg.setAttribute('role', 'status')
    f.appendChild(inp); f.appendChild(go); b.appendChild(xb); b.appendChild(f); b.appendChild(msg)
    c.appendChild(b); r.appendChild(c)
    xb.addEventListener('click', function () { if (r.parentNode) r.parentNode.removeChild(r) })
    f.addEventListener('submit', function (e) {
      e.preventDefault()
      var v = inp.value.trim()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { msg.textContent = 'Please enter a valid email address.'; return }
      go.disabled = true; msg.textContent = ''
      fetch(API + 'email', { method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify({ email: v }), cache: 'no-store' })
        .then(function (res) {
          if (res.ok) { b.textContent = "Thanks, we'll write to " + v; b.classList.remove('lcochat-ask'); poll(); return }
          go.disabled = false; msg.textContent = res.status === 429 ? 'Please try again later.' : 'That did not save. Please try again.'
        }).catch(function () { go.disabled = false; msg.textContent = 'That did not save. Please try again.' })
    })
    if (state.typing) log.insertBefore(r, state.typing); else log.appendChild(r)
    scrollDown()
  }

  // While a reply is owed: every 2 s for 30 s after the visitor's line, then 4 s (to 2 min), then 10 s. Otherwise the calm idle schedule.
  function nextDelay() {
    if (state.owedSince) { var age = Date.now() - state.owedSince; return age < 30000 ? 2000 : age < 120000 ? 4000 : 10000 }
    var idle = Date.now() - state.idleSince
    return idle < 120000 ? 4000 : idle < 600000 ? 8000 : 15000
  }
  function poll() {
    clearTimeout(state.timer)
    if (!state.id || !state.open) return
    if (document.hidden) return   // stop while the tab is hidden; the visibilitychange handler resumes it
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
      state.timer = setTimeout(poll, nextDelay())
    }).catch(function () { state.timer = setTimeout(poll, 15000) })
  }

  function send() {
    if (state.busy) return
    var text = ta.value.trim()
    if (!text && !state.files.length) return
    if (text.length > MAX_TEXT) { showErr('That is a bit long. Please keep it under ' + MAX_TEXT + ' characters.'); return }
    post({ text: text, files: state.files.map(function (f) { return f.id }) })
  }
  function rid() { var a = new Uint8Array(8); try { crypto.getRandomValues(a) } catch (e) { for (var i = 0; i < 8; i++) a[i] = Math.floor(Math.random() * 256) } return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2) }).join('') }
  // o = { text, files? } for typed lines; { text: <chip label>, chip: <chip value> } for a tap on a quick reply
  function post(o) {
    if (state.busy) return
    state.busy = true; sendB.disabled = true; showErr('')
    var body = { text: o.text }
    if (o.files && o.files.length) body.file_ids = o.files
    if (o.chip) { body.chip = o.chip; body.client_id = 'chip-' + rid() }
    fetch(API + 'message', { method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify(body), cache: 'no-store' }).then(function (r) {
      return r.json().catch(function () { return {} }).then(function (j) { return { s: r.status, j: j } })
    }).then(function (x) {
      state.busy = false; sendB.disabled = false
      if (!(x.s === 200 && x.j && x.j.ok)) setChipsDisabled(false)
      if (x.s === 200 && x.j && x.j.ok) {
        if (x.j.conversation) { state.id = x.j.conversation; remember(); setPhoto() }
        if (!o.chip) { ta.value = ''; grow(); state.files = []; paintChips() }
        clearChips(); hotUpload(false); state.idleSince = Date.now()
        state.owedSince = Date.now(); state.ackSeen = x.j.ack === true
        showTyping()
        state.sentOnce = true
        if (!state.emailAsked) { clearTimeout(state.emailTimer); state.emailTimer = setTimeout(promptEmail, 20000) }
        poll()
        return
      }
      if (x.s === 404 && state.id) { state.id = null; state.last = 0; state.seen = {}; state.lastFrom = ''; remember(); resetLog(); showErr('That chat had ended. Please send your message again.'); return }
      if (x.s === 429) return showErr('Please slow down a little and try again in a minute.')
      if (x.s === 413) return showErr('That message is too long.')
      if (x.s === 503 || x.s === 403 || x.s === 404) return fallback()
      showErr((x.j && x.j.message) || 'Sorry, that did not send. Please try again.')
    }).catch(function () { state.busy = false; sendB.disabled = false; setChipsDisabled(false); fallback('We could not reach the server. Please try again, or open the full design tool.') })
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
        if (x.s === 200 && x.j.file_id) { state.files.push({ id: x.j.file_id, name: f.name.slice(0, 30) }); paintChips(); hotUpload(false); return }
        showErr(x.s === 415 ? 'Only photos please (JPEG, PNG, WebP or HEIC).' : x.s === 429 ? 'Too many photos for now. Please try again later.' : 'That photo did not upload. Please try again.')
      }).catch(function () { showErr('That photo did not upload. Please try again.') })
  }

  // 'Online' only while the server says chat is on (GET visit/config -> { enabled }, the same switch that makes every send answer 503).
  // Read when the panel opens, not on page load; no id, no body, nothing about the visitor. If the read fails the header is left as it is.
  function checkOnline() {
    if (checked && Date.now() - checked < 60000) return
    checked = Date.now()
    fetch(API + 'config', { headers: { 'x-lco-design': '1' }, cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null }).then(function (j) {
      if (!j || typeof j.enabled !== 'boolean') return
      dot.className = 'lcochat-dot' + (j.enabled ? '' : ' off'); stText.textContent = j.enabled ? 'Online' : 'Away: leave a message in the design tool'
    }).catch(function () { /* keep the header as it is */ })
  }
  // Catalog popup: once per browser, about 15 s after the page loads, never while the chat panel is open. No email, no request:
  // it is a link to a file on this site. Closes with the x, Escape or a click outside; the 'seen' flag is set when it is shown.
  var cat, catFrom
  function catClose() { if (!cat || cat.hidden) return; cat.hidden = true; if (catFrom && catFrom.focus) { try { catFrom.focus() } catch (e) { /* ignore */ } } }
  function catShow() {
    try { if (localStorage.getItem(CAT_KEY)) return } catch (e) { return }   // storage blocked: never nag
    if (state.open || cat) return
    try { localStorage.setItem(CAT_KEY, '1') } catch (e) { return }
    catFrom = document.activeElement
    cat = el('div', 'lcocat'); cat.setAttribute('role', 'dialog'); cat.setAttribute('aria-modal', 'true'); cat.setAttribute('aria-label', 'Get our catalog')
    var card = el('div', 'lcocat-card'), im = el('div', 'lcocat-img'), pic = el('img'); pic.src = '/catalog/cover.jpg'; pic.alt = 'The Local Cabinetry catalog cover'; im.appendChild(pic)
    var tx = el('div', 'lcocat-tx')
    tx.appendChild(el('h2', '', 'See every door style and finish'))
    tx.appendChild(el('p', '', 'Our catalog: six door collections, seventeen finishes and how every cabinet is built. Free PDF, no sign-up.'))
    var go = el('a', 'lcocat-go', 'Download the catalog'); go.href = CATALOG; go.setAttribute('download', ''); go.setAttribute('data-track', 'catalog-popup')
    tx.appendChild(go)
    var x = el('button', 'lcocat-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close')
    card.appendChild(im); card.appendChild(tx); card.appendChild(x); cat.appendChild(card); document.body.appendChild(cat)
    x.addEventListener('click', catClose); go.addEventListener('click', function () { setTimeout(catClose, 0) })
    cat.addEventListener('click', function (e) { if (e.target === cat) catClose() })
    cat.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); catClose() } else if (e.key === 'Tab') { e.preventDefault(); (document.activeElement === go ? x : go).focus() } })
    go.focus()
  }
  function open() {
    catClose()
    state.open = true; panel.hidden = false; btn.setAttribute('aria-expanded', 'true'); btn.classList.add('open'); if (wa) wa.classList.add('open'); checkOnline()
    if (state.id) poll()   // only re-reads a conversation this browser already has
    setTimeout(function () { ta.focus() }, 0)
  }
  function close() {
    state.open = false; panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.classList.remove('open'); if (wa) wa.classList.remove('open'); clearTimeout(state.timer)
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
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Chat with Hannah at The Local Cabinetry')
    var head = el('div', 'lcochat-head')
    head.appendChild(avatar(false))
    var who = el('div', 'lcochat-who')
    who.appendChild(el('h2', '', 'Hannah'))
    var st = el('div', 'lcochat-st'); dot = el('span', 'lcochat-dot'); stText = el('span', '', 'Online'); st.appendChild(dot); st.appendChild(stText)
    who.appendChild(st); head.appendChild(who)
    var ext = el('a', 'lcochat-x lcochat-ext'); ext.href = DESIGN; ext.title = 'Open the full design tool'; ext.setAttribute('aria-label', 'Open the full design tool'); ext.setAttribute('data-track', 'chat-design-link')
    ext.appendChild(svg('M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3'))
    if (WA_URL) {
      var wh = el('a', 'lcochat-x lcochat-ext'); wh.href = WA_URL; wh.target = '_blank'; wh.rel = 'noopener'; wh.title = 'Message us on WhatsApp'
      wh.setAttribute('aria-label', 'Message us on WhatsApp'); wh.setAttribute('data-track', 'chat-whatsapp')
      wh.appendChild(svg(WA_PATH)); head.appendChild(wh)
    }
    head.appendChild(ext)
    var x = el('button', 'lcochat-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close chat'); x.setAttribute('data-track', 'chat-close')
    head.appendChild(x)
    log = el('div', 'lcochat-log'); log.setAttribute('role', 'log'); log.setAttribute('aria-live', 'polite'); log.setAttribute('aria-label', 'Conversation')
    err = el('div', 'lcochat-err'); err.hidden = true; err.setAttribute('role', 'alert')

    var box = el('div', 'lcochat-box')
    chips = el('div', 'lcochat-tools')
    var rw = el('div', 'lcochat-row')
    photoIn = el('input'); photoIn.type = 'file'; photoIn.accept = 'image/jpeg,image/png,image/webp,image/heic'; photoIn.hidden = true
    photoB = el('button', 'lcochat-ic'); photoB.type = 'button'; photoB.setAttribute('aria-label', 'Add a photo'); setPhoto()
    photoB.appendChild(svg('M21 19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3l2-2h4l2 2h3a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'))
    photoB.addEventListener('click', function () { if (state.id) photoIn.click() })
    ta = el('textarea'); ta.rows = 1; ta.maxLength = MAX_TEXT; ta.placeholder = 'Type your message'; ta.setAttribute('aria-label', 'Your message')
    sendB = el('button', 'lcochat-send'); sendB.type = 'button'; sendB.setAttribute('aria-label', 'Send'); sendB.setAttribute('data-track', 'chat-send')
    sendB.appendChild(svg('M22 2L11 13M22 2l-7 20-4-9-9-4z'))
    rw.appendChild(photoB); rw.appendChild(ta); rw.appendChild(sendB); rw.appendChild(photoIn)
    box.appendChild(chips); box.appendChild(rw)

    panel.appendChild(head); panel.appendChild(log); panel.appendChild(err); panel.appendChild(box)
    document.body.appendChild(btn); document.body.appendChild(panel)
    if (WA_URL) {
      wa = el('a', 'lcochat-wa'); wa.href = WA_URL; wa.target = '_blank'; wa.rel = 'noopener'; wa.title = 'Message us on WhatsApp'
      wa.setAttribute('aria-label', 'Message us on WhatsApp'); wa.setAttribute('data-track', 'whatsapp-open'); wa.appendChild(svg(WA_PATH))
      document.body.appendChild(wa)
    }
    greet()
    setTimeout(catShow, 15000)

    btn.addEventListener('click', function () { state.open ? close() : open() })
    x.addEventListener('click', close)
    sendB.addEventListener('click', send)
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send() } })
    ta.addEventListener('input', grow)
    photoIn.addEventListener('change', pickPhoto)
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
