/* Luxova sale popup. One file, no build, no dependency, like monitor.js.
 *
 *   <script src="/luxova-sale.js" defer
 *     data-headline="10% off your order"
 *     data-offer="Use code LUXOVA10 when you request your quote."
 *     data-code="LUXOVA10"
 *     data-cta="Chat with us"></script>
 *
 * ⛔ IT OWNS NO FACT. The percent, the code and every visible word arrive
 * through data- attributes, placed by whoever edits the site, and if the
 * headline or the offer is absent NOTHING RENDERS. A popup with a defaulted
 * discount is this file inventing a price promise, which is the one thing a
 * public page must never do (see the contact card, which refuses the same way).
 *
 * ⛔ IT TRANSMITS NOTHING. No fetch, no beacon, no relay URL. The CTA presses
 * the chat widget's open control when that widget is present, and falls back
 * to dismissing itself when it is not: a button that does nothing is a lie.
 *
 * ⛔ SHOWN WITH A COOLDOWN, owner's ruling 2026-08-27 (superseding the earlier
 * always-show, same day, owner's words: "can we like have a time out for it...
 * otherwise it always showing when user navigate which is annoying"). Closing
 * it, by any route, holds it down for COOLDOWN_MS; after that it shows again.
 * Storage failing (private mode) means it shows, never that it hides: the
 * failure direction is the one the owner chose to risk.
 */
(function () {
  'use strict'
  if (window.__luxovaSale) return
  window.__luxovaSale = true

  var script = document.currentScript || document.querySelector('script[data-headline]')
  var d = (script && script.dataset) || {}
  var headline = (d.headline || '').trim()
  var offer = (d.offer || '').trim()
  var code = (d.code || '').trim()
  var cta = (d.cta || '').trim()

  var log = function (m) { try { console.error('[luxova-sale] ' + m) } catch (e) { /* nothing to do */ } }

  // ⛔ NO COPY, NO POPUP. Words are supplied, never defaulted.
  if (!headline || !offer) {
    if (headline || offer || code || cta) log('data-headline and data-offer are both required. The popup will NOT render.')
    return
  }

  // The cooldown. Read failure means SHOW: a visitor seeing the sale twice is
  // the cheap direction, a sale nobody sees is the expensive one.
  var SEEN_KEY = 'luxova_sale_seen'
  var COOLDOWN_MS = 12 * 60 * 60 * 1000
  function withinCooldown() {
    try { return (Date.now() - Number(localStorage.getItem(SEEN_KEY) || 0)) < COOLDOWN_MS } catch (e) { return false }
  }
  function markSeen() {
    try { localStorage.setItem(SEEN_KEY, String(Date.now())) } catch (e) { /* private mode: it will just show again */ }
  }
  if (withinCooldown()) return

  function build() {
    if (!document.body) return
    var host = document.createElement('div')
    host.setAttribute('data-luxova-sale', '')
    host.style.setProperty('--lux-sans', '"Hanken Grotesk",ui-sans-serif,system-ui,-apple-system,sans-serif')
    host.style.setProperty('--lux-serif', '"Fraunces","Hoefler Text",Georgia,"Times New Roman",serif')
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host

    var css = document.createElement('style')
    css.textContent = [
      ':host{all:initial;',
      '--lux-ink:var(--luxova-ink,var(--ink,#14273f));--lux-soft:var(--luxova-soft,var(--soft,#51606f));',
      '--lux-line:var(--luxova-line,var(--line,#e7e5df));--lux-panel:var(--luxova-panel,var(--panel,#f3f0ea));',
      '--lux-navy:var(--luxova-navy,var(--navy,#0e2740));--lux-gold:var(--luxova-gold,var(--gold,#b4862f));',
      'font-family:var(--lux-sans);}',
      '*{box-sizing:border-box}',
      '.veil{position:fixed;inset:0;z-index:2147483000;background:rgba(8,20,34,.45);',
      'display:flex;align-items:center;justify-content:center;padding:20px}',
      '.box{position:relative;width:min(400px,calc(100vw - 40px));background:#fff;',
      'border:1px solid var(--lux-line);border-radius:7px;padding:28px 24px 24px;',
      'box-shadow:0 18px 60px rgba(8,20,34,.3);color:var(--lux-ink);text-align:center;',
      'animation:rise .25s ease both}',
      '@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}',
      '.hd{font-family:var(--lux-serif);font-size:24px;font-weight:600;margin:0 0 8px;color:var(--lux-navy)}',
      '.of{font-size:14px;color:var(--lux-soft);margin:0 0 14px;line-height:1.5}',
      '.code{display:inline-block;cursor:pointer;border:1px dashed var(--lux-gold);border-radius:7px;',
      'padding:8px 18px;margin:0 0 16px;background:var(--lux-panel);color:var(--lux-navy);',
      'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:16px;font-weight:600;letter-spacing:2px}',
      '.cta{display:block;width:100%;border:none;cursor:pointer;background:var(--lux-navy);color:#fff;',
      'border-radius:7px;padding:12px 16px;font:inherit;font-size:14px;font-weight:600}',
      '.cta:hover{background:var(--lux-gold)}',
      '.x{position:absolute;top:8px;right:8px;border:none;background:transparent;cursor:pointer;',
      'color:var(--lux-soft);font-size:20px;line-height:1;padding:4px 8px;border-radius:7px}',
      '.x:hover{color:var(--lux-ink);background:var(--lux-panel)}',
      '.hint{font-size:11px;color:var(--lux-soft);margin:6px 0 0}',
      '@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}',
    ].join('')
    root.appendChild(css)

    var veil = document.createElement('div')
    veil.className = 'veil'
    var box = document.createElement('div')
    box.className = 'box'
    box.setAttribute('role', 'dialog')
    box.setAttribute('aria-modal', 'true')
    box.setAttribute('aria-label', headline)

    var x = document.createElement('button')
    x.type = 'button'
    x.className = 'x'
    x.setAttribute('aria-label', 'Close')
    x.textContent = '×'
    box.appendChild(x)

    var hd = document.createElement('p')
    hd.className = 'hd'
    // ⛔ textContent everywhere. Nothing here is ever innerHTML'd.
    hd.textContent = headline
    box.appendChild(hd)

    var of = document.createElement('p')
    of.className = 'of'
    of.textContent = offer
    box.appendChild(of)

    if (code) {
      var cd = document.createElement('button')
      cd.type = 'button'
      cd.className = 'code'
      cd.textContent = code
      cd.setAttribute('aria-label', 'Copy code ' + code)
      var hint = document.createElement('p')
      hint.className = 'hint'
      hint.textContent = 'Click the code to copy it.'
      cd.addEventListener('click', function () {
        var done = function (ok) { cd.textContent = ok ? 'Copied' : code; setTimeout(function () { cd.textContent = code }, 1200) }
        try {
          navigator.clipboard.writeText(code).then(function () { done(true) }, function () { done(false) })
        } catch (e) { done(false) }
      })
      box.appendChild(cd)
      box.appendChild(hint)
    }

    if (cta) {
      var go = document.createElement('button')
      go.type = 'button'
      go.className = 'cta'
      go.textContent = cta
      go.addEventListener('click', function () {
        dismiss()
        // The button goes to the design page (data-href: the same-site /design path, or the old design host):
        // that is where a visitor talks to us. The old on-page chat widget is gone.
        var to = (d.href || '').trim()
        if (/^(https:\/\/design\.thelocalcabinetry\.com\/|\/design(\/|$|\?))/.test(to)) window.location.assign(to)
      })
      box.appendChild(go)
    }

    function dismiss() {
      markSeen()
      try { host.remove() } catch (e) { if (host.parentNode) host.parentNode.removeChild(host) }
    }
    x.addEventListener('click', dismiss)
    veil.addEventListener('click', function (e) { if (e.target === veil) dismiss() })
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') dismiss() })

    veil.appendChild(box)
    root.appendChild(veil)
    document.body.appendChild(host)
    try { x.focus() } catch (e) { /* focus is a nicety */ }
  }

  if (document.body) build()
  else document.addEventListener('DOMContentLoaded', build)
})();
