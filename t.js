/* First-party click log for thelocalcabinetry.com. One same-origin file, no third party.
 * Sends small requests to /_t (the VPS nginx answers 204 and writes /var/log/lco-web/tlc-events.json). The Ops page /traffic reads it.
 * Sends: pageview (with the referring site's host), click on every <a> / <button> / [role=button], form submit, pageleave (ACTIVE seconds:
 * tab visible and input in the last 30 s; sent with navigator.sendBeacon), and the chat bubble's steps (chat.js tells this file with a DOM event).
 * Each event carries ONLY: page path, element id (data-track or a CSS-path-like id), the element's visible text (40 chars; never from inputs),
 * link host + path (no query, no hash; mailto:/tel: only the scheme), mobile/desktop, a random per-tab session id (sessionStorage, gone when
 * the tab closes), a random page-view id, the seconds on page, and tlc_v.
 * COOKIE: one first-party cookie, tlc_v (random, 365 days, SameSite=Lax), used only to count returning visitors. Nothing else is stored.
 * Never: input values, typed text (the one exception: the first 80 characters of a chat message the server REFUSED, kept 14 days by our own
 * server so it can be recovered; a draft that was not sent sends only its character count), form data, query strings, fingerprinting.
 * Sends nothing at all (and sets no cookie) when Do-Not-Track or Global Privacy Control is on.
 * CSP (meta tag, default-src 'self'): this file is script-src 'self'; the beacon is connect-src / img-src 'self'. No change needed. */
(function () {
  "use strict";
  try {
    var nav = navigator;
    if (nav.doNotTrack === "1" || window.doNotTrack === "1" || nav.msDoNotTrack === "1" || nav.globalPrivacyControl === true) return;
    if (!/(^|\.)thelocalcabinetry\.com$/.test(location.hostname)) return; // previews, file://, mirrors: silent

    var ENDPOINT = "/_t";
    var MAX_CHAT = 100; // chat steps per page load, on top of MAX_EVENTS
    var MAX_EVENTS = 200; // per page load; pageleave is always allowed on top
    var DEBOUNCE_MS = 400; // the same element twice within this is one click
    var sent = 0, chatSent = 0, seq = 0, left = false, last = { id: "", at: 0 };
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

    // returning-visitor id: ONE first-party cookie, tlc_v (365 days, SameSite=Lax, Secure): 20 random characters, nothing about the person.
    // It is used only to count returning visitors (retention) in our own Ops page. Not set when Do-Not-Track / Global Privacy Control is on
    // (this whole script returns above) and never sent anywhere but /_t on this site.
    var vid = "";
    try {
      var cm = /(?:^|; )tlc_v=([a-z0-9]{16,24})/.exec(document.cookie);
      vid = cm ? cm[1] : "";
      if (!vid) {
        var va = new Uint8Array(20); crypto.getRandomValues(va);
        for (var vi = 0; vi < 20; vi++) vid += (va[vi] % 36).toString(36);
        document.cookie = "tlc_v=" + vid + "; Max-Age=31536000; Path=/; SameSite=Lax; Secure";
      }
    } catch (e) { vid = ""; }

    // page view id: 6 random characters, joins the page-leave (active seconds) to its page view
    function newW() { var a = new Uint8Array(6), s = ""; try { crypto.getRandomValues(a); } catch (e) { return Math.random().toString(36).slice(2, 8).padEnd(6, "0"); } for (var i = 0; i < 6; i++) s += (a[i] % 36).toString(36); return s; }
    var wid = newW();

    // ACTIVE seconds: counted once a second while the tab is visible and there was input (pointer, key, scroll, touch) in the last 30 s
    var active = 0, lastInput = Date.now(), reported = 0;
    function touchInput() { lastInput = Date.now(); }
    ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"].forEach(function (n) { window.addEventListener(n, touchInput, { passive: true, capture: true }); });
    setInterval(function () { if (document.visibilityState === "visible" && Date.now() - lastInput < 30000 && active < 1800) active++; }, 1000);

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

    function send(ev, extra, beacon) {
      if (ev === "chat" ? chatSent >= MAX_CHAT : (ev !== "leave" && sent >= MAX_EVENTS)) return;
      if (ev === "chat") chatSent++; else sent++;
      seq++;
      var q = "e=" + ev + "&p=" + enc(location.pathname.slice(0, 120)) +
        "&v=" + (window.innerWidth < 768 ? "m" : "d") + "&s=" + sid + "&n=" + seq;
      if (vid) q += "&u=" + vid;
      if (ev === "pv" || ev === "leave") q += "&w=" + wid;
      if (extra) for (var k in extra) if (extra[k] !== "" && extra[k] != null) q += "&" + k + "=" + enc(extra[k]);
      var url = ENDPOINT + "?" + q;
      try {
        // the page-leave goes as a beacon (a POST with no body) so the browser sends it while the page closes
        if (beacon && navigator.sendBeacon && navigator.sendBeacon(url)) return;
        if (window.fetch) fetch(url, { method: "GET", keepalive: true, credentials: "omit", cache: "no-store" }).catch(function () {});
        else new Image().src = url;
      } catch (e) {}
    }

    // the host of the page we came from, when it is another site (host only, never a path or a query)
    function refHost() {
      try {
        if (!document.referrer) return "";
        var h = new URL(document.referrer).hostname.toLowerCase();
        return h && h !== location.hostname.toLowerCase() && /^[a-z0-9.-]{1,80}$/.test(h) ? h : "";
      } catch (e) { return ""; }
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

    // the active seconds since the last report (a tab hidden and shown again reports twice; the report adds them up per page view id)
    function leave() {
      var delta = active - reported;
      if (left && delta <= 0) return;
      left = true; reported = active;
      send("leave", { a: delta, d: Math.min(1800, Math.round((Date.now() - t0) / 1000)) }, true);
    }

    // the chat bubble (chat.js) tells this file what step the visitor reached, through a DOM event: nothing is sent when this script is off (DNT / GPC)
    var CHAT = { bubble_open: 1, first_key: 1, draft_left: 1, send_click: 1, send_ok: 1, send_fail: 1, email_shown: 1, email_sent: 1, photo_added: 1 };
    document.addEventListener("tlc:chat", function (e) {
      var d = (e && e.detail) || {};
      if (!CHAT[d.k]) return;
      touchInput();
      var x = {
        k: d.k,
        x: typeof d.x === "number" && d.x >= 0 ? Math.min(9999, Math.round(d.x)) : "",
        m: typeof d.m === "number" && d.m > 0 && d.m < 1e7 ? Math.round(d.m) : "",
        c: d.k === "send_fail" && /^(4xx|5xx|net|rate)$/.test(d.c) ? d.c : ""
      };
      // the typed text goes ONLY with a failed send, 80 characters, so a message the server did not take can be recovered; never for a draft that was not sent
      if (d.k === "send_fail" && typeof d.tx === "string") x.tx = Array.from(d.tx).slice(0, 80).join("");
      send("chat", x);
    });

    // capture phase: runs even when a page handler stops propagation
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") leave(); });
    // back/forward cache: the page comes back alive, count it as a new view
    window.addEventListener("pageshow", function (e) { if (e.persisted) { left = false; t0 = Date.now(); active = 0; reported = 0; wid = newW(); send("pv", { r: refHost() }); } });
    // ponytail: no single-page-app route tracking (the site is static pages); no scroll/hover; 'leave' fires once per page view.

    send("pv", { r: refHost() });
  } catch (e) { /* never break the page */ }
})();
