/* LUXOVA CONTACT. WhatsApp and WeChat buttons for luxovahome.com.
 *
 *   <script src="/luxova-contact.js" defer
 *           data-whatsapp="66812345678"
 *           data-whatsapp-text="Hi, I saw your kitchens on thelocalcabinetry.com"
 *           data-wechat-id="luxova_home"
 *           data-wechat-qr="/img/wechat-qr.png"
 *           data-hours="Mon-Sat 09:00-18:00"
 *           data-timezone="Asia/Bangkok"
 *           data-agent-name="Hannah Harper"
 *           data-whatsapp-label="..."></script>   optional, VERBATIM, no default
 *
 * ⛔ THIS SENDS NOTHING. It is two links and a string to copy. It does not talk
 * to the relay, it does not need `web-customer-service` in LIVE_CHANNELS, and it
 * does not touch the send wall. A WhatsApp link hands the visitor to a phone the
 * owner already answers. That is why it can ship while the AI chat stays dark.
 *
 * ⛔ IT OWNS NO FACT. Not the number, not the WeChat ID, not the hours, not the
 * name. Every one comes from a data- attribute and every one is REFUSED rather
 * than guessed. A button that dials a stranger is worse than no button.
 *
 * Self-contained: no import, no CDN, no build step, no third-party request.
 * ⛔ Deliberately NO QR-generation API. Every one of them is a CDN dependency
 * AND it would post the owner's WeChat ID to a third party to draw a picture.
 * The QR is an image the site already hosts, or there is no QR.
 */
(function () {
  'use strict'

  var script = document.currentScript
  if (!script) return
  var d = script.dataset || {}
  var log = function (m) { try { console.error('[luxova-contact] ' + m) } catch (e) {} }

  // =========================================================================
  // ⛔ PLACEHOLDER REFUSAL. The single most dangerous thing this file could do
  // is ship a number that LOOKS real. "+1 555 0100" is a real dialable string
  // to a phone; 1234567890 reaches somebody. A visitor who taps it is handed to
  // a stranger while believing they reached us, and we would never hear about
  // it, because the failure happens entirely on their device.
  //
  // So a number is either plausibly the owner's, or the button does not render.
  // There is no third state and no default.
  // =========================================================================
  var PLACEHOLDERS = [
    /^0+$/,                      // 0000000000
    /^(\d)\1+$/,                 // 1111111111, 9999999999
    /^1?234567890$/,             // keyboard walk
    /^1?5551?\d{4}$/,            // North American fictional range
    /^123456789\d*$/,
    /^(44)?0?7700900\d{3}$/,     // UK drama range, with or without the country code
    /^(1)?5550\d{3}$/,           // +1 555 01xx, the other fictional block
  ]

  function phoneProblem(raw) {
    if (!raw) return 'no data-whatsapp set'
    var digits = String(raw).replace(/[^\d]/g, '')
    if (digits !== String(raw).replace(/^\+/, '').replace(/[\s()\-.]/g, '')) {
      return 'data-whatsapp has characters that are not part of a number'
    }
    if (digits.length < 8) return 'data-whatsapp is too short to be a real number (' + digits.length + ' digits)'
    if (digits.length > 15) return 'data-whatsapp is longer than E.164 allows (15 digits)'
    if (/^0/.test(digits)) return 'data-whatsapp starts with 0. wa.me needs the country code, with no leading zero and no +'
    for (var i = 0; i < PLACEHOLDERS.length; i++) {
      if (PLACEHOLDERS[i].test(digits)) return 'data-whatsapp looks like a placeholder (' + digits + '). Refusing to render a button that would dial a stranger.'
    }
    return null
  }

  function waLink(digits, text) {
    var u = 'https://wa.me/' + String(digits).replace(/[^\d]/g, '')
    return text ? u + '?text=' + encodeURIComponent(text) : u
  }

  // =========================================================================
  // ⛔ PRESENCE. THE PART I PUSHED BACK ON, AND WHY IT IS BUILT THIS WAY.
  //
  // A green "Online" dot that is always lit is a false statement to a buyer,
  // and it is the cheapest kind to make because nobody can catch you at it.
  //
  // Three options were on the table:
  //
  //   REAL AVAILABILITY  -- we have no signal. This button hands off to a phone.
  //                         Nothing in this repo knows whether the owner is
  //                         holding it. And `web-customer-service` is not in
  //                         LIVE_CHANNELS, so there is no operator on the web
  //                         chat at all: "online" would be false by definition.
  //
  //   "REPLIES WITHIN X" -- X is a FACT, and this file owns no facts. Nobody has
  //                         measured it for this channel, which has never been
  //                         live, so any number would be invented. It is
  //                         supported ONLY when the owner supplies it
  //                         (data-replies-within), and it is never defaulted.
  //
  //   PUBLISHED HOURS    -- the owner already knows them, a visitor can check
  //                         them, and the badge CHANGES STATE, so it is not a
  //                         light that is always on. This is the honest one.
  //
  // ⛔ AND THE DEFAULT WHEN NOTHING IS CONFIGURED IS NO CLAIM AT ALL. Not a grey
  // dot, not "offline": just the buttons. Saying nothing is honest; guessing is
  // not.
  // =========================================================================
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  function parseHours(spec) {
    if (!spec) return null
    var m = String(spec).trim().match(/^([A-Za-z]{3})\s*-\s*([A-Za-z]{3})\s+(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/)
    if (!m) return null
    var from = DAYS.indexOf(m[1].slice(0, 1).toUpperCase() + m[1].slice(1, 3).toLowerCase())
    var to = DAYS.indexOf(m[2].slice(0, 1).toUpperCase() + m[2].slice(1, 3).toLowerCase())
    if (from < 0 || to < 0) return null
    return { from: from, to: to, openMin: +m[3] * 60 + +m[4], closeMin: +m[5] * 60 + +m[6] }
  }

  /** Where the business is, not where the visitor is. */
  function nowThere(tz, when) {
    var date = when || new Date()
    if (!tz) return { day: date.getDay(), min: date.getHours() * 60 + date.getMinutes() }
    try {
      var f = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
      })
      var parts = {}
      f.formatToParts(date).forEach(function (p) { parts[p.type] = p.value })
      var day = DAYS.indexOf(parts.weekday)
      var hour = parseInt(parts.hour, 10) % 24
      if (day < 0 || isNaN(hour)) return null
      return { day: day, min: hour * 60 + parseInt(parts.minute, 10) }
    } catch (e) {
      // ⛔ An unknown timezone must not silently become the visitor's own. That
      // would render "Open now" computed against the wrong clock.
      return null
    }
  }

  function presenceFor(opts) {
    var hours = parseHours(opts.hours)
    if (!hours || !opts.timezone) return null          // no claim
    var t = nowThere(opts.timezone, opts.when)
    if (!t) return null                                 // could not compute: say nothing
    var inDays = hours.from <= hours.to
      ? (t.day >= hours.from && t.day <= hours.to)
      : (t.day >= hours.from || t.day <= hours.to)
    var open = inDays && t.min >= hours.openMin && t.min < hours.closeMin
    return { open: open, label: open ? 'Open now' : 'Closed now', hours: opts.hours, timezone: opts.timezone }
  }

  // Exposed so the behaviour can be tested without a browser. Pure functions
  // only: no DOM, no network, no state.
  try {
    window.LuxovaContact = { phoneProblem: phoneProblem, waLink: waLink, parseHours: parseHours, presenceFor: presenceFor }
  } catch (e) {}

  // =========================================================================
  // RENDER
  // =========================================================================
  // =========================================================================
  // ⛔ THE SECOND OPTION: ON-SITE LIVE SUPPORT, AND WHY IT IS DARK.
  //
  // The owner wants a chooser: WhatsApp, or chat with us here. WhatsApp works
  // today because it is a LINK to a phone a human answers. The on-site path
  // cannot answer anyone yet:
  //
  //   - `web-customer-service` is NOT in LIVE_CHANNELS
  //   - it has no voice gate yet; it is building one
  //   - without that gate it would post whatever text it was handed, which is
  //     the 2026-08-10 failure with a different logo, on our own site, in
  //     front of real buyers
  //
  // ⛔ A CHAT BOX THAT ACCEPTS A MESSAGE AND NEVER ANSWERS IS WORSE THAN NO
  // CHAT BOX. The buyer believes they have reached us and stops looking for
  // another way. So the dark state accepts NO input. It is a statement and a
  // redirect, not a form.
  //
  // ⛔ AND THE WORDS ARE NOT MINE. This desk owns the mechanism;
  // `web-customer-service` owns the voice. The copy arrives through
  // `data-chat-*` attributes, and if it is absent THE OPTION DOES NOT RENDER.
  // It is not defaulted, because a default would be me writing another desk's
  // words and then nobody ever noticing that I had.
  //
  // TO GO LIVE LATER: set data-chat-live="yes" once the gate exists and the
  // channel is in LIVE_CHANNELS. Same chooser, one attribute, no redesign.
  // =========================================================================
  var chat = {
    label: (d.chatLabel || '').trim(),
    status: (d.chatStatus || '').trim(),
    redirect: (d.chatRedirect || '').trim(),
    aria: (d.chatAria || '').trim(),
    live: (d.chatLive || '').trim().toLowerCase() === 'yes',
  }
  chat.hasCopy = Boolean(chat.label && chat.status)

  var waRaw = d.whatsapp || ''
  var waProblem = phoneProblem(waRaw)
  var wechatId = (d.wechatId || '').trim()
  var wechatQr = (d.wechatQr || '').trim()

  // ⛔ THE SUBTITLE IS DERIVED, NEVER TYPED. Copy is web-customer-service's,
  // routed by the team lead as CONTACT CARD SUBTITLE v1, placed verbatim.
  //
  // Their instruction and the reason for it: "DERIVE IT FROM CONFIG. DO NOT
  // HARDCODE ANY OF THE FOUR. The live bug is not that someone wrote a wrong
  // sentence, it is that a claim about what exists was frozen into a string
  // while the thing it described was not there."
  //
  // So if WeChat is switched on tomorrow the line follows with no copy edit, and
  // if WhatsApp is switched off it stops claiming WhatsApp the same day.
  //
  // ⛔ THE FOURTH CASE IS A REFUSAL AND IT RETURNS null. "If no channel is
  // configured, render no subtitle at all. I will not write a sentence for that
  // state, because every sentence I could write would name a route I cannot
  // verify exists." A sentence is not invented here to fill the gap.
  var contactSubtitle = function (hasWhatsApp, hasWeChat) {
    if (hasWhatsApp && hasWeChat) return 'Message us on WhatsApp or WeChat.'
    if (hasWhatsApp) return 'Message us on WhatsApp.'
    if (hasWeChat) return 'Message us on WeChat.'
    return null
  }

  if (waProblem) log(waProblem + ' -- the WhatsApp button will NOT be rendered.')
  if (!wechatId && !wechatQr) log('no data-wechat-id and no data-wechat-qr -- the WeChat block will NOT be rendered.')
  if (!chat.hasCopy && (d.chatLive || d.chatRedirect || d.chatAria)) {
    log('the on-site chat option is configured but has no data-chat-label and data-chat-status. ' +
        'Those words belong to web-customer-service and are NOT defaulted here. The option will NOT render.')
  }
  if (waProblem && !wechatId && !wechatQr) {
    log('nothing to render. Set data-whatsapp and/or data-wechat-id. Refusing to show an empty contact card.')
    return
  }

  // ⛔ THE SCRIPT MAY RUN BEFORE THERE IS A BODY, and this file has to survive
  // that. `document.currentScript` and `dataset` are only readable during
  // synchronous execution, so the CONFIG is captured above, at once, and only
  // the DOM work waits. Found 2026-08-13 by loading it from <head> without
  // `defer`: `document.body` was null, the final appendChild threw, and the
  // widget rendered NOTHING with no error a visitor or an operator would see.
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', mount)
  } else {
    mount()
  }

  function mount() {
  var host = document.createElement('div')
  host.setAttribute('data-luxova-contact', '')

  // ⛔ READ FROM THE CASCADE, NOT FROM THE NETWORK. `var(--sans,inherit)` covers
  // a page that defines a token and a page that merely sets a font. It cannot
  // cover a page that sets NEITHER, where `inherit` resolves to the browser's
  // default serif and the card would render in Times next to a modern site.
  // getComputedStyle is a local read: no request, nothing to be down.
  // ⛔ MEASURED, NOT NAME-MATCHED. The first version tested the page font against
  // a list of default names (Times, serif, -apple-system). On a Mac in a CJK
  // locale the browser default is "Hiragino Kaku Gothic ProN", which is on no
  // such list, so the fallback never applied and the card rendered unbranded.
  //
  // A hardcoded list of what a default "looks like" is a fact with no owner, and
  // it goes stale per platform and per locale. So: render a probe with
  // `all:initial`, which BY DEFINITION carries the browser default, and compare.
  // If the body matches it, the page has set no font of its own.
  try {
    var probe = document.createElement('div')
    probe.style.all = 'initial'
    probe.style.position = 'absolute'
    probe.style.visibility = 'hidden'
    document.documentElement.appendChild(probe)
    var initialFont = getComputedStyle(probe).fontFamily
    probe.parentNode.removeChild(probe)
    var pageFont = (getComputedStyle(document.body).fontFamily || '').trim()
    if (!pageFont || pageFont === initialFont) {
      host.style.setProperty('--lux-sans', '"Hanken Grotesk",ui-sans-serif,system-ui,-apple-system,sans-serif')
      host.style.setProperty('--lux-serif', '"Fraunces","Hoefler Text",Georgia,"Times New Roman",serif')
    }
  } catch (e) {}
  var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host

  var presence = presenceFor({ hours: d.hours, timezone: d.timezone })
  var name = (d.agentName || '').trim()
  var waLabel = (d.whatsappLabel || '').trim()
  var repliesWithin = (d.repliesWithin || '').trim()

  var css = document.createElement('style')
  css.textContent = [
    /* ⛔ THE SITE'S OWN TOKENS, consumed as variables with the live values as
       fallbacks. Read from luxovahome.com's :root on 2026-08-13. Using var()
       means a retheme on the site carries here instead of drifting. */
    /* ⛔ INHERIT, DO NOT DECLARE. A custom property is an INHERITED property and
       `all:initial` does not reset custom properties, so the page's own --sans,
       --serif, --ink and the rest reach in through the shadow boundary on their
       own. No fetch, no lookup, no copy of the site's palette to go stale.
       The hardcoded values are FALLBACKS for a page that defines nothing. */
    ':host{all:initial;',
    '--lux-sans:var(--sans,inherit);--lux-serif:var(--serif,var(--sans,inherit));',
    /* ⛔ DISTINCT NAMES. `--navy:var(--luxova-navy,var(--navy,#0e2740))` REFERS TO
       ITSELF, which CSS treats as invalid at computed-value time: the property
       becomes guaranteed-invalid, `background:var(--lux-navy)` resolves to nothing,
       and the WhatsApp button rendered TRANSPARENT with white text on a white
       card. Invisible, on every page, while the DOM still reported a correct
       link. Caught 2026-08-14 by measuring backgroundColor on the real markup;
       26 static tests missed it because there is no CSS engine in them. */
    '--lux-ink:var(--luxova-ink,var(--ink,#14273f));--lux-soft:var(--luxova-soft,var(--soft,#51606f));',
    '--lux-line:var(--luxova-line,var(--line,#e7e5df));--lux-panel:var(--luxova-panel,var(--panel,#f3f0ea));',
    '--lux-navy:var(--luxova-navy,var(--navy,#0e2740));--lux-gold:var(--luxova-gold,var(--gold,#b4862f));',
    /* Declared LAST so it beats all:initial for this one property. */
    'font-family:var(--lux-sans);}',
    '*{box-sizing:border-box}',
    '.card{position:fixed;right:20px;bottom:20px;z-index:2147483000;width:min(320px,calc(100vw - 40px));',
    'background:#fff;border:1px solid var(--lux-line);border-radius:7px;padding:16px;',
    'box-shadow:0 10px 40px rgba(8,20,34,.13);font-family:inherit;color:var(--lux-ink)}',
    '.hd{font-family:var(--lux-serif);font-size:16px;font-weight:600;margin:0 0 2px}',
    '.sub{font-size:12.5px;color:var(--lux-soft);margin:0 0 12px;line-height:1.45}',
    '.dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px;vertical-align:1px}',
    '.on{background:#3f9a5c}.off{background:var(--muted,#97a1ad)}',
    '.btn{display:flex;align-items:center;gap:10px;width:100%;text-decoration:none;cursor:pointer;',
    'border:1px solid var(--lux-line);background:var(--lux-panel);color:var(--lux-ink);border-radius:7px;',
    'padding:10px 14px;font:inherit;font-size:14px;font-weight:500;margin-top:8px;text-align:left}',
    '.btn:hover{border-color:var(--lux-gold)}',
    '.btn svg{flex:0 0 18px}',
    '.wa{background:var(--lux-navy);color:#fff;border-color:var(--lux-navy)}',
    '.wa:hover{border-color:var(--lux-gold)}',
    '.id{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}',
    '.qr{display:block;margin:10px auto 0;width:148px;height:148px;border:1px solid var(--lux-line);border-radius:7px}',
    '.note{font-size:11.5px;color:var(--lux-soft);margin:10px 0 0;line-height:1.45}',
    '.chat{margin-top:10px;padding:10px 12px;border:1px dashed var(--lux-line);border-radius:7px;background:transparent}',
    '.chat-l{margin:0;font-size:13.5px;font-weight:600;color:var(--lux-ink)}',
    '.chat-s{margin:4px 0 0;font-size:12px;color:var(--lux-soft);line-height:1.45}',
    /* The card starts MINIMIZED: a round launcher, owner's ruling 2026-08-27.
       A permanent 320px card on every page took the corner from the chat. */
    '.fab{position:fixed;right:20px;bottom:20px;z-index:2147483000;width:56px;height:56px;',
    'border-radius:50%;border:none;cursor:pointer;background:var(--lux-navy);color:#fff;',
    'display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(8,20,34,.2);',
    'transition:transform .2s ease}',
    '.fab:hover{transform:scale(1.05)}',
    '.fab svg{width:24px;height:24px}',
    '.hide{display:none}',
    '.hdrow{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}',
    '.min{border:none;background:transparent;cursor:pointer;color:var(--lux-soft);',
    'font-size:18px;line-height:1;padding:2px 6px;border-radius:7px}',
    '.min:hover{color:var(--lux-ink);background:var(--lux-panel)}',
    '@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}',
  ].join('')
  root.appendChild(css)

  var card = document.createElement('div')
  card.className = 'card hide'

  // ⛔ MINIMIZED BY DEFAULT, owner's ruling 2026-08-27. The card opens from a
  // round launcher and folds back behind it: its own minimize control, and
  // automatically when the live chat opens, so the two never share the corner.
  var fab = document.createElement('button')
  fab.type = 'button'
  fab.className = 'fab'
  fab.setAttribute('aria-label', name ? ('Contact ' + name) : 'Contact us')
  fab.setAttribute('aria-expanded', 'false')
  fab.appendChild(icon('M4 4h16c1 0 2 1 2 2v9c0 1-1 2-2 2H9l-5 4V6c0-1 1-2 2-2Z'))
  function setCard(open) {
    if (open) { card.className = 'card'; fab.className = 'fab hide' } else { card.className = 'card hide'; fab.className = 'fab' }
    fab.setAttribute('aria-expanded', open ? 'true' : 'false')
  }
  fab.addEventListener('click', function () { setCard(true) })
  // The chat widget announces its open and close on the document, and the
  // card yields the corner both ways: chat open means NOTHING of ours shows,
  // chat closed means the launcher comes back. Like a chat app.
  document.addEventListener('luxova-chat', function (e) {
    if (e && e.detail && e.detail.open) {
      card.className = 'card hide'
      fab.className = 'fab hide'
      fab.setAttribute('aria-expanded', 'false')
    } else {
      setCard(false)
    }
  })

  var hdrow = document.createElement('div')
  hdrow.className = 'hdrow'
  var hd = document.createElement('p')
  hd.className = 'hd'
  // ⛔ textContent everywhere. Nothing here is ever innerHTML'd.
  hd.textContent = name ? ('Message ' + name) : 'Message us'
  hdrow.appendChild(hd)
  var minb = document.createElement('button')
  minb.type = 'button'
  minb.className = 'min'
  minb.setAttribute('aria-label', 'Minimize')
  minb.textContent = '−'
  minb.addEventListener('click', function () { setCard(false) })
  hdrow.appendChild(minb)
  card.appendChild(hdrow)


  var sub = document.createElement('p')
  sub.className = 'sub'
  if (presence) {
    var dot = document.createElement('span')
    dot.className = 'dot ' + (presence.open ? 'on' : 'off')
    sub.appendChild(dot)
    sub.appendChild(document.createTextNode(presence.label + ' · ' + presence.hours + ' (' + presence.timezone + ')'))
  } else if (repliesWithin) {
    sub.textContent = 'Usually replies within ' + repliesWithin
  } else {
    // ⛔ NO AVAILABILITY CLAIM. See the note above presenceFor.
    //
    // ⛔ AND NO CHANNEL CLAIM THAT IS NOT TRUE. This line was the hardcoded
    // sentence 'We answer on WhatsApp and WeChat.', which rendered even when
    // WeChat was not configured at all. That is the live bug the team lead
    // described when routing CONTACT CARD SUBTITLE v1: "a claim about what
    // exists was frozen into a string while the thing it described was not
    // there." Found still present on 2026-08-15 by driving the widget with
    // WhatsApp only and reading the DOM back.
    //
    // Derived from the same values the buttons are, so the sentence and the
    // buttons cannot disagree.
    sub.textContent = contactSubtitle(!waProblem, Boolean(wechatId || wechatQr)) || ''
  }
  // ⛔ THE FOURTH CASE RENDERS NOTHING, not an empty line. web-customer-service
  // refused to write a sentence for the no-channel state, and an empty <p> is a
  // sentence-shaped hole rather than a refusal.
  if (sub.textContent || (sub.children && sub.children.length)) card.appendChild(sub)

  if (!waProblem) {
    var wa = document.createElement('a')
    wa.className = 'btn wa'
    wa.href = waLink(waRaw, d.whatsappText || '')
    wa.target = '_blank'
    wa.rel = 'noopener noreferrer'
    wa.appendChild(icon('M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.2 1.2-1.7 1.2-.5.1-1 .2-3.2-.7-2.7-1.1-4.4-3.9-4.5-4-.1-.2-1-1.40-1-2.6 0-1.2.6-1.8.9-2 .2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.3 0 .5l-.4.5-.3.3c-.1.1-.2.3 0 .5.2.4.8 1.3 1.7 2.1 1.1 1 2 1.3 2.3 1.4.2.1.4.1.5-.1l.7-.9c.2-.2.3-.2.5-.1l2 .9c.2.1.4.2.4.3.1.2.1.6 0 1Z'))
    // ⛔ THE WHOLE LABEL, VERBATIM, OR THE DEFAULT. Never a name formatted into
    // a sentence: the owner asked for WhatsApp to be labelled for Hayden and the
    // chat for Hannah Harper, same number under two names, and deciding whether
    // that reads "WhatsApp Hayden" or "Hayden on WhatsApp" is COPY. This desk
    // owns the slot; whoever owns the voice supplies the words. Absent, the
    // button reads exactly as it did before, which is not a guess.
    wa.appendChild(document.createTextNode(waLabel || 'WhatsApp'))
    card.appendChild(wa)
  }

  // ⛔ THE DARK OPTION. Rendered as a statement, never as an input.
  if (chat.hasCopy && !chat.live) {
    var box = document.createElement('div')
    box.className = 'chat dark'
    var cl = document.createElement('p')
    cl.className = 'chat-l'
    cl.textContent = chat.label
    box.appendChild(cl)
    var cs2 = document.createElement('p')
    cs2.className = 'chat-s'
    cs2.textContent = chat.status
    box.appendChild(cs2)
    if (chat.redirect) {
      var cr = document.createElement('p')
      cr.className = 'chat-s'
      cr.textContent = chat.redirect
      box.appendChild(cr)
    }
    if (chat.aria) box.setAttribute('aria-label', chat.aria)
    // ⛔ NO input, NO textarea, NO form, NO submit. There is nothing to type
    // into, so a visitor cannot leave a message that nobody will read.
    card.appendChild(box)
  } else if (chat.hasCopy && chat.live) {
    // ⛔ THE LIVE PATH OPENS THE CHAT, IT DOES NOT BUILD ONE. The chat surface
    // is luxova-chat.js, loaded by the page with data-launcher="none" so this
    // card is the one entry point, and it exposes window.__luxovaChatApi.
    // This file still holds no message path of its own: no input, no relay
    // URL, no send. It presses the other widget's open button, nothing more.
    //
    // ⛔ THE ICON IS INTEGER COORDINATES ONLY. A decimal pair in bezier data
    // has already tripped the value wall once as a coincidence; drawing with
    // integers means there is nothing for the matcher to mistake.
    var lc = document.createElement('button')
    lc.type = 'button'
    lc.className = 'btn'
    lc.appendChild(icon('M4 4h16c1 0 2 1 2 2v9c0 1-1 2-2 2H9l-5 4V6c0-1 1-2 2-2Z'))
    lc.appendChild(document.createTextNode(chat.label))
    // ⛔ NO aria-label HERE. data-chat-aria narrates the DARK state ("not open
    // yet, message us on WhatsApp instead") and would lie on a working button.
    // The accessible name is the visible label, which is already her copy.
    lc.addEventListener('click', function () {
      var api = window.__luxovaChatApi
      // ⛔ A DEAD CLICK LIES. If the chat script did not load (blocked, CSP,
      // network), say the redirect line web-customer-service wrote for exactly
      // the state where this route cannot be promised. Never invent copy here.
      // On success the card FOLDS AWAY: the chat panel takes the corner, and
      // two surfaces stacked there is the bug this line exists to prevent.
      if (api && api.open) { setCard(false); api.open(); return }
      if (chat.redirect && !lc.luxovaRedirectShown) {
        lc.luxovaRedirectShown = true
        var oops = document.createElement('p')
        oops.className = 'chat-s'
        oops.textContent = chat.redirect
        lc.parentNode.insertBefore(oops, lc.nextSibling)
      }
    })
    card.appendChild(lc)
  }

  // =========================================================================
  // ⛔ WECHAT IS NOT WHATSAPP AND IS NOT TREATED AS IF IT WERE.
  //
  // There is no URL scheme that opens a chat with a specific account from a
  // DESKTOP browser. `weixin://` exists on mobile and is unreliable even there:
  // it silently does nothing when the app is absent, which looks to the visitor
  // exactly like a broken site. So there is no WeChat "button" that behaves like
  // the WhatsApp one, and pretending otherwise would ship a dead control.
  //
  // What actually works: show the ID and let them copy it, and show a QR the
  // phone camera can scan. Both are things the visitor completes in the app.
  // =========================================================================
  if (wechatId || wechatQr) {
    if (wechatId) {
      var copy = document.createElement('button')
      copy.type = 'button'
      copy.className = 'btn'
      copy.appendChild(icon('M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-2 7.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z'))
      var label = document.createElement('span')
      label.className = 'id'
      label.textContent = 'WeChat: ' + wechatId
      copy.appendChild(label)
      copy.addEventListener('click', function () {
        var done = function (ok) { label.textContent = ok ? 'Copied: ' + wechatId : 'WeChat: ' + wechatId }
        try {
          navigator.clipboard.writeText(wechatId).then(function () { done(true) }, function () { done(false) })
        } catch (e) { done(false) }
        setTimeout(function () { done(false) }, 2500)
      })
      card.appendChild(copy)
    }
    if (wechatQr) {
      var img = document.createElement('img')
      img.className = 'qr'
      img.alt = wechatId ? ('WeChat QR code for ' + wechatId) : 'WeChat QR code'
      img.loading = 'lazy'
      img.src = wechatQr
      card.appendChild(img)
      var note = document.createElement('p')
      note.className = 'note'
      note.textContent = 'Open WeChat, tap the + and choose Scan.'
      card.appendChild(note)
    }
  }

  root.appendChild(fab)
  root.appendChild(card)
  document.body.appendChild(host)
  }

  function icon(path) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('width', '18')
    svg.setAttribute('height', '18')
    svg.setAttribute('aria-hidden', 'true')
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    p.setAttribute('d', path)
    p.setAttribute('fill', 'currentColor')
    svg.appendChild(p)
    return svg
  }
})();
