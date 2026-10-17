/* Luxova → Olympus backend wiring (additive; does NOT touch Umami or the UI).
 * 1) fires a visit beacon to the backend (so the AI operator sees traffic in D1)
 * 2) routes the contact form (.lead-form) to the backend /api/inquiry with a
 *    stable client id (cid) so a lead links to the visitor's prior page views.
 * Beats the page's bundled handler via a capture-phase listener; on any backend
 * failure it falls back to the original mailto so a lead is never lost. */
(function () {
  var API = 'https://luxovahome.alidata.shop';
  var KEY = 'luxova_cid';

  function cid() {
    try {
      var c = localStorage.getItem(KEY);
      if (!c || !/^[a-f0-9]{32}$/.test(c)) {
        c = Array.from(crypto.getRandomValues(new Uint8Array(16)))
          .map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
        localStorage.setItem(KEY, c);
      }
      return c;
    } catch (e) { return ''; }
  }

  // 1) Visit beacon — best-effort, never blocks the page.
  try {
    fetch(API + '/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cid: cid(), path: location.pathname, referrer: document.referrer || null }),
      keepalive: true,
    }).catch(function () {});
  } catch (e) {}

  // 2) Lead form -> backend. Capture phase + stopImmediatePropagation so this
  //    runs INSTEAD of the bundled relative-/api/inquiry handler.
  document.addEventListener('submit', function (ev) {
    var f = ev.target;
    if (!f || !f.classList || !f.classList.contains('lead-form')) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    var fd = new FormData(f);
    fd.append('cid', cid());
    fetch(API + '/api/inquiry', { method: 'POST', body: fd })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r); })
      .then(function () {
        var note = document.createElement('p');
        note.className = 'lead-thanks';
        note.textContent = 'Thank you — we received your message and will be in touch shortly.';
        if (f.parentNode) f.parentNode.replaceChild(note, f);
      })
      .catch(function () {
        // Never lose a lead: fall back to the original email path.
        var email = f.getAttribute('data-email') || 'info@thelocalcabinetry.com';
        var body = 'Name: ' + (fd.get('name') || '') + '\nPhone: ' + (fd.get('phone') || '') +
          '\nEmail: ' + (fd.get('email') || '') + '\n\n' + (fd.get('message') || '');
        location.href = 'mailto:' + email + '?subject=' + encodeURIComponent('Website enquiry') +
          '&body=' + encodeURIComponent(body);
      });
  }, true);
})();
