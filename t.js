/* First-party click log for thelocalcabinetry.com. One same-origin file, no cookies, no third party.
 * Sends small GET requests to /_t (the VPS nginx answers 204 and writes /var/log/lco-web/tlc-events.json).
 * Sends: pageview, click on every <a> / <button> / [role=button], form submit, pageleave (seconds on page).
 * Each event carries ONLY: page path, element id (data-track or a CSS-path-like id), the element's visible text
 * (40 chars; never from inputs), link host + path (no query, no hash; mailto:/tel: only the scheme), mobile/desktop,
 * a random per-tab session id (sessionStorage, gone when the tab closes), and the seconds on page.
 * Never: input values, typed text, form data, cookies, localStorage ids, fingerprinting, click ids (gclid, fbclid), full URLs.
 * Query strings are never logged by the click events. The one exception is the first-touch source below: only the three campaign labels
 * utm_source / utm_medium / utm_campaign (marketing labels, not personal data) are read from the landing URL.
 * First-touch source (T-261019-2): the first page of the tab is kept in sessionStorage (tlc_src, never a cookie or localStorage) as
 * {l landing path, r referrer HOST if not this site, us/um/uc utm labels, ck google|meta if the landing URL had an ad click id (the id itself is never read into src), f time, v m|d}; window.__tlcSrc() returns it plus p = the current path.
 * It is attached ONLY when someone sends a form, opens a chat or goes to /design sign-in (see chat.js, the /design stubs). None with DNT/GPC.
 * Sends nothing at all when Do-Not-Track or Global Privacy Control is on.
 * CSP (meta tag, default-src 'self'): this file is script-src 'self'; the beacon is connect-src / img-src 'self'. No change needed. */
(function () {
  "use strict";
  try {
    var nav = navigator;
    if (nav.doNotTrack === "1" || window.doNotTrack === "1" || nav.msDoNotTrack === "1" || nav.globalPrivacyControl === true) return;
    if (!/(^|\.)thelocalcabinetry\.com$/.test(location.hostname)) return; // previews, file://, mirrors: silent

    // ---- first-touch source (T-261019-2), see the header
    function lab(v) { return String(v == null ? "" : v).toLowerCase().replace(/[^a-z0-9._+ -]/g, "").trim().slice(0, 60); }
    try {
      if (!sessionStorage.getItem("tlc_src")) {
        var o = { l: location.pathname.slice(0, 120), v: window.innerWidth < 768 ? "m" : "d", f: new Date().toISOString() };
        var rh = ""; try { rh = new URL(document.referrer).hostname; } catch (e) {}
        if (rh && !/(^|\.)thelocalcabinetry\.com$/.test(rh)) o.r = rh.slice(0, 80);
        var sp = new URLSearchParams(location.search);
        [["us", "utm_source"], ["um", "utm_medium"], ["uc", "utm_campaign"]].forEach(function (k) { var v = lab(sp.get(k[1])); if (v) o[k[0]] = v; });
        // ad click KIND only (never the click id itself): google (gclid) or meta (fbclid)
        if (sp.has("gclid")) o.ck = "google"; else if (sp.has("fbclid")) o.ck = "meta";
        sessionStorage.setItem("tlc_src", JSON.stringify(o));
      }
    } catch (e) {}
    window.__tlcSrc = function () {
      try {
        var o = JSON.parse(sessionStorage.getItem("tlc_src") || "null");
        if (!o || typeof o !== "object") return null;
        if (!o.f || Date.now() - Date.parse(o.f) > 30 * 864e5) return null;
        o.p = location.pathname.slice(0, 120);
        return o;
      } catch (e) { return null; }
    };
    // the existing page scripts build FormData on submit; this capture listener runs first and adds the hidden field
    document.addEventListener("submit", function (e) {
      var f = e.target;
      if (!f || f.tagName !== "FORM" || !f.matches || !f.matches('form[data-lead],form[data-member],form[action="/api/inquiry"]')) return;
      var s = window.__tlcSrc(); if (!s) return;
      var i = f.querySelector('input[name="src"]');
      if (!i) { i = document.createElement("input"); i.type = "hidden"; i.name = "src"; f.appendChild(i); }
      i.value = JSON.stringify(s);
    }, true);

    var ENDPOINT = "/_t";
    var MAX_EVENTS = 200; // per page load; pageleave is always allowed on top
    var DEBOUNCE_MS = 400; // the same element twice within this is one click
    var sent = 0, seq = 0, left = false, last = { id: "", at: 0 };
    var t0 = Date.now();

    // per-tab random id: sessionStorage only (no cookie, no localStorage); if storage is blocked it lives for this page load
    // ponytail: a plain random id, not a hash of anything about the visitor; a new tab is a new session by design.
    var sid = "";
    try { sid = sessionStorage.getItem("tlc_s") || ""; } catch (e) {}
    if (!/^[a-z0-9]{10}$/.test(sid)) {
      sid = "";
      try {
        var a = new Uint8Array(10); crypto.getRandomValues(a);
        for (var i = 0; i < 10; i++) sid += (a[i] % 36).toString(36);
        try { sessionStorage.setItem("tlc_s", sid); } catch (e) {}
      } catch (e) { sid = Math.random().toString(36).slice(2, 12).padEnd(10, "0"); }
    }

    function clean(s, n) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n); }

    // visible text of an element, skipping anything typed or chosen (input / textarea / select) and scripts
    function textOf(el) {
      var out = "";
      (function walk(n, depth) {
        if (out.length > 80 || depth > 6) return;
        for (var c = n.firstChild; c; c = c.nextSibling) {
          if (c.nodeType === 3) out += " " + c.nodeValue;
          else if (c.nodeType === 1 && !/^(INPUT|TEXTAREA|SELECT|SCRIPT|STYLE|OPTION)$/.test(c.tagName)) walk(c, depth + 1);
        }
      })(el, 0);
      var t = clean(out, 40);
      if (!t && !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) t = clean(el.getAttribute("aria-label") || el.getAttribute("title") || "", 40);
      if (!t) { var img = el.querySelector && el.querySelector("img[alt]"); if (img) t = clean(img.getAttribute("alt"), 40); }
      return t;
    }

    // stable id: data-track if present, else a CSS-path-like id (tag.class:nth-of-type, up to 4 levels, stops at a short id)
    function idOf(el) {
      var dt = el.getAttribute && el.getAttribute("data-track");
      if (dt) return clean(dt, 60).replace(/[^A-Za-z0-9_.:\/-]/g, "_");
      var parts = [];
      for (var n = el, d = 0; n && n.nodeType === 1 && n !== document.body && d < 4; n = n.parentNode, d++) {
        var tag = n.tagName.toLowerCase();
        if (n.id && /^[A-Za-z][A-Za-z0-9_-]{0,24}$/.test(n.id) && !/\d{3,}/.test(n.id)) { parts.unshift(tag + "#" + n.id); break; }
        var cls = (typeof n.className === "string" ? n.className : "").split(/\s+/)[0] || "";
        cls = /^[A-Za-z][A-Za-z0-9_-]{0,20}$/.test(cls) ? "." + cls : "";
        var idx = 1;
        for (var s = n.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === n.tagName) idx++;
        parts.unshift(tag + cls + (idx > 1 ? ":" + idx : ""));
      }
      return parts.join(">").slice(0, 100);
    }

    // link target: host + path only. mailto: / tel: / sms: keep the scheme and nothing else (the address is personal data).
    function hrefOf(el) {
      var raw = el.getAttribute && el.getAttribute("href");
      if (!raw) return "";
      try {
        var u = new URL(raw, location.href);
        if (u.protocol !== "http:" && u.protocol !== "https:") return u.protocol;
        return (u.host + u.pathname).slice(0, 120);
      } catch (e) { return ""; }
    }

    // "/" stays readable in the query (a path is not a secret; keeps page slugs out of the server-side token redaction)
    function enc(s) { return encodeURIComponent(s).replace(/%2F/g, "/"); }

    function send(ev, extra) {
      if (ev !== "leave" && sent >= MAX_EVENTS) return;
      sent++; seq++;
      var q = "e=" + ev + "&p=" + enc(location.pathname.slice(0, 120)) +
        "&v=" + (window.innerWidth < 768 ? "m" : "d") + "&s=" + sid + "&n=" + seq;
      if (extra) for (var k in extra) if (extra[k] !== "" && extra[k] != null) q += "&" + k + "=" + enc(extra[k]);
      var url = ENDPOINT + "?" + q;
      try {
        if (window.fetch) fetch(url, { method: "GET", keepalive: true, credentials: "omit", cache: "no-store" }).catch(function () {});
        else new Image().src = url;
      } catch (e) {}
    }

    function onClick(e) {
      var t = e.target;
      if (!t || !t.closest) t = t && t.parentElement;
      if (!t || !t.closest) return;
      var el = t.closest('a,button,[role="button"]');
      if (!el) return;
      var id = idOf(el), now = Date.now();
      if (id === last.id && now - last.at < DEBOUNCE_MS) return;
      last = { id: id, at: now };
      send("click", { i: id, l: textOf(el), h: el.tagName === "A" ? hrefOf(el) : "" });
    }

    function onSubmit(e) {
      var f = e.target;
      if (!f || f.tagName !== "FORM") return;
      // the form's own id only; the label is the fixed word "form" so nothing typed or chosen can reach it
      send("submit", { i: idOf(f), l: "form" });
    }

    function leave() {
      if (left) return;
      left = true;
      send("leave", { d: Math.min(1800, Math.round((Date.now() - t0) / 1000)) });
    }

    // capture phase: runs even when a page handler stops propagation
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") leave(); });
    // back/forward cache: the page comes back alive, count it as a new view
    window.addEventListener("pageshow", function (e) { if (e.persisted) { left = false; t0 = Date.now(); send("pv"); } });
    // ponytail: no single-page-app route tracking (the site is static pages); no scroll/hover; 'leave' fires once per page view.

    send("pv");
  } catch (e) { /* never break the page */ }
})();
