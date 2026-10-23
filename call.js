/* "Call us" (owner 2026-10-23): the phone number is not in any page, JSON-LD or tel: link. It is put together here, in the browser, from parts,
 * shown once the page has loaded, and the tel: href is built only when someone clicks. Without JavaScript the page shows a <noscript> "Use the
 * contact form" line instead. Markup: <a data-call href="/contact" style="display:none">Call us</a><noscript>...</noscript>.
 * The parts line is written by scripts/site-config.mjs from site.config.json; do not edit it here. */
(function () {
  var P = ['1', '85', '7', '93', '0', '83', '24']
  function num() { return P.join('') }
  function show() { var n = num(); return '(' + n.slice(1, 4) + ') ' + n.slice(4, 7) + '-' + n.slice(7) }
  function spoken() { return num().slice(1).split('').join(' ') }
  function reveal() {
    var els = document.querySelectorAll('a[data-call]')
    for (var i = 0; i < els.length; i++) {
      var a = els[i]
      a.textContent = 'Call ' + show()
      a.setAttribute('aria-label', 'Call us at ' + spoken())
      a.style.display = ''
      var ns = a.nextElementSibling
      if (ns && ns.tagName === 'NOSCRIPT') ns.parentNode.removeChild(ns)
    }
  }
  // the tel: href exists only from the click until the browser has followed it
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[data-call]') : null
    if (!a) return
    a.setAttribute('href', 'tel:+' + num())
    setTimeout(function () { a.setAttribute('href', '/contact') }, 600)
  }, true)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', reveal); else reveal()
  if (typeof module !== 'undefined') module.exports = { reveal: reveal }
})()
