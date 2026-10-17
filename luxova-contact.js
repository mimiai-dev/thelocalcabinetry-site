/* Floating "Design your cabinets" button.
 *
 * One plain link to the design page, where a visitor signs in with their email and talks to us.
 * It does not claim anybody is reading, shows no agent name and no opening hours, loads nothing
 * from any other host and sets no cookie. The old contact card (WhatsApp, WeChat, the "live chat,
 * not open yet" notice) was removed on purpose: it pointed at a chat nobody answered.
 *
 *   <script src="/luxova-contact.js" defer
 *           data-href="/design"
 *           data-label="Design your cabinets"></script>
 *
 * Only the same-site path /design is accepted (the design page is served from this very host); anything else renders nothing.
 */
(function () {
  var s = document.currentScript
  var d = (s && s.dataset) || {}
  var href = (d.href || '').trim()
  var label = (d.label || 'Design your cabinets').trim().slice(0, 40)
  if (!/^\/design(\/|$)/.test(href)) return

  function mount() {
    if (document.querySelector('[data-luxova-contact]')) return
    var host = document.createElement('div')
    host.setAttribute('data-luxova-contact', '')
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host
    var css = document.createElement('style')
    css.textContent = [
      ':host{all:initial}',
      'a{position:fixed;right:16px;bottom:16px;z-index:2147483000;display:inline-flex;align-items:center;gap:8px;',
      'min-height:48px;padding:0 20px;border-radius:999px;background:#0e2740;color:#fff;text-decoration:none;',
      'font:600 15px/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 6px 24px rgba(8,20,34,.25)}',
      'a:hover{background:#14365a}',
      'a:focus-visible{outline:3px solid #b4862f;outline-offset:3px}',
      'svg{flex:0 0 18px}',
      '@media print{a{display:none}}'
    ].join('')
    var a = document.createElement('a')
    a.href = href
    a.rel = 'noopener'
    a.setAttribute('aria-label', label)
    var NS = 'http://www.w3.org/2000/svg'
    var svg = document.createElementNS(NS, 'svg')
    ;[['width', '18'], ['height', '18'], ['viewBox', '0 0 24 24'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '2'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round'], ['aria-hidden', 'true']].forEach(function (kv) { svg.setAttribute(kv[0], kv[1]) })
    var p = document.createElementNS(NS, 'path')
    p.setAttribute('d', 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z')
    svg.appendChild(p)
    a.appendChild(svg)
    var t = document.createElement('span')
    t.textContent = label
    a.appendChild(t)
    root.appendChild(css)
    root.appendChild(a)
    document.body.appendChild(host)
  }

  if (document.body) mount()
  else document.addEventListener('DOMContentLoaded', mount)
})()
