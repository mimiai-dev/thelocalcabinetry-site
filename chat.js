/* Chat bubble for thelocalcabinetry.com. One same-origin file: no third party, no cookie, no account.
 *
 *   <script src="/chat.js" defer data-label="Chat with us"></script>
 *
 * It replaces the old floating contact link script. The corner button looks and sits the same (bottom right, dark navy pill,
 * chat-bubble icon) but opens a panel. Lines go to OUR server (same origin, /design/api/visit/*) and land with the team; the
 * replies come back into the panel (polling). No link from the panel to the design page (/design): they are different things (owner 2026-10-21).
 *
 * EMAIL STEP (owner 2026-10-20, mandatory): right after the AI-or-person choice, one small step asks for the visitor's email (field, one-line privacy note, Start chat). The server
 * config switches it (email_gate first, the default | after_chip | off = the kill switch, or the older email_required). The address stays in this browser (localStorage, optional) and is
 * sent ONCE, with the first message of a conversation; a returning visitor (stored email or an existing conversation) skips the step. Someone who types it and closes the chat sends us
 * nothing. A conversation the server says has no email yet (need_email: true, e.g. begun before the step) gets the same ask as a card in the thread (POST visit/email).
 * A 'seen' ping (POST visit/seen) tells the server which of our lines were really on screen, so the one reminder mail goes only for an unseen reply.
 * Sends NOTHING until the visitor presses Send on a first message: no request on page load, none when the panel opens
 * (the old conversation, if the browser kept one, is only re-read). The server mints the conversation id on the first message;
 * it is kept in this browser's localStorage under lco_visit_v1 and sent in the x-lco-visit header (never in a URL).
 * Text only: every string from the server is put in with textContent, never as HTML.
 * CSP (meta tag): script-src 'self', connect-src 'self', style-src allows the one inline <style> this file adds. No change needed.
 *
 * ONE BUTTON (owner 2026-10-21, T-261020-5): one floating "Chat with us" button and nothing else in the corner (the round WhatsApp bubble is gone; WhatsApp is
 * inside the chat). First screen: "AI assistant: design and quotation, 5% off your order" or "Talk to a person". The person path offers three ways:
 * Email us (owner 2026-10-21: the /contact form, pre-filled from sessionStorage with what was typed, never with an email or phone, never via the URL), WhatsApp (a wa.me link) and Call (a tel: link; the number is PHONE below, written from
 * site.config.json by scripts/site-config.mjs). Neither link sends anything from here.
 * CHOICE FIRST (owner 2026-10-20): the panel opens with two tap-first choices at the top, the AI assistant or "Talk to a person". The choice
 * rides on the first message as `route`; later a small link switches it (POST visit/mode {mode: ai|human}) and the server stores it on the thread
 * (buyer_threads.human_mode): a human-mode thread gets no AI reply, one honest ack line from the server, and the WhatsApp button stays the instant alternative.
 * Honest wording: the AI side always says it is an AI assistant; the header never shows the AI as a person. The first bubble is a LOCAL greeting
 * (never sent, never stored on the server); every later line and every reply comes from the desk. While no reply has come a 'typing' indicator shows for at most 60 s.
 * If the server answers "closed" (kill switch), is unreachable, or an older server does not know the path, the panel says so and
 * points to the design tool. A WhatsApp link (header icon + the person path) only opens WhatsApp on the owner's phone: it sends nothing.
 * LOOK (owner 2026-10-21, T-261021-5): the AI Elements chat layout (as vendored for the design page in the ops repo, lib/design-site/vendor) redrawn in this plain
 * file: brand-kit mark (no letter avatar), an "AI-powered design" label, bubbles, suggestion chips, shimmer typing line, jump-to-latest button and one rounded
 * composer box. No in-chat "Talk to a person" in AI mode (the choice is the first screen). Every target is 48 px or more with 8 px gaps; inputs are 16 px
 * (no iOS focus zoom); touch-action: manipulation on the page and the chat; on phones the panel follows visualViewport so the composer stays above the keyboard.
 */
(function () {
  'use strict'
  if (window.__lcoChat) return
  window.__lcoChat = true
  var s = document.currentScript
  var label = ((s && s.dataset && s.dataset.label) || 'Chat with us').trim().slice(0, 40)
  // the brand-kit mark (gold TLC on navy, made for a round crop): the avatar on our lines and in the header, never a letter
  var MARK = '/brand-kit-a5649501d5a1feec/logos/tlc-avatar-navy-192.webp'
  var CONTACT = '/contact/', PREFILL_KEY = 'lco_contact_prefill_v1'
  // The owner's WhatsApp number: the ONE place to change it (country code, digits only, no + and no leading 0).
  // A placeholder-looking number renders no WhatsApp button at all: a button that dials a stranger is worse than none.
  var WHATSAPP = '84976096632'
  var WA_TEXT = 'Hi, I saw your kitchens on thelocalcabinetry.com'
  var PLACEHOLDERS = [/^0+$/, /^(\d)\1+$/, /^1?234567890$/, /^1?5551?\d{4}$/, /^123456789\d*$/, /^(44)?0?7700900\d{3}$/, /^1?5550\d{3}$/]
  function waOk(n) { return /^[1-9]\d{7,14}$/.test(n) && !PLACEHOLDERS.some(function (re) { return re.test(n) }) }
  var WA_URL = waOk(WHATSAPP) ? 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(WA_TEXT) : ''
  // The phone number is never written out in a page or in a tel: link (owner 2026-10-23): it is put together here from parts when the chat opens, and the
  // tel: href is built only on click. Do not edit the parts: site.config.json is the one place, scripts/site-config.mjs writes this line.
  var P = ['1', '85', '7', '93', '0', '83', '24']
  function phoneNum() { return P.join('') }
  function phoneShow() { var n = phoneNum(); return '(' + n.slice(1, 4) + ') ' + n.slice(4, 7) + '-' + n.slice(7) }
  var WA_PATH = 'M3 21l1.6-5A8.5 8.5 0 1 1 8 19.4zM9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.5-2-1-1 .8c-1-.4-2-1.4-2.4-2.4l.8-1-1-2z'
  var API = '/design/api/visit/'
  // the few words the page itself writes, in the visitor's language (English or Chinese); every reply text comes from the server
  var ZH = /^zh/i.test(String((navigator.languages && navigator.languages[0]) || navigator.language || ''))
  var T = ZH ? { seen: '已读', typing: '正在输入', typingUs: 'The Local Cabinetry 正在输入', unread: '有新消息' }
             : { seen: 'Seen', typing: 'is typing', typingUs: 'The Local Cabinetry is typing', unread: 'new message' }
  var CATALOG = '/catalog/The-Local-Cabinetry-Catalog.pdf'
  var CAT_KEY = 'lco_welcome_v1'   // set once the welcome card was shown: it never comes back for this browser (was lco_catalog_pop_v1, the catalog-only popup; owner 2026-10-24 T-261024-23)
  var SALE_KEY = 'lco_ann_sale_v1'   // the red sale bar was closed (a new offer = a new key)
  var ANN_KEY = 'lco_ann_v1'       // the top bar was closed (a new announcement = a new key)
  var KEY = 'lco_visit_v1'
  var MAX_TEXT = 1200, MAX_PHOTO = 5 * 1024 * 1024

  var state = { id: null, last: 0, open: false, busy: false, timer: 0, idleSince: Date.now(), seen: {}, files: [], closed: false, lastFrom: '', typing: null, typingTimer: 0, emailAsked: false, emailTimer: 0, sentOnce: false, day: '', owedSince: 0, ackSeen: false, still: null, chipsEl: null, route: '', mode: '', humanTyping: false, email: '', emailMode: 'first', maxUs: 0, seenSent: 0, needEmail: false, emailCard: null }
  try { var saved = localStorage.getItem(KEY); if (saved && /^[0-9a-f]{32}$/.test(saved)) state.id = saved } catch (e) { /* storage blocked: memory only */ }
  // The visitor's email: asked before the first message, kept only in this browser (localStorage, try/catch: it works without it) and sent ONCE,
  // with the first message of a conversation. Someone who types it and closes the chat sends us nothing.
  var EMAIL_LS = 'lco_email_v1'
  var ASK_EMAIL = 'Your email, so we can send your design and reply if you step away'
  var EMAIL_NOTE = 'We only use it for your project. No spam.'
  // the same rule as the server (ops lib/web-reminder.ts cleanEmail), on the lower-cased address: what passes here is never refused there
  function validEmail(v) {
    return typeof v === 'string' && v.length <= 254 && /^[^\s@<>,;:"()\[\]\\]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(v.toLowerCase())
  }
  function visitorTz() { try { var z = Intl.DateTimeFormat().resolvedOptions().timeZone; return typeof z === 'string' && /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$|^UTC$/.test(z) ? z : '' } catch (e) { return '' } }
  function loadEmail() { try { var v = (localStorage.getItem(EMAIL_LS) || '').trim().toLowerCase(); return validEmail(v) ? v : '' } catch (e) { return '' } }
  function storeEmail(v) { try { if (v) localStorage.setItem(EMAIL_LS, v); else localStorage.removeItem(EMAIL_LS) } catch (e) { /* memory only */ } }
  state.email = loadEmail()
  // The visitor's route choice (AI assistant or a person), remembered for this browser session only.
  var ROUTE_KEY = 'lco_route_v1'
  try { var rr = sessionStorage.getItem(ROUTE_KEY); if (rr === 'ai' || rr === 'human') state.route = rr } catch (e) { /* memory only */ }
  function setRoute(r) { state.route = r; try { sessionStorage.setItem(ROUTE_KEY, r) } catch (e) { /* memory only */ } syncRouteFields() }
  // the contact forms post the choice as reply_with = ai | person (ops: Reply with line + human mode); the chat's own route stays ai | human
  function syncRouteFields() { try { Array.prototype.forEach.call(document.querySelectorAll('input[name=reply_with][type=radio]'), function (i) { i.checked = i.value === (state.route === 'human' ? 'person' : state.route) }) } catch (e) { /* ignore */ } }
  function humanMode() { return state.mode === 'human' || (state.mode !== 'ai' && state.route === 'human') }
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
    // touch-action: manipulation on the page and the chat: no double-tap zoom, so no tap waits for a second one (pinch zoom stays; no user-scalable=no)
    'html,body{touch-action:manipulation}',
    '.lcochat-btn{position:fixed;right:16px;bottom:16px;z-index:2147483000;display:inline-flex;align-items:center;gap:8px;min-height:48px;padding:0 20px;border:0;border-radius:999px;background:#0e2740;color:#fff;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;',
    'font:600 15px/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 6px 24px rgba(8,20,34,.25)}',
    '.lcochat-btn:hover{background:#14365a}',
    '.lcochat-btn svg{flex:0 0 18px}',
    // never over content: the pill sits above the iPhone home bar, the page ends with room for it, and it turns into a round
    // icon button (same aria-label, same tap) while text or a link is under it. "button." beats the pages' inline placeholder style.
    'button.lcochat-btn{bottom:calc(16px + env(safe-area-inset-bottom))}',
    'button.lcochat-btn.lcochat-sm{width:52px;min-height:52px;height:52px;padding:0;gap:0;justify-content:center}',
    'button.lcochat-btn.lcochat-sm span{display:none}',
    'button.lcochat-btn .lcochat-unread{position:absolute;top:-3px;right:-3px;width:14px;height:14px;border-radius:50%;background:#d8b25c;border:2px solid #fff}',
    // hidden while the page scrolls down (back on scroll up, ~600 ms after scrolling stops, and at the page end); transform + opacity only, so it stays
    // in the tab order, and keyboard focus shows it again
    'button.lcochat-btn{transition:transform .2s ease,opacity .2s ease}',
    'button.lcochat-btn.lcochat-hide{transform:translateY(calc(100% + 32px));opacity:0;pointer-events:none}',
    'button.lcochat-btn.lcochat-hide:focus-visible{transform:none;opacity:1;pointer-events:auto}',
    '@media (prefers-reduced-motion:reduce){button.lcochat-btn{transition:none}}',
    // A CABINET DOOR, not a widget (owner 2026-10-23: the glowing pill "looks AI"): a flat navy shaker door with an inset frame line, a brass pull on the right, a serif label.
    // Every 7 s (first after 3 s) the door swings open on its left hinge and closes. No gradient, no glow, no pulse. Off while the chat is open, while hidden and for prefers-reduced-motion.
    'button.lcochat-btn{min-height:54px;padding:0 52px 0 24px;gap:0;border-radius:6px;background:#0e2740;box-shadow:0 0 0 1px #e9dfc8,0 5px 14px rgba(8,20,34,.35);font:600 16px/1 Georgia,"Times New Roman",serif;letter-spacing:.02em;transform:perspective(700px);transform-origin:0 50%;animation:lcochat-door 7s ease-in-out 3s infinite}',
    'button.lcochat-btn:hover{background:#14365a}',
    'button.lcochat-btn:not(.lcochat-sm) svg{display:none}',
    'button.lcochat-btn::before{content:"";position:absolute;inset:5px;border:1px solid rgba(255,255,255,.3);border-radius:2px;pointer-events:none}',
    'button.lcochat-btn::after{content:"";position:absolute;right:17px;top:50%;width:5px;height:24px;margin-top:-12px;border-radius:3px;background:#d3ab5a;box-shadow:inset 1px 0 0 rgba(255,255,255,.5),1px 1px 2px rgba(0,0,0,.35);pointer-events:none}',
    'button.lcochat-btn.lcochat-sm{width:56px;min-height:56px;height:56px;padding:0}',
    'button.lcochat-btn.lcochat-sm::after{display:none}',
    'button.lcochat-btn.open,button.lcochat-btn.lcochat-hide{animation:none}',
    '@keyframes lcochat-door{0%,68%,100%{transform:perspective(700px) rotateY(0)}76%{transform:perspective(700px) rotateY(-34deg)}84%{transform:perspective(700px) rotateY(-34deg)}92%{transform:perspective(700px) rotateY(-6deg)}96%{transform:perspective(700px) rotateY(0)}}',
    '@media (prefers-reduced-motion:reduce){button.lcochat-btn{animation:none}}',
    'body .site-footer .copy{padding-bottom:calc(100px + env(safe-area-inset-bottom))}',
    '.lcochat-btn:focus-visible,.lcochat-panel button:focus-visible,.lcochat-panel a:focus-visible,.lcochat-panel input:focus-visible{outline:3px solid #b4862f;outline-offset:2px}',
    '.lcochat-panel{position:fixed;right:16px;bottom:80px;z-index:2147483001;width:400px;max-width:calc(100vw - 32px);height:min(640px,calc(100dvh - 104px));display:flex;flex-direction:column;background:#fff;color:#14273f;',
    'border-radius:16px;box-shadow:0 16px 48px rgba(8,20,34,.28);overflow:hidden;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;touch-action:manipulation;-webkit-tap-highlight-color:transparent;-webkit-text-size-adjust:100%}',
    '.lcochat-panel *,.lcochat-panel *::before,.lcochat-panel *::after{box-sizing:border-box}',
    '.lcochat-panel[hidden]{display:none}',
    // header: brand mark, name, Online, the "AI-powered design" label; WhatsApp and close are 48 px with 8 px between them
    '.lcochat-head{display:flex;align-items:center;gap:12px;padding:10px 8px 10px 16px;background:#0e2740;color:#fff;border-bottom:2px solid #b8924a}',
    '.lcochat-av{flex:0 0 40px;width:40px;height:40px;border-radius:50%;display:block;background:#0e2740;object-fit:cover;box-shadow:0 0 0 1px rgba(216,178,92,.6)}',
    '.lcochat-av.sm{flex-basis:32px;width:32px;height:32px}',
    '.lcochat-who{flex:1;min-width:0}',
    '.lcochat-who h2{margin:0;font:600 17px/1.25 Georgia,"Times New Roman",serif;letter-spacing:.01em;color:#fff}',
    '.lcochat-st{display:flex;align-items:center;gap:6px;margin-top:2px;font-size:13px;line-height:1.3;color:#cfd8e3}',
    '.lcochat-mode.ai{display:flex;margin-top:3px;padding:0;border:0;color:#c9b27a;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase}',
    '.lcochat-dot.off{background:#9aa3ad}',
    '.lcochat-day{align-self:center;margin:10px 0 2px;padding:2px 12px;color:#51606f;font-size:12px;font-weight:600}',
    '.lcochat-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#5fae7e}',
    '.lcochat-hb{display:flex;gap:8px;flex:0 0 auto}',
    '.lcochat-x{flex:0 0 48px;width:48px;height:48px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:12px;background:transparent;color:#fff;font-size:28px;line-height:1;cursor:pointer;text-decoration:none}',
    '@media (hover:hover){.lcochat-x:hover{background:rgba(255,255,255,.1)}}',
    // the conversation: calm background, real bubbles, the brand mark once per group of our lines
    '.lcochat-logw{position:relative;flex:1;min-height:0;display:flex;flex-direction:column}',
    '.lcochat-log{flex:1;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:20px 16px 16px;display:flex;flex-direction:column;gap:6px;background:#faf9f6}',
    '.lcochat-r{display:flex;gap:10px;align-items:flex-end;max-width:88%;margin-top:8px}',
    '.lcochat-r.you{align-self:flex-end;flex-direction:row-reverse}',
    '.lcochat-r.us{align-self:flex-start}',
    '.lcochat-r.us+.lcochat-r.us{margin-top:0}',
    '.lcochat-r.us:has(+.lcochat-r.us) .lcochat-av{visibility:hidden}',
    '.lcochat-c{display:flex;flex-direction:column;gap:4px;min-width:0}',
    '.lcochat-r.you .lcochat-c{align-items:flex-end}',
    '.lcochat-m{padding:10px 14px;border-radius:18px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:15.5px;line-height:1.5}',
    '.lcochat-r.you .lcochat-m{background:#0e2740;color:#fff;border-bottom-right-radius:6px}',
    '.lcochat-r.us .lcochat-m{background:#fff;color:#14273f;border:1px solid #e7e5df;border-bottom-left-radius:6px;box-shadow:0 1px 2px rgba(14,39,64,.05)}',
    '.lcochat-m small{display:block;margin-top:4px;opacity:.75;font-size:12px}',
    '.lcochat-t{font-size:12px;color:#7a7468;padding:0 6px}',
    // suggestion chips: 48 px tall, 8 px apart, whole chip is the button
    '.lcochat-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;max-width:100%}',
    '.lcochat-guide{display:inline-flex;align-items:center;gap:6px;margin-top:8px;min-height:40px;padding:8px 14px;border:1px solid #e7e5df;border-radius:20px;background:#fff;color:#0e2740;font-size:14px;text-decoration:none}',
    '.lcochat-guide::after{content:"\\2197";font-size:13px;color:#51606f}.lcochat-guide:hover{border-color:#0e2740}',
    '.lcochat-chip{display:inline-flex;align-items:center;gap:8px;min-height:48px;min-width:48px;padding:0 18px;border:1px solid #d9d4c8;border-radius:999px;background:#fff;color:#0e2740;font:600 15px/1.1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}',
    '.lcochat-chip:active:not(:disabled){background:#f3f0ea;border-color:#b4862f}',
    '@media (hover:hover){.lcochat-chip:hover:not(:disabled){border-color:#0e2740;background:#f8f6f1}}',
    '.lcochat-chip:disabled{opacity:.55;cursor:default}',
    '.lcochat-sw{display:inline-block;width:18px;height:18px;border-radius:50%;border:1px solid rgba(14,39,64,.35);flex:0 0 18px}',
    '.lcochat-nm{font-size:12px;font-weight:600;color:#51606f;margin:0 6px 2px}',
    // first screen: two big cards (the whole card is the button), then the person options
    '.lcochat-route{padding:20px 16px;background:#fff;display:flex;flex-direction:column;gap:12px}',
    '.lcochat-route[hidden]{display:none}',
    '.lcochat-route h3{margin:0 0 4px;font:600 18px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#0e2740}',
    '.lcoroute-b{display:flex;align-items:center;gap:14px;width:100%;min-height:72px;padding:14px 16px;border:1px solid #e7e5df;border-radius:14px;background:#fff;color:#14273f;text-align:left;cursor:pointer;font:inherit;text-decoration:none;',
    'touch-action:manipulation;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;transition:background-color .12s,border-color .12s}',
    '.lcoroute-b *{pointer-events:none}',
    '.lcoroute-b:active{background:#f3f0ea;border-color:#b4862f}',
    '@media (hover:hover){.lcoroute-b:hover{border-color:#0e2740}}',
    '.lcoroute-b.ai{background:#0e2740;border-color:#0e2740;color:#fff}',
    '.lcoroute-b.ai:active{background:#14365a}',
    '.lcoroute-ic{flex:0 0 40px;width:40px;height:40px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:#f3f0ea;color:#0e2740}',
    '.lcoroute-b.ai .lcoroute-ic{background:rgba(216,178,92,.16);color:#d8b25c}',
    '.lcoroute-b svg{width:22px;height:22px}',
    '.lcoroute-t{flex:1;min-width:0}',
    '.lcoroute-t b{display:block;font-size:16px;font-weight:600}',
    '.lcoroute-t small{display:block;font-size:14px;margin-top:2px;color:#51606f}',
    '.lcoroute-b.ai .lcoroute-t small{color:#cfd8e3}',
    '.lcoroute-back{align-self:flex-start;min-height:48px;min-width:48px;margin-left:-12px;padding:0 12px;border:0;border-radius:10px;background:transparent;color:#0e2740;font:600 15px/1 system-ui,sans-serif;text-decoration:underline;cursor:pointer}',
    '.lcochat-route.bar{flex-direction:row;align-items:center;justify-content:space-between;gap:8px;padding:0 8px 0 16px;border-bottom:1px solid #e7e5df;font-size:14px;color:#51606f}',
    '.lcochat-switch{min-height:48px;padding:0 10px;border:0;border-radius:10px;background:transparent;color:#0e2740;font:600 14px/1 system-ui,sans-serif;text-decoration:underline;cursor:pointer}',
    '.lcochat-switch:disabled{opacity:.5;cursor:default}',
    '.lcochat-panel.picking .lcochat-logw,.lcochat-panel.picking .lcochat-err,.lcochat-panel.picking .lcochat-box,.lcochat-panel.picking .lcochat-gate{display:none}',
    '.lcochat-panel.picking .lcochat-route{flex:1;justify-content:flex-start;overflow-y:auto}',
    '.route-pick{border:0;margin:6px 0 10px;padding:0}.route-pick legend{padding:0;font-weight:600;margin-bottom:6px}.route-pick label{display:flex;gap:8px;align-items:center;margin:4px 0;font-size:15px}',
    '.lcochat-panel.gating .lcochat-logw,.lcochat-panel.gating .lcochat-err,.lcochat-panel.gating .lcochat-box{display:none}',
    '.lcochat-gate{flex:1;display:flex;flex-direction:column;justify-content:center;gap:16px;padding:24px 20px;background:#fff;overflow-y:auto}',
    '.lcochat-gate[hidden]{display:none}',
    '.lcochat-gate h3{margin:0;font:600 18px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#0e2740}',
    '.lcochat-gate-f{display:flex;flex-direction:column;gap:12px}',
    '.lcochat-gate-f input{min-height:52px;padding:0 16px;border:1px solid #cfc9bd;border-radius:12px;font:inherit;font-size:16px;color:#14273f;background:#fff}',
    '.lcochat-gate-go{min-height:52px;border:0;border-radius:12px;background:#0e2740;color:#fff;font:600 16px/1 system-ui,sans-serif;cursor:pointer;touch-action:manipulation}',
    '.lcochat-gate-go:hover{background:#14365a}',
    '.lcochat-gate-msg{min-height:18px;font-size:14px;color:#8a1c12}',
    '.lcochat-gate-note{margin:0;font-size:14px;color:#51606f}',
    '.lcochat-gate-note a{color:#0e2740;font-weight:600}',
    '.lcochat-seenl{align-self:flex-end;font-size:12px;color:#51606f;margin:2px 6px 0}',
    '.lcochat-still{font-size:12px;color:#7a7468;margin:2px 6px 0}',
    // typing: three dots in a bubble and a shimmering caption
    '.lcochat-typing .lcochat-m{display:flex;gap:5px;align-items:center;padding:14px 16px}',
    '.lcochat-typing i{width:7px;height:7px;border-radius:50%;background:#9aa3ad;animation:lcochat-b 1.2s infinite ease-in-out}',
    '.lcochat-typing i:nth-child(2){animation-delay:.15s}.lcochat-typing i:nth-child(3){animation-delay:.3s}',
    '.lcochat-tcap{background:linear-gradient(90deg,#7a7468 0%,#7a7468 35%,#d6cfc0 50%,#7a7468 65%,#7a7468 100%);background-size:250% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:lcochat-sh 2.2s linear infinite}',
    '@keyframes lcochat-b{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-4px);opacity:1}}',
    '@keyframes lcochat-sh{from{background-position:100% 0}to{background-position:0 0}}',
    '@media (prefers-reduced-motion:reduce){.lcochat-typing i{animation:none;opacity:.7}.lcochat-tcap{animation:none;background:none;color:#7a7468}}',
    '.lcochat-down{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);width:48px;height:48px;border:1px solid #e7e5df;border-radius:50%;background:#fff;color:#0e2740;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(8,20,34,.15);cursor:pointer}',
    '.lcochat-down[hidden]{display:none}',
    // the jump button never covers the last bubble: while it shows, the log keeps a strip at the bottom for it (owner 2026-10-24, T-261024-10)
    '.lcochat-log.has-down{padding-bottom:72px}',
    '.lcochat-err{padding:8px 16px;font-size:14px;background:#fdecea;color:#8a1c12}',
    '.lcochat-err[hidden]{display:none}',
    // the composer: one rounded box (photos, the message, then photo and send buttons), 16 px text so iOS does not zoom
    '.lcochat-box{padding:8px 12px calc(12px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid #efece5}',
    '.lcochat-pi{display:flex;flex-direction:column;border:1px solid #d9d4c8;border-radius:20px;background:#fff;transition:border-color .12s,box-shadow .12s}',
    '.lcochat-pi:focus-within{border-color:#0e2740;box-shadow:0 0 0 3px rgba(180,134,47,.22)}',
    '.lcochat-pi textarea{display:block;width:100%;min-height:48px;max-height:140px;resize:none;overflow-y:auto;margin:0;padding:12px 16px 4px;border:0;outline:0;background:transparent;font:inherit;font-size:16px;line-height:1.45;color:#14273f}',
    '.lcochat-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;padding:0 4px 4px}',
    '.lcochat-ic,.lcochat-send{flex:0 0 48px;width:48px;height:48px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;touch-action:manipulation}',
    '.lcochat-ic{border:0;background:transparent;color:#51606f}',
    '.lcochat-ic.hot{color:#0e2740;box-shadow:inset 0 0 0 2px #b4862f}',
    '.lcochat-send{border:0;background:#0e2740;color:#fff}',
    '.lcochat-send:hover{background:#14365a}',
    '.lcochat-send:disabled,.lcochat-ic[aria-disabled=true]{opacity:.4;cursor:default}',
    '.lcochat-ask{position:relative;min-width:240px;padding-right:52px}',
    '.lcochat-ask-x{position:absolute;top:0;right:0;width:48px;height:48px;border:0;background:transparent;color:#7a7468;font-size:18px;line-height:1;cursor:pointer;border-radius:50%}',
    '.lcochat-ask-f{display:flex;gap:8px;margin-top:10px;align-items:center}',
    '.lcochat-ask-f input{flex:1;min-width:0;min-height:48px;padding:0 14px;border:1px solid #cfc9bd;border-radius:24px;font:inherit;font-size:16px}',
    '.lcochat-ask-f button{flex:0 0 48px;width:48px;height:48px;border:0;border-radius:50%;background:#0e2740;color:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}',
    '.lcochat-ask-msg{margin-top:4px;font-size:13px;color:#8a1c12}',
    '.lcochat-mini{min-height:48px;padding:0 16px;border:0;border-radius:12px;background:#0e2740;color:#fff;font:600 14px/1 system-ui,sans-serif;cursor:pointer}',
    '.lcochat-mini.alt{background:#f3f0ea;color:#0e2740;border:1px solid #e7e5df}',
    '.lcochat-tools{display:flex;flex-wrap:wrap;gap:8px;padding:8px 8px 0;align-items:center;font-size:13px}',
    '.lcochat-tools:empty{display:none}',
    '@media (max-width:520px){.lcochat-panel{inset:0;width:auto;max-width:none;height:auto;border-radius:0;box-shadow:none}.lcochat-head{padding-top:calc(10px + env(safe-area-inset-top))}.lcochat-btn.open{display:none}}',
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
    '.lcocat-go{border:0;cursor:pointer;font:inherit;font-weight:600}.lcocat-acts{display:flex;flex-wrap:wrap;gap:10px;align-items:center}',
    '.lcocat-alt{display:inline-flex;align-items:center;min-height:48px;padding:0 18px;border:1px solid #b4862f;border-radius:8px;color:#0e2740;font-weight:600;text-decoration:none}.lcocat-alt:hover{background:#f6f1e7}',
    '.lcocat-bar .lcocat-alt{display:none}',
    // the top announcement bar on every page (T-261024-23): one line, our own link, closable for good (ANN_KEY)
    '.lcoann{position:relative;z-index:2147483000;display:flex;align-items:center;justify-content:center;gap:12px;padding:8px 48px 8px 16px;background:#0e2740;color:#fff;font:14px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center}',
    '.lcoann a{color:#e9c983;font-weight:600;text-decoration:underline;text-underline-offset:3px}',
    '.lcoann-x{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:36px;height:36px;border:0;border-radius:50%;background:none;color:#fff;font-size:22px;line-height:1;cursor:pointer}.lcoann-x:hover{background:rgba(255,255,255,.12)}',
    '.lcoann[hidden]{display:none}',
    '@media (max-width:620px){.lcoann{flex-wrap:wrap;gap:2px 10px;padding:8px 40px 8px 12px}}',
    '.lcoann-sale{background:#b3261e}.lcoann-sale a{color:#fff;text-decoration-color:rgba(255,255,255,.7)}.lcoann-sale b{font-weight:700;letter-spacing:.02em}',
    '.lcocat-x{position:absolute;top:6px;right:6px;width:44px;height:44px;border:0;border-radius:50%;background:rgba(255,255,255,.9);color:#0e2740;font-size:26px;line-height:1;cursor:pointer}',
    '.lcocat-go:focus-visible,.lcocat-x:focus-visible{outline:3px solid #0e2740;outline-offset:2px}',
    '@media (max-width:620px){.lcocat-card{flex-direction:column}.lcocat-img{flex:0 0 150px}.lcocat-tx{padding:22px 20px 24px}.lcocat-tx h2{font-size:22px}}',
    // Phones: a small banner above the chat button, no dimmed overlay; the whole cover shows (contain) and the x has its own corner.
    '.lcocat.lcocat-bar{top:auto;padding:0 8px calc(76px + env(safe-area-inset-bottom));background:none;pointer-events:none}',
    '.lcocat-bar .lcocat-card{pointer-events:auto;flex-direction:row;align-items:center;gap:12px;width:100%;max-height:none;overflow:visible;padding:10px 46px 10px 10px;border-radius:12px;box-shadow:0 6px 24px rgba(8,20,34,.3)}',
    '.lcocat-bar .lcocat-img{flex:0 0 60px;height:78px;background:none}',
    '.lcocat-bar .lcocat-img img{object-fit:contain}',
    '.lcocat-bar .lcocat-tx{padding:0}',
    '.lcocat-bar .lcocat-tx h2{margin:0 0 6px;font-size:17px}',
    '.lcocat-bar .lcocat-tx p{display:none}',
    '.lcocat-bar .lcocat-go{min-height:40px;padding:0 14px;font-size:14px}',
    '.lcocat-bar .lcocat-x{top:0;right:0;background:none}',
    '@media print{.lcocat{display:none}.lcochat-btn,.lcochat-panel{display:none}}'
  ].join('')

  var modeLine
  function applyMode(m) {
    if (m) state.mode = m
    var h = humanMode()
    if (modeLine) { modeLine.textContent = h ? 'You are talking with a person' : 'AI-powered design'; modeLine.classList.toggle('ai', !h); modeLine.hidden = !state.id && !state.route; modeLine.style.display = modeLine.hidden ? 'none' : '' }   // .lcochat-st is display:flex, which beats [hidden]
    paintRoute()
  }
  var gate, gateIn, gateGo, gateMsg
  // Before the first message: the email step (mode 'first', no stored email, no conversation yet). Returning visitors skip it.
  function applyGate(message) {
    if (!panel) return
    var need = state.emailMode === 'first' && !state.email && !state.id && !picking()
    panel.classList.toggle('gating', need); gate.hidden = !need
    btn.setAttribute('data-track', need ? 'chat-open-gate' : 'chat-open')
    if (need && message) gateMsg.textContent = message
    if (state.open) setTimeout(function () { (need ? gateIn : ta).focus() }, 0)
  }
  var dot, stText, checked = 0, btn, panel, log, err, ta, sendB, photoIn, photoB, chips, headAv, routeBox, downB

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

  function avatar(sm) { var i = el('img', 'lcochat-av' + (sm ? ' sm' : '')); i.src = MARK; i.alt = ''; i.width = i.height = sm ? 32 : 40; i.decoding = 'async'; i.setAttribute('aria-hidden', 'true'); return i }
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
  function row(from, textNode, time, photos, human, name) {
    var r = el('div', 'lcochat-r ' + from)
    if (from === 'us') r.appendChild(avatar(true, !human))
    var c = el('div', 'lcochat-c')
    if (from === 'us' && human && name) c.appendChild(el('span', 'lcochat-nm', String(name).split(/\s+/)[0].slice(0, 24)))
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
    state.typing = null; state.still = null; state.humanTyping = false
  }
  // Honest typing (owner 2026-10-21): the dots show ONLY while the server says a reply is really being written (typing: true on
  // GET visit/messages), and go when it says typing: false or the reply lands. No timer ever starts or keeps them.
  function showTyping(caption) {
    hideTyping(); state.humanTyping = true
    var r = el('div', 'lcochat-r us lcochat-typing'); r.setAttribute('aria-label', caption || T.typingUs)
    r.appendChild(avatar(true, true))
    var c = el('div', 'lcochat-c')
    var b = el('div', 'lcochat-m'); b.appendChild(el('i')); b.appendChild(el('i')); b.appendChild(el('i'))
    c.appendChild(b); c.appendChild(el('div', 'lcochat-still lcochat-tcap', caption || T.typingUs)); r.appendChild(c); log.appendChild(r); state.typing = r; scrollDown()
  }
  function setTypingCaption(caption) {
    if (!state.typing) return
    var c = state.typing.querySelector('.lcochat-tcap')
    if (c && c.textContent !== caption) { c.textContent = caption; state.typing.setAttribute('aria-label', caption) }
  }
  // Our own local greeting, never sent to the server and never stored: the AI says so in its first words.
  function greet() {
    if (humanMode()) return   // the person path shows only the server's one ack line (owner 2026-10-20: no local line repeating it)
    log.appendChild(row('us', "Hi, I'm Muse, the AI assistant for The Local Cabinetry, here with Hannah's team to help with layouts and pricing.", ''))
    var q = row('us', 'What are you planning: kitchen, vanity or closet?', '')
    log.appendChild(q)
    // The server never sends the first set: the widget offers the rooms itself, but only for a NEW conversation (a returning visitor sees the thread instead).
    if (!state.id) renderChips(q, [{ label: 'Kitchen', value: 'room:kitchen' }, { label: 'Vanity', value: 'room:vanity' }, { label: 'Closet', value: 'room:closet' }, { label: 'Not sure', value: 'room:unsure' }])
  }
  function resetLog() { state.seenRow = null; state.seenLabel = null; setTimeout(applyGate, 0); hideTyping(); state.maxUs = 0; state.seenSent = 0; state.needEmail = false; state.emailCard = null; clearChips(); hotUpload(false); state.owedSince = 0; state.ackSeen = false; clearTimeout(state.emailTimer); state.emailAsked = false; state.sentOnce = false; log.textContent = ''; state.day = ''; greet(); if (photoB) setPhoto() }
  function setPhoto() { photoB.setAttribute('aria-disabled', state.id ? 'false' : 'true'); photoB.title = state.id ? 'Add a photo' : 'Send a message first, then add photos' }
  // Quick replies: optional `chips: [{label, value, swatch?}]` on OUR lines. Shown only under the LAST 'us' line; any newer line or a tap removes them.
  function clearChips() { if (state.chipsEl && state.chipsEl.parentNode) state.chipsEl.parentNode.removeChild(state.chipsEl); state.chipsEl = null }
  function setChipsDisabled(on) { if (state.chipsEl) Array.prototype.forEach.call(state.chipsEl.querySelectorAll('button'), function (b) { b.disabled = !!on }) }
  function hotUpload(on) { if (!photoB) return; photoB.classList.toggle('hot', !!on); if (on) photoB.title = 'Add a photo or sketch' }
  // The how-to-measure guide under our measure question (server field link: { label, url }; owner 2026-10-24, T-261024-13): a link button that stays, our own site only
  function renderGuide(r, link) {
    var url = String(link && link.url || ''), lbl = String(link && link.label || '').slice(0, 60)
    if (!/^https:\/\/thelocalcabinetry\.com\//.test(url) || !lbl) return
    var c = r.querySelector('.lcochat-c') || r
    var a = el('a', 'lcochat-guide', lbl); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.setAttribute('data-track', 'chat-measure-guide')
    c.appendChild(a)
  }
  function renderChips(r, chips) {
    var c = r.querySelector('.lcochat-c'); if (!c) return
    var box = el('div', 'lcochat-chips'); box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Quick replies')
    chips.slice(0, 8).forEach(function (ch) {
      if (!ch || typeof ch.label !== 'string' || typeof ch.value !== 'string' || !ch.label || !ch.value) return
      var b = el('button', 'lcochat-chip'); b.type = 'button'
      if (typeof ch.swatch === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(ch.swatch)) { var sw = el('i', 'lcochat-sw'); sw.style.background = ch.swatch; b.appendChild(sw) }
      b.appendChild(document.createTextNode(ch.label.slice(0, 40)))
      if (state.needEmail) b.disabled = true   // chips that arrive while the mandatory email card is open wait for it too
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
    // Canned server lines are never drawn, flagged ack:true or not (stopgap by text until the server stops sending them).
    var CANNED = /^\s*(Hi, thanks for writing\.|Got it, one moment|Thanks, one moment|On it, one moment|Still on it:)/i
    var isAck = from === 'us' && (m.ack === true || CANNED.test(String(m.text || '')))
    if (isAck) {   // owner: no canned 'got it / one moment' bubble. The line counts as received but is never drawn; the typing dots carry the wait.
      state.last = Math.max(state.last, m.seq); state.maxUs = Math.max(state.maxUs || 0, m.seq)
      return
    }
    var at = m.at || m.ts || m.time || m.created_at || m.created
    state.last = Math.max(state.last, m.seq)
    if (from === 'us') state.maxUs = Math.max(state.maxUs || 0, m.seq)
    // A scripted reply (the guided start's next question, with chips) that the server wrote the same second as the tap: the typing line shows for a moment first, so it reads like a
    // person answering, not a form (owner 2026-10-24, T-261024-10). Only for a fresh one (under 15 s old); history draws at once. Lines behind it wait their turn (order kept).
    var scripted = from === 'us' && m.holding !== true && Array.isArray(m.chips) && m.chips.length > 0 && Date.now() - toDate(at).getTime() < 15000
    if (scripted || state.drawQ) {
      var wait = scripted ? Math.min(1600, 700 + String(m.text || '').length * 12) : 0
      if (scripted && !state.typing) showTyping(T.typingUs)
      state.drawQ = (state.drawQ || Promise.resolve()).then(function () { return new Promise(function (ok) { setTimeout(ok, wait) }) }).then(function () { drawMsg(m, from, at) })
      var mine = state.drawQ; mine.then(function () { if (state.drawQ === mine) state.drawQ = null })
      return
    }
    drawMsg(m, from, at)
  }
  function drawMsg(m, from, at) {
    clearChips(); hotUpload(false)
    if (from === 'us' && m.holding !== true) { hideTyping(); state.owedSince = 0 }
    daySep(toDate(at))
    var r = row(from, String(m.text || ''), stamp(at), m.photos, m.human === true || m.by === 'human' || m.team === true, m.name)   // team: the server's human-mode line, the team's avatar (never the AI's)
    if (from === 'you') r.setAttribute('data-seq', String(m.seq))
    if (state.typing) log.insertBefore(r, state.typing); else log.appendChild(r)
    state.lastFrom = from
    if (from === 'us') { if (Array.isArray(m.chips) && m.chips.length) renderChips(r, m.chips); if (m.upload === true) hotUpload(true); if (m.link) renderGuide(r, m.link) }
    if (log.scrollHeight - log.scrollTop - log.clientHeight < 160) scrollDown()
  }
  // GET visit/messages carries read_seq = the highest VISITOR seq our side has read (the system picked it up, or a person did). Under that line a small 'Seen'.
  function applyRead(n) {
    n = Number(n) || 0
    if (!n) return
    var best = null
    Array.prototype.forEach.call(log.querySelectorAll('.lcochat-r.you[data-seq]'), function (r) { if (Number(r.getAttribute('data-seq')) <= n) best = r })
    if (!best || state.seenRow === best) return
    if (state.seenLabel && state.seenLabel.parentNode) state.seenLabel.parentNode.removeChild(state.seenLabel)
    var c = best.querySelector('.lcochat-c'); if (!c) return
    state.seenLabel = el('span', 'lcochat-seenl', T.seen); state.seenRow = best; c.appendChild(state.seenLabel)
  }
  // A reply that arrived while the panel was closed: a gold dot on the button, and the label says so (screen readers)
  function setUnread(on) {
    if (!btn) return
    var d = btn.querySelector('.lcochat-unread')
    if (on && !d) { d = el('i', 'lcochat-unread'); d.setAttribute('aria-hidden', 'true'); btn.appendChild(d) }
    if (!on && d) d.parentNode.removeChild(d)
    btn.setAttribute('aria-label', on ? label + ', ' + T.unread : label)
    if (on) showBtn()
  }
  function scrollDown() { log.scrollTop = log.scrollHeight; setDown(false) }
  function setDown(on) { if (!downB) return; downB.hidden = !on; log.classList.toggle('has-down', !!on) }
  function grow() { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px' }

  // 'after_chip' mode only (switch in the server config): after the first chip step a mandatory email card sits in the thread; chips and the box wait for it.
  function emailCard(force) {
    if (!state.id || state.emailCard || (state.email && !force)) return
    var r = el('div', 'lcochat-r us'); r.appendChild(avatar(true, true))
    var c = el('div', 'lcochat-c'); var b = el('div', 'lcochat-m lcochat-ask lcochat-ask-need')
    b.appendChild(el('span', '', ASK_EMAIL))
    var f = el('form', 'lcochat-ask-f'); f.noValidate = true
    var inp = el('input'); inp.type = 'email'; inp.placeholder = 'you@example.com'; inp.autocomplete = 'email'; inp.setAttribute('aria-label', 'Your email'); if (state.email) inp.value = state.email
    var go = el('button'); go.type = 'submit'; go.setAttribute('aria-label', 'Save email'); go.appendChild(svg('M5 12h14M13 6l6 6-6 6'))
    var msg = el('div', 'lcochat-ask-msg'); msg.setAttribute('role', 'status')
    f.appendChild(inp); f.appendChild(go); b.appendChild(f); b.appendChild(el('div', 'lcochat-gate-note', EMAIL_NOTE)); b.appendChild(msg)
    c.appendChild(b); r.appendChild(c)
    state.needEmail = true; state.emailCard = r; setChipsDisabled(true)
    f.addEventListener('submit', function (e) {
      e.preventDefault()
      var v = inp.value.trim().toLowerCase()
      if (!validEmail(v)) { msg.textContent = 'Please enter a valid email address.'; return }
      go.disabled = true; msg.textContent = ''
      fetch(API + 'email', { method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify({ email: v }), cache: 'no-store' })
        .then(function (res) {
          if (res.ok) { state.email = v; storeEmail(v); state.needEmail = false; b.textContent = "Thanks, we'll write to " + v; b.classList.remove('lcochat-ask'); b.classList.remove('lcochat-ask-need'); setChipsDisabled(false); poll(); return }
          go.disabled = false
          if (res.status === 429) { msg.textContent = 'Please try again in a minute.'; return }
          return res.json().catch(function () { return {} }).then(function (jj) { msg.textContent = (jj && jj.message) || 'That did not save. Please try again.' })
        }).catch(function () { go.disabled = false; msg.textContent = 'That did not save. Please try again.' })
    })
    if (state.typing) log.insertBefore(r, state.typing); else log.appendChild(r)
    scrollDown()
  }

  // Tell the server which of our lines the visitor has actually had in front of them: panel open AND tab visible, highest seq rendered.
  function maybeSeen() {
    if (!state.id || !state.open || document.hidden || state.maxUs <= state.seenSent) return
    var q = state.maxUs; state.seenSent = q
    fetch(API + 'seen', { method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify({ seq: q }), cache: 'no-store' }).catch(function () { /* the reminder just stays possible */ })
  }
  // While a reply is owed: every 2 s for 30 s after the visitor's line, then 4 s (to 2 min), then 10 s. Otherwise the calm idle schedule.
  function nextDelay() {
    if (state.longPoll) return 250   // the server holds the request until something changes (wait=25): ask again right away
    if (!state.open) return document.hidden ? 15000 : 5000   // panel closed: only while a reply is owed (see poll)
    if (humanMode()) return 2000   // a person may answer at any moment: look every 2 s while the panel is open
    if (state.owedSince) { var age = Date.now() - state.owedSince; return age < 30000 ? 2000 : age < 120000 ? 4000 : 10000 }
    var idle = Date.now() - state.idleSince
    return idle < 120000 ? 4000 : idle < 600000 ? 8000 : 15000
  }
  function poll() {
    clearTimeout(state.timer)
    if (!state.id) return
    // panel open: always; panel closed or tab hidden: only while a reply is owed, slower, so the answer still arrives (and shows a dot)
    if ((!state.open || document.hidden) && !state.owedSince) return
    fetch(API + 'messages?after=' + state.last + (state.longPoll ? '&wait=25' : ''), { headers: headers(), cache: 'no-store' }).then(function (r) {
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
      if (j.mode === 'human' || j.mode === 'ai') applyMode(j.mode)
      var fresh = (j.messages || []).length
      var usBefore = state.maxUs || 0
      ;(j.messages || []).forEach(addMsg)
      if (!state.open && (state.maxUs || 0) > usBefore) setUnread(true)
      if (j.need_email === true && state.emailMode !== 'off') emailCard(true)   // this conversation has no email yet (begun before the step): ask in the thread, under its lines
      applyRead(j.read_seq)
      // the real step while a reply is owed (server `working`: reading, checking your sizes, drawing, rendering the 3D view …; owner 2026-10-24, T-261024-11) is the typing line's words
      var step = j.working && typeof j.working.text === 'string' ? j.working.text.slice(0, 80) : ''
      var cap = j.typing_name ? String(j.typing_name).slice(0, 30) + ' ' + T.typing : (step || T.typingUs)
      if ((j.typing === true || step) && !state.humanTyping) showTyping(cap)
      else if ((j.typing === true || step) && state.typing && !state.drawQ) setTypingCaption(cap)
      else if (j.typing !== true && !step && state.humanTyping && !state.drawQ) hideTyping()   // a scripted reply still pausing keeps its typing line
      maybeSeen()
      if (fresh) { state.idleSince = Date.now(); scrollDown() }
      if (!state.open && !state.owedSince) return   // the answer is in (dot shown): stop until the panel opens
      state.timer = setTimeout(poll, nextDelay())
    }).catch(function () { state.timer = setTimeout(poll, 15000) })
  }

  function send() {
    if (state.busy) return
    if (state.needEmail) { showErr('Please add your email above first, so we can send you our reply.'); return }
    var text = ta.value.trim()
    if (!text && !state.files.length) return
    if (text.length > MAX_TEXT) { showErr('That is a bit long. Please keep it under ' + MAX_TEXT + ' characters.'); return }
    post({ text: text, files: state.files.map(function (f) { return f.id }) })
  }
  function rid() { var a = new Uint8Array(8); try { crypto.getRandomValues(a) } catch (e) { for (var i = 0; i < 8; i++) a[i] = Math.floor(Math.random() * 256) } return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2) }).join('') }
  // o = { text, files? } for typed lines; { text: <chip label>, chip: <chip value> } for a tap on a quick reply
  function post(o) {
    if (state.busy) return
    if (state.needEmail) { showErr('Please add your email above first, so we can send you our reply.'); return }
    state.busy = true; sendB.disabled = true; showErr('')
    var body = { text: o.text }
    var firstOfConversation = !state.id
    if (firstOfConversation && state.email) body.email = state.email
    if (firstOfConversation) { var tz = visitorTz(); if (tz) body.tz = tz }   // sets the quiet hours of the reminder
    if (o.files && o.files.length) body.file_ids = o.files
    if (o.chip) { body.chip = o.chip; body.client_id = 'chip-' + rid() }
    if (firstOfConversation && state.route) body.route = state.route
    if (firstOfConversation) { try { var sv = window.__tlcSrc && window.__tlcSrc(); if (sv) body.src = sv } catch (e) {} }
    fetch(API + 'message', { method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify(body), cache: 'no-store' }).then(function (r) {
      return r.json().catch(function () { return {} }).then(function (j) { return { s: r.status, j: j } })
    }).then(function (x) {
      state.busy = false; sendB.disabled = false
      if (!(x.s === 200 && x.j && x.j.ok)) setChipsDisabled(false)
      if (x.s === 200 && x.j && x.j.ok) {
        if (x.j.conversation) { state.id = x.j.conversation; remember(); setPhoto() }
        if (!o.chip) { ta.value = ''; grow(); state.files = []; paintChips() }
        clearChips(); hotUpload(false); state.idleSince = Date.now()
        if (x.j.mode === 'human' || x.j.mode === 'ai') applyMode(x.j.mode)
        state.owedSince = Date.now()   // no dots here: they come only when the server says a reply is being written
        state.sentOnce = true
        if (firstOfConversation && state.emailMode === 'after_chip' && !state.email) emailCard()
        else if (x.j.need_email === true && state.emailMode !== 'off') emailCard(true)
        poll()
        return
      }
      if (x.s === 404 && state.id) { state.id = null; state.last = 0; state.seen = {}; state.lastFrom = ''; remember(); resetLog(); showErr('That chat had ended. Please send your message again.'); return }
      if (x.s === 429) return showErr('Please slow down a little and try again in a minute.')
      if (x.s === 413) return showErr('That message is too long.')
      if (x.s === 400 && x.j && (x.j.error === 'email_required' || /email/i.test(String(x.j.message || '')))) { state.email = ''; storeEmail(''); applyGate(String(x.j.message)); return }
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
      if (j) {   // the email step is switched from the server: email_gate 'first' | 'after_chip' | 'off', or the older email_required true | false
        var g = j.email_gate
        state.longPoll = j.long_poll === true   // the server holds GET visit/messages?wait=25 until a new line or state change
        if (g === 'first' || g === 'after_chip' || g === 'off') state.emailMode = g
        else if (j.email_required === false) state.emailMode = 'off'
        else if (j.email_required === true) state.emailMode = 'first'
        applyGate()
      }
      if (!j || typeof j.enabled !== 'boolean') return
      dot.className = 'lcochat-dot' + (j.enabled ? '' : ' off'); stText.textContent = j.enabled ? 'Online' : 'Away: leave a message in the design tool'
    }).catch(function () { /* keep the header as it is */ })
  }
  // Catalog popup: once per browser, about 15 s after the page loads, never while the chat panel is open. No email, no request:
  // it is a link to a file on this site. Closes with the x, Escape or a click outside; the 'seen' flag is set when it is shown.
  // Phones (620 px and under): never over the page on load; a small banner (no overlay, no focus move) after the visitor scrolls.
  var cat, catFrom, catBar = false
  function catArm() {
    try { catBar = window.matchMedia('(max-width:620px)').matches } catch (e) { catBar = false }
    if (!catBar) { setTimeout(catShow, 5000); return }   // a welcome, so early (was 15 s for the catalog-only popup)
    setTimeout(function () {
      function onScroll() { if (window.scrollY < window.innerHeight / 2) return; window.removeEventListener('scroll', onScroll); catShow() }
      window.addEventListener('scroll', onScroll, { passive: true })
    }, 15000)
  }
  // The top announcement bar (owner 2026-10-24, T-261024-23: "both a welcome banner on first visit and a top announcement bar"): on every page until closed (then never again in
  // this browser). Our own words and link only; the recent-sales strip (T-261024-22) joins it only with real orders, after the owner's yes.
  var ANN = { text: 'See your kitchen, closet or vanity in 3D before you buy.', link: 'Start a design' }
  // The red sale bar above it (owner 2026-10-24: "a red banner like sale or stuff, like free 1 month membership"): the offer is the owner's wording, our own link only. Change the offer
  // and SALE_KEY together; no offer text = no bar.
  var SALE = { text: 'Join The Local Cabinetry Membership today: your first month is free.', link: 'See membership', href: '/member' }
  function barShow(key, cls, msg, onGo, hrefTo, track) {
    try { if (localStorage.getItem(key)) return } catch (e) { return }
    if (document.querySelector('.' + cls)) return
    var bar = el('div', 'lcoann ' + cls); bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Announcement')
    var sp = el('span', ''); sp.textContent = msg.text; bar.appendChild(sp)
    var a = el('a', '', msg.link); a.href = hrefTo; a.setAttribute('data-track', track)
    if (onGo) a.addEventListener('click', function (e) { e.preventDefault(); onGo() })
    bar.appendChild(a)
    var x = el('button', 'lcoann-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close the announcement')
    x.addEventListener('click', function () { bar.hidden = true; try { localStorage.setItem(key, '1') } catch (e) { /* ignore */ } })
    bar.appendChild(x)
    return bar
  }
  function annShow() {
    // the design bar first, then the sale bar goes in above it: red on top, navy below
    var bar = barShow(ANN_KEY, 'lcoann-design', ANN, open, '#chat', 'announce-design')
    if (bar) document.body.insertBefore(bar, document.body.firstChild)
    var sale = SALE.text ? barShow(SALE_KEY, 'lcoann-sale', SALE, null, SALE.href, 'announce-sale') : null
    if (sale) document.body.insertBefore(sale, document.body.firstChild)
  }
  function catClose() { if (!cat || cat.hidden) return; cat.hidden = true; if (!catBar && catFrom && catFrom.focus) { try { catFrom.focus() } catch (e) { /* ignore */ } } }
  function catShow() {
    try { if (localStorage.getItem(CAT_KEY)) return } catch (e) { return }   // storage blocked: never nag
    if (state.open || cat) return
    try { localStorage.setItem(CAT_KEY, '1') } catch (e) { return }
    catFrom = document.activeElement
    cat = el('div', 'lcocat' + (catBar ? ' lcocat-bar' : '')); cat.setAttribute('role', 'dialog'); if (!catBar) cat.setAttribute('aria-modal', 'true'); cat.setAttribute('aria-label', 'Welcome to The Local Cabinetry')
    var card = el('div', 'lcocat-card'), im = el('div', 'lcocat-img'), pic = el('img'); pic.src = '/catalog/cover.jpg'; pic.alt = 'The Local Cabinetry catalog cover'; im.appendChild(pic)
    var tx = el('div', 'lcocat-tx')
    // the welcome card on a first visit (owner 2026-10-24, T-261024-23: "I don't see the first open up banner ever"): say hello, offer the design and the catalog
    tx.appendChild(el('h2', '', 'Welcome to The Local Cabinetry'))
    tx.appendChild(el('p', '', 'Cabinets made for your room. Tell us your room and see it in 3D, or start with our catalog: six door collections and seventeen finishes.'))
    var acts = el('div', 'lcocat-acts')
    var dz = el('button', 'lcocat-go', 'Design my room'); dz.type = 'button'; dz.setAttribute('data-track', 'welcome-design')
    var go = el('a', 'lcocat-alt', 'Download the catalog'); go.href = CATALOG; go.setAttribute('download', ''); go.setAttribute('data-track', 'catalog-popup')
    acts.appendChild(dz); acts.appendChild(go); tx.appendChild(acts)
    dz.addEventListener('click', function () { catClose(); open() })
    var x = el('button', 'lcocat-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close')
    card.appendChild(im); card.appendChild(tx); card.appendChild(x); cat.appendChild(card); document.body.appendChild(cat)
    x.addEventListener('click', catClose); go.addEventListener('click', function () { setTimeout(catClose, 0) })
    cat.addEventListener('click', function (e) { if (e.target === cat) catClose() })
    cat.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); catClose() } else if (e.key === 'Tab' && !catBar) { e.preventDefault(); var f = [dz, go, x], i = f.indexOf(document.activeElement); f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus() } })
    if (!catBar) dz.focus()
  }
  // ---- The choice, at the top of the panel before a chat starts: the AI assistant or a person. Afterwards a small link switches it.
  function ico(d) { return svg(d) }
  function picking() { return !state.id && !state.route }
  function paintRoute() {
    if (!routeBox) return
    routeBox.textContent = ''; routeBox.hidden = false
    var p = picking()
    panel.classList.toggle('picking', p)
    routeBox.className = 'lcochat-route' + (p ? '' : ' bar')
    if (p && state.person) {   // "Talk to a person": three ways (owner 2026-10-21)
      routeBox.appendChild(el('h3', '', 'Talk to a person'))
      routeBox.appendChild(emailLink(ico('M4 4h16v16H4zM4 6l8 7 8-7')))
      if (WA_URL) routeBox.appendChild(optLink(WA_URL, 'whatsapp', ico(WA_PATH), 'WhatsApp', 'Message us on WhatsApp', true))
      routeBox.appendChild(callOpt(ico('M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z'), 'Call ' + phoneShow(), 'Tap to call, or dial it from your desk phone'))
      var back = el('button', 'lcoroute-back', 'Back'); back.type = 'button'; back.setAttribute('data-track', 'route-person-back')
      back.addEventListener('click', function () { state.person = false; paintRoute(); var f = routeBox.querySelector('.lcoroute-b'); if (f && lastPtr !== 'touch') f.focus() })
      routeBox.appendChild(back)
      return
    }
    if (p) {
      routeBox.appendChild(el('h3', '', 'How would you like to chat?'))
      routeBox.appendChild(opt('ai', ico('M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1'), 'AI assistant', 'Design and quotation, 5% off your order'))
      var pb = el('button', 'lcoroute-b human'); pb.type = 'button'; pb.setAttribute('data-track', 'route-person')
      pb.appendChild(icoBox(ico('M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'))); var pt = el('span', 'lcoroute-t'); pt.appendChild(el('b', '', 'Talk to a person')); pt.appendChild(el('small', '', 'Email, WhatsApp or a call')); pb.appendChild(pt)
      pb.addEventListener('click', function () { state.person = true; paintRoute(); var f = routeBox.querySelector('.lcoroute-b'); if (f && lastPtr !== 'touch') f.focus() })
      routeBox.appendChild(pb)
      return
    }
    // AI chat: no in-chat "Talk to a person" (owner 2026-10-21: the choice is on the first screen; the header says AI-powered design).
    // A conversation already in human mode keeps its line and the way back to the AI assistant.
    if (!humanMode()) { routeBox.hidden = true; return }
    routeBox.appendChild(el('span', '', 'A teammate replies here'))
    var sw = el('button', 'lcochat-switch', 'Back to AI assistant'); sw.type = 'button'; sw.setAttribute('data-track', 'route-switch-ai')
    sw.addEventListener('click', function () { switchRoute('ai', sw) })
    routeBox.appendChild(sw)
  }
  function opt(val, icon, title, sub) {
    var b = el('button', 'lcoroute-b ' + val); b.type = 'button'; b.setAttribute('data-track', 'route-' + val)
    b.appendChild(icoBox(icon)); var t = el('span', 'lcoroute-t'); t.appendChild(el('b', '', title)); t.appendChild(el('small', '', sub)); b.appendChild(t)
    b.addEventListener('click', function () { setRoute(val); state.mode = ''; resetLog(); applyMode(); applyGate() })
    return b
  }
  // WhatsApp and Call on the person path: plain links (a new tab / the phone app); nothing is sent from the chat
  function optLink(href, val, icon, title, sub, blank) {
    var a = el('a', 'lcoroute-b ' + val); a.href = href; a.setAttribute('data-track', 'route-' + val)
    if (blank) { a.target = '_blank'; a.rel = 'noopener' }
    a.appendChild(icoBox(icon)); var t = el('span', 'lcoroute-t'); t.appendChild(el('b', '', title)); t.appendChild(el('small', '', sub)); a.appendChild(t)
    return a
  }
  // The Call option: points at /contact until clicked; the tel: href is built in the click handler only.
  function callOpt(icon, title, sub) {
    var a = optLink('/contact', 'call', icon, title, sub, false)
    a.setAttribute('aria-label', 'Call us at ' + phoneNum().slice(1).split('').join(' '))
    a.addEventListener('click', function () { a.setAttribute('href', 'tel:+' + phoneNum()); setTimeout(function () { a.setAttribute('href', '/contact') }, 600) })
    return a
  }
  function icoBox(icon) { var b = el('span', 'lcoroute-ic'); b.appendChild(icon); return b }
  // Email on the person path (owner 2026-10-21): the /contact form, not a thread here. What the visitor already typed in the chat box goes along
  // in this tab's sessionStorage (never in the URL), and only when it holds no email address or phone number; the form page fills it in once.
  var EMAIL_RE = /[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}/i, PHONE_RE = /(?:\+?\d[\s().\-\/]*){7,}/
  function hasContact(t) { return EMAIL_RE.test(t) || PHONE_RE.test(t) }
  function emailLink(icon) {
    var a = optLink(CONTACT, 'email', icon, 'Email us', 'Send us a message, we reply by email')
    a.addEventListener('click', function () {
      var t = ta ? ta.value.trim().slice(0, MAX_TEXT) : ''
      try { sessionStorage.setItem(PREFILL_KEY, JSON.stringify({ text: t && !hasContact(t) ? t : '' })) } catch (e) { /* the form just opens empty */ }
    })
    return a
  }
  // On the page with the contact form: fill the message (only an empty box) once, choose "a person", and bring the form into view.
  function contactPrefill() {
    var raw = null; try { raw = sessionStorage.getItem(PREFILL_KEY) } catch (e) { return }
    if (raw == null) return
    var f = document.querySelector('form[data-lead]'); if (!f) return
    try { sessionStorage.removeItem(PREFILL_KEY) } catch (e) { /* ignore */ }
    var o = {}; try { o = JSON.parse(raw) || {} } catch (e) { /* ignore */ }
    var m = f.querySelector('textarea[name=message]'), t = typeof o.text === 'string' ? o.text.slice(0, MAX_TEXT) : ''
    if (m && t && !m.value && !hasContact(t)) m.value = t
    var hr = f.querySelector('input[name=reply_with][value=person]'); if (hr) hr.checked = true
    try { (f.closest('.enquire') || f).scrollIntoView({ block: 'start' }) } catch (e) { /* ignore */ }
  }
  // No conversation yet: only the local choice changes. A conversation: the server stores the mode on the thread and answers the mode now in force.
  function switchRoute(to, b) {
    if (!state.id) { setRoute(to); state.mode = ''; resetLog(); applyMode(); return }
    if (b) b.disabled = true
    fetch(API + 'mode', { method: 'POST', headers: headers({ 'content-type': 'application/json' }), body: JSON.stringify({ mode: to }), cache: 'no-store' })
      .then(function (r) { return r.json().catch(function () { return {} }).then(function (j) { return { s: r.status, j: j } }) })
      .then(function (x) {
        if (b) b.disabled = false
        if (x.s === 200 && x.j && (x.j.mode === 'ai' || x.j.mode === 'human')) { setRoute(x.j.mode); applyMode(x.j.mode); if (x.j.mode === 'human') hideTyping(); poll(); return }
        if (x.s === 429) return showErr('Please slow down a little and try again in a minute.')
        showErr('Sorry, that did not switch. Please try again.')
      }).catch(function () { if (b) b.disabled = false; showErr('Sorry, that did not switch. Please try again.') })
  }
  // The reminder mail links to /#chat=<token> (a FRAGMENT: it never reaches a server log or a Referer). On load: clear the hash first so no token stays in the
  // address bar or the history, then send the token ONCE to the redeem endpoint, store the conversation id it returns, and open the panel on that chat.
  function resumeFromLink() {
    var m = /^#chat=([0-9a-f]{32})$/.exec(location.hash || '')
    if (!m) return
    var hadChat = !!state.id   // this device already has a conversation: a used or expired link just reopens it
    try { history.replaceState(null, '', location.pathname + location.search) } catch (e) { /* the hash may stay; the token is still sent only once */ }
    fetch(API + 'redeem', { method: 'POST', headers: { 'content-type': 'application/json', 'x-lco-design': '1' }, body: JSON.stringify({ token: m[1] }), cache: 'no-store' })
      .then(function (r) { return r.json().catch(function () { return {} }).then(function (j) { return { s: r.status, j: j } }) })
      .then(function (x) {
        if (x.s === 200 && x.j && x.j.ok && /^[0-9a-f]{32}$/.test(String(x.j.conversation || ''))) {
          state.id = x.j.conversation; state.last = 0; state.seen = {}; state.lastFrom = ''; state.maxUs = 0; state.seenSent = 0; remember()
          clearChips(); setPhoto(); applyGate(); open(); return
        }
        if (x.s === 429) return   // slow down: leave everything as it is
        open()
        if (hadChat) return
        var msg = (x.j && typeof x.j.message === 'string' && x.j.message) || 'This link can no longer be used. Please ask us for a new one.'
        if (panel.classList.contains('gating')) gateMsg.textContent = msg; else showErr(msg)
      }).catch(function () { /* offline: the normal flow stays */ })
  }
  // Opened by a finger: no programmatic focus (on a phone it only scrolls or pops the keyboard before the visitor chose anything). Keyboard and mouse keep it.
  var lastPtr = ''
  document.addEventListener('pointerdown', function (e) { lastPtr = e.pointerType || '' }, true)
  document.addEventListener('keydown', function () { lastPtr = 'key' }, true)
  // Phones: the full-screen panel follows the visual viewport, so the composer sits right above the iOS keyboard instead of under it.
  var PHONE_MQ = '(max-width:520px)'
  function fitViewport() {
    var v = window.visualViewport, on = state.open && v && window.matchMedia && window.matchMedia(PHONE_MQ).matches
    if (!on) { panel.style.top = ''; panel.style.height = ''; panel.style.bottom = ''; return }
    var atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 80
    panel.style.top = Math.max(0, v.offsetTop) + 'px'; panel.style.height = v.height + 'px'; panel.style.bottom = 'auto'
    if (atEnd) scrollDown()
  }
  function open() {
    catClose()
    state.open = true; panel.hidden = false; showBtn(); setUnread(false); btn.setAttribute('aria-expanded', 'true'); btn.classList.add('open'); checkOnline(); fitViewport()
    if (state.id) poll()   // only re-reads a conversation this browser already has
    if (lastPtr !== 'touch') setTimeout(function () { var f = picking() && routeBox.querySelector('.lcoroute-b'); (f || (panel.classList.contains('gating') ? gateIn : ta)).focus() }, 0)
    maybeSeen()
  }
  function close() {
    state.open = false; panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.classList.remove('open'); clearTimeout(state.timer); if (state.owedSince) state.timer = setTimeout(poll, nextDelay()); fitViewport(); fitBtn()
    lastY = Math.max(0, window.scrollY || 0); closedAt = Date.now()   // the phone keyboard closing moves the page: not a scroll by the visitor
    if (lastPtr !== 'touch') btn.focus()
  }

  function mount() {
    var ph = document.querySelector('button[data-lco-chat]')   // the button the page already shows (so a very early tap is not lost); adopted, not duplicated
    if (!ph && document.querySelector('[data-lco-chat]')) return
    var css = el('style'); css.textContent = CSS; document.head.appendChild(css)

    btn = ph || el('button', 'lcochat-btn')
    if (ph) ph.textContent = ''
    btn.type = 'button'
    btn.setAttribute('data-lco-chat', '')
    btn.setAttribute('data-track', 'chat-open')
    btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', label)
    btn.appendChild(svg('M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'))
    btn.appendChild(el('span', '', label))

    panel = el('div', 'lcochat-panel'); panel.hidden = true
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Chat with The Local Cabinetry')
    var head = el('div', 'lcochat-head')
    headAv = avatar(false, true); head.appendChild(headAv)
    var who = el('div', 'lcochat-who')
    who.appendChild(el('h2', '', 'The Local Cabinetry'))
    var st = el('div', 'lcochat-st'); dot = el('span', 'lcochat-dot'); stText = el('span', '', 'Online'); st.appendChild(dot); st.appendChild(stText)
    modeLine = el('div', 'lcochat-st lcochat-mode'); modeLine.hidden = true
    who.appendChild(st); who.appendChild(modeLine); head.appendChild(who)
    var hb = el('div', 'lcochat-hb')   // no 'open bigger' link to /design here (owner 2026-10-21: the chat and the design page are different things)
    if (WA_URL) {
      var wh = el('a', 'lcochat-x'); wh.href = WA_URL; wh.target = '_blank'; wh.rel = 'noopener'; wh.title = 'Message us on WhatsApp'
      wh.setAttribute('aria-label', 'Message us on WhatsApp'); wh.setAttribute('data-track', 'chat-whatsapp')
      wh.appendChild(svg(WA_PATH)); hb.appendChild(wh)
    }
    var x = el('button', 'lcochat-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close chat'); x.setAttribute('data-track', 'chat-close')
    hb.appendChild(x); head.appendChild(hb)
    log = el('div', 'lcochat-log'); log.setAttribute('role', 'log'); log.setAttribute('aria-live', 'polite'); log.setAttribute('aria-label', 'Conversation')
    var logw = el('div', 'lcochat-logw'); logw.appendChild(log)
    downB = el('button', 'lcochat-down'); downB.type = 'button'; downB.hidden = true; downB.setAttribute('aria-label', 'Jump to the latest message'); downB.appendChild(svg('M12 5v14M6 13l6 6 6-6')); logw.appendChild(downB)
    downB.addEventListener('click', scrollDown)
    log.addEventListener('scroll', function () { setDown(log.scrollHeight - log.scrollTop - log.clientHeight >= 80) }, { passive: true })
    err = el('div', 'lcochat-err'); err.hidden = true; err.setAttribute('role', 'alert')

    var box = el('div', 'lcochat-box'), pi = el('div', 'lcochat-pi')
    chips = el('div', 'lcochat-tools')
    var rw = el('div', 'lcochat-row')
    photoIn = el('input'); photoIn.type = 'file'; photoIn.accept = 'image/jpeg,image/png,image/webp,image/heic'; photoIn.hidden = true
    photoB = el('button', 'lcochat-ic'); photoB.type = 'button'; photoB.setAttribute('aria-label', 'Add a photo'); setPhoto()
    photoB.appendChild(svg('M21 19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3l2-2h4l2 2h3a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'))
    photoB.addEventListener('click', function () { if (state.id) photoIn.click() })
    ta = el('textarea'); ta.rows = 1; ta.maxLength = MAX_TEXT; ta.placeholder = 'Type your message'; ta.setAttribute('aria-label', 'Your message')
    sendB = el('button', 'lcochat-send'); sendB.type = 'button'; sendB.setAttribute('aria-label', 'Send'); sendB.setAttribute('data-track', 'chat-send')
    sendB.appendChild(svg('M22 2L11 13M22 2l-7 20-4-9-9-4z'))
    rw.appendChild(photoB); rw.appendChild(sendB); rw.appendChild(photoIn)
    pi.appendChild(chips); pi.appendChild(ta); pi.appendChild(rw); box.appendChild(pi)

    gate = el('div', 'lcochat-gate'); gate.hidden = true
    gate.appendChild(el('h3', '', ASK_EMAIL))
    var gf = el('form', 'lcochat-gate-f'); gf.noValidate = true
    gateIn = el('input'); gateIn.type = 'email'; gateIn.placeholder = 'you@example.com'; gateIn.autocomplete = 'email'; gateIn.setAttribute('aria-label', 'Your email'); gateIn.maxLength = 254
    gateGo = el('button', 'lcochat-gate-go', 'Start chat'); gateGo.type = 'submit'
    gateMsg = el('div', 'lcochat-gate-msg'); gateMsg.setAttribute('role', 'status')
    var gn = el('p', 'lcochat-gate-note', EMAIL_NOTE)
    gf.appendChild(gateIn); gf.appendChild(gn); gf.appendChild(gateGo); gf.appendChild(gateMsg); gate.appendChild(gf)
    gateIn.addEventListener('input', function () { if (validEmail(gateIn.value.trim())) gateGo.setAttribute('data-track', 'gate-start'); else gateGo.removeAttribute('data-track') })
    gf.addEventListener('submit', function (e) {
      e.preventDefault()
      var v = gateIn.value.trim().toLowerCase()
      if (!validEmail(v)) { gateMsg.textContent = 'Please enter a valid email address.'; return }
      state.email = v; storeEmail(v); gateMsg.textContent = ''; applyGate()
    })
    routeBox = el('div', 'lcochat-route')
    panel.appendChild(head); panel.appendChild(routeBox); panel.appendChild(gate); panel.appendChild(logw); panel.appendChild(err); panel.appendChild(box)
    document.body.appendChild(btn); document.body.appendChild(panel)
    applyGate()
    resumeFromLink()
    window.addEventListener('hashchange', resumeFromLink)   // the link pasted into a tab that is already on the site
    greet(); applyMode()
    annShow(); catArm()

    btn.addEventListener('click', function () { if (state.open) close(); else open() })
    if (window.__lcoQ) { window.__lcoQ = 0; open() }   // a tap that came before this file was ready
    document.addEventListener('click', function (e) {   // a link marked data-open-chat opens the panel (the choice is at its top)
      var a = e.target && e.target.closest ? e.target.closest('a[data-open-chat]') : null
      if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey) return
      e.preventDefault(); if (!state.open) open()
    }, true)
    syncRouteFields()
    contactPrefill()
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
    document.addEventListener('visibilitychange', function () { if (!document.hidden && state.id && (state.open || state.owedSince)) { poll(); maybeSeen() } })
    if (window.visualViewport) { window.visualViewport.addEventListener('resize', fitViewport); window.visualViewport.addEventListener('scroll', fitViewport) }
    var fitQ = 0
    function fitQueue() { if (!fitQ) fitQ = requestAnimationFrame(function () { fitQ = 0; fitBtn() }) }
    // the pill/round choice is made when scrolling settles (150 ms), not on every frame, so the button never flickers mid-scroll
    var fitT = 0
    window.addEventListener('scroll', function () { clearTimeout(fitT); fitT = setTimeout(fitQueue, 150); hideOnScroll() }, { passive: true }); window.addEventListener('resize', fitQueue)
    window.addEventListener('load', function () { fitQueue(); setTimeout(fitQueue, 1200) }); fitBtn(); setTimeout(fitQueue, 1200)   // again after the page's 0.7 s rise-in
  }

  // Hide while scrolling down; back on scroll up, after ~600 ms of no scrolling, and at the page end. Never while the chat is open.
  var lastY = window.scrollY || 0, idleT = 0, closedAt = 0
  function atEnd() { var d = document.documentElement; return window.innerHeight + window.scrollY >= d.scrollHeight - 4 }
  function showBtn() { clearTimeout(idleT); if (btn && btn.classList.contains('lcochat-hide')) { btn.classList.remove('lcochat-hide'); fitBtn() } }
  function hideOnScroll() {
    if (!btn) return
    var y = Math.max(0, window.scrollY || 0), dy = y - lastY
    if (Math.abs(dy) < 8 && !atEnd()) return   // iOS bounce and toolbar collapse: ignore small moves
    lastY = y
    if (Date.now() - closedAt < 400) return
    clearTimeout(idleT)
    // a keyboard user who is on the button keeps it; after a mouse close the button has focus too, but that must not pin it
    var keyFocus = document.activeElement === btn && (function () { try { return btn.matches(':focus-visible') } catch (e) { return false } })()
    if (state.open || dy < 0 || atEnd() || keyFocus) { showBtn(); return }
    btn.classList.add('lcochat-hide')
    idleT = setTimeout(showBtn, 600)
  }

  // Round icon button while any text or link sits under the full pill; the full "Chat with us" pill where the page is clear
  var fullW = 0
  function fitBtn() {
    if (!btn || state.open) return
    // layout box, not getBoundingClientRect: the hide transform may still be sliding it back in
    var r = { width: btn.offsetWidth, right: btn.offsetLeft + btn.offsetWidth, bottom: btn.offsetTop + btn.offsetHeight }
    if (!r.width || btn.classList.contains('lcochat-hide')) return
    if (!btn.classList.contains('lcochat-sm')) fullW = r.width
    var box = { left: r.right - (fullW || r.width), right: r.right, top: r.bottom - 48, bottom: r.bottom }
    var seen = [], hit = false
    for (var xi = 0; xi < 5 && !hit; xi++) {
      for (var yi = 0; yi < 3 && !hit; yi++) {   // rows at the pill's top edge, middle and bottom edge
        var px = box.left + (box.right - box.left) * (xi + 0.5) / 5, py = box.top + [2, 24, 46][yi]
        var els = document.elementsFromPoint ? document.elementsFromPoint(px, py) : []
        for (var i = 0; i < els.length && !hit; i++) {
          var n = els[i]
          if (n === btn || btn.contains(n) || n === document.body || n === document.documentElement || seen.indexOf(n) >= 0) continue
          if (panel && panel.contains(n)) continue
          seen.push(n)
          // a small element (a line, a link, a card label): all its text; a big container: only its own text
          var deep = n.getBoundingClientRect().height < 400
          var texts = [], c
          if (deep) { var tw = document.createTreeWalker(n, 4); while ((c = tw.nextNode())) texts.push(c) }
          else { for (c = n.firstChild; c; c = c.nextSibling) if (c.nodeType === 3) texts.push(c) }
          for (var t = 0; t < texts.length && !hit; t++) {
            c = texts[t]
            if (!c.nodeValue.trim()) continue
            var rg = document.createRange(); rg.selectNodeContents(c)
            var rs = rg.getClientRects()
            for (var k = 0; k < rs.length; k++) {
              var q = rs[k]
              if (q.right > box.left && q.left < box.right && q.bottom > box.top && q.top < box.bottom) { hit = true; break }
            }
          }
        }
      }
    }
    btn.classList.toggle('lcochat-sm', hit)
  }

  if (document.body) mount()
  else document.addEventListener('DOMContentLoaded', mount)
})()
