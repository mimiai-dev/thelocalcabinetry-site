/* First-party click log for thelocalcabinetry.com. One same-origin file, no cookies, no third party.
 * Sends small GET requests to /_t (the VPS nginx answers 204 and writes /var/log/lco-web/tlc-events.json).
 * Sends: pageview, click on every <a> / <button> / [role=button], form submit, pageleave (ACTIVE seconds on page: tab visible and an input in the last 30 s, sent with navigator.sendBeacon).
 * Each event carries ONLY: page path, element id (data-track or a CSS-path-like id), the element's visible text
 * (40 chars; never from inputs), link host + path (no query, no hash; mailto:/tel: only the scheme), mobile/desktop,
 * a random per-tab session id (sessionStorage, gone when the tab closes), a random page-view id, and the active seconds on page.
 * Outbound link clicks (2026-11-06): a click on a link to another site is the same click event with h = the other site's HOST only (no path, no query), p = this page.
 * Scroll depth (2026-11-06): the leave event also carries d = the deepest point reached on this page view, as 0 / 25 / 50 / 75 / 100 (percent of the page height; a number, nothing else).
 * Engaged time is the leave event's a (active seconds, see above). All three go through /_t with event types and fields the nginx map already accepts (e=click|leave, h, d, a): no server change is needed to LOG them.
 * Never: input values, typed text, form data, cookies, localStorage ids, fingerprinting, click ids (gclid, fbclid), full URLs.
 * Query strings are never logged by the click events. The one exception is the first-touch source below: only the three campaign labels
 * utm_source / utm_medium / utm_campaign (marketing labels, not personal data) are read from the landing URL.
 * First-touch source (T-261019-2): the first page of the tab is kept in sessionStorage (tlc_src, never a cookie or localStorage) as
 * {l landing path, r referrer HOST if not this site, us/um/uc utm labels, ck google|meta|tiktok if the landing URL had a click id (gclid / fbclid / ttclid; the id itself is never read into src;
 * fbclid and ttclid are on EVERY outbound Facebook / Instagram / TikTok link, so they say "social", not "ad"), ia the in-app browser KIND, f time, v m|d}; window.__tlcSrc() returns it plus p = the current path.
 * In-app browser kind (2026-11-01): Facebook / Instagram / TikTok / LinkedIn / Pinterest / Snapchat open links in their own browser and usually send no referrer. appKind() tests the
 * user agent against a short list and keeps ONLY one fixed word (facebook | instagram | tiktok | linkedin | pinterest | snapchat). The user agent string itself and any id in it are never stored or sent.
 * It is attached ONLY when someone sends a form, opens a chat or goes to /design sign-in (see chat.js, the /design stubs). None with DNT/GPC.
 * Form and popup funnel (2026-11-18, owner: "track people interact with the form and popup ... input but not sent ... does they click close how many"; ops
 * spec web-portal/form-interaction-funnel): on the lead forms (the Black Friday popup and the contact band from chat.js, the /contact and product-page form,
 * the membership form) this file notes the popup shown (which display) / closed (how) / "don't show again", a field focused, a field filled, a submit tried,
 * a field refused, the send's outcome (read off the /api/inquiry answer), and on page hide the fields left filled but not sent. For a field it sends ONLY its
 * NAME (name, email, phone, message, project, company, business_type, agree) and, for a typed field, the LENGTH BUCKET of what is in it (1-3, 4-10, 11-30,
 * 31+ characters): never the value, never a character of it. What a person types reaches us only when he sends the form, through /api/inquiry as before.
 * The events go in small JSON batches by navigator.sendBeacon to /design/api/form-event (same origin, Local Ops), every 2 s while a form is used and on hide,
 * with the same per-tab id and page-view id as the click log. chat.js reports the popup's own steps and its own field checks through window.__tlcForm.
 * Sends nothing at all when Do-Not-Track or Global Privacy Control is on.
 * CSP (meta tag, default-src 'self'): this file is script-src 'self'; the beacon is connect-src / img-src 'self'. No change needed. */
(function () {
  "use strict";
  try {
    var nav = navigator;
    if (nav.doNotTrack === "1" || window.doNotTrack === "1" || nav.msDoNotTrack === "1" || nav.globalPrivacyControl === true) return;
    if (!/(^|\.)thelocalcabinetry\.com$/.test(location.hostname)) return; // previews, file://, mirrors: silent

    // ---- first-touch source (T-261019-2), see the header
    // in-app browser kind off the user agent: a fixed word or "". Instagram first (its UA can also carry FB tokens). Nothing but the word leaves this function.
    function appKind(ua) {
      ua = String(ua || "");
      if (/Instagram/i.test(ua)) return "instagram";
      if (/musical_ly|BytedanceWebview|TikTok|trill_/i.test(ua)) return "tiktok";
      if (/FBAN|FBAV|FB_IAB|FBIOS/.test(ua)) return "facebook";
      if (/LinkedInApp/i.test(ua)) return "linkedin";
      if (/Pinterest/i.test(ua)) return "pinterest";
      if (/Snapchat/i.test(ua)) return "snapchat";
      return "";
    }
    var APP = ""; try { APP = appKind(nav.userAgent); } catch (e) {}
    function lab(v) { return String(v == null ? "" : v).toLowerCase().replace(/[^a-z0-9._+ -]/g, "").trim().slice(0, 60); }
    try {
      if (!sessionStorage.getItem("tlc_src")) {
        var o = { l: location.pathname.slice(0, 120), v: window.innerWidth < 768 ? "m" : "d", f: new Date().toISOString() };
        var rh = ""; try { rh = new URL(document.referrer).hostname; } catch (e) {}
        if (rh && !/(^|\.)thelocalcabinetry\.com$/.test(rh)) o.r = rh.slice(0, 80);
        var sp = new URLSearchParams(location.search);
        [["us", "utm_source"], ["um", "utm_medium"], ["uc", "utm_campaign"]].forEach(function (k) { var v = lab(sp.get(k[1])); if (v) o[k[0]] = v; });
        // click-id KIND only (never the click id itself): google (gclid), meta (fbclid) or tiktok (ttclid). fbclid / ttclid are on every outbound link of those apps: social, not proof of an ad
        if (sp.has("gclid")) o.ck = "google"; else if (sp.has("fbclid")) o.ck = "meta"; else if (sp.has("ttclid")) o.ck = "tiktok";
        if (APP) o.ia = APP;
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
    var sent = 0, seq = 0, last = { id: "", at: 0 };

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
        if (!/(^|\.)thelocalcabinetry\.com$/.test(u.hostname)) return u.host.slice(0, 120); // outbound: the other site's host only, never its path
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

    // ---- time on page: ACTIVE seconds (tab visible AND an input within the last 30 s), what the Ops /traffic page reads.
    // Each page view has a random id w (6 chars, sent with pv and every leave); a leave carries a = the active seconds since the last
    // leave of the same w, the server sums them per w and caps a view at 30 minutes. Wall-clock time is never sent.
    var IDLE_MS = 30000, CAP_S = 1800;
    var w = "", activeMs = 0, sentS = 0, leaves = 0, maxD = 0, sentD = -1;
    var vis = document.visibilityState !== "hidden";
    var mark = Date.now(), lastIn = mark;
    function newView() {
      w = "";
      try { var b = new Uint8Array(6); crypto.getRandomValues(b); for (var j = 0; j < 6; j++) w += (b[j] % 36).toString(36); }
      catch (e) { w = Math.random().toString(36).slice(2, 8).padEnd(6, "0"); }
      activeMs = 0; sentS = 0; leaves = 0; maxD = 0; sentD = -1; mark = lastIn = Date.now(); vis = document.visibilityState !== "hidden";
    }
    function account(now) { // credit [mark, now] up to 30 s after the last input, only while visible
      if (vis) { var to = Math.min(now, lastIn + IDLE_MS); if (to > mark) activeMs += to - mark; }
      mark = now;
    }
    function touch() { var n = Date.now(); account(n); lastIn = n; }
    // scroll depth: how far down the page this view got, in 25% steps (0, 25, 50, 75, 100). A page that fits the screen counts as 100.
    function depth() {
      try {
        var de = document.documentElement, h = Math.max(de.scrollHeight, document.body ? document.body.scrollHeight : 0, 1);
        var pct = (window.pageYOffset + (window.innerHeight || de.clientHeight)) / h * 100;
        var d = pct >= 98 ? 100 : pct >= 75 ? 75 : pct >= 50 ? 50 : pct >= 25 ? 25 : 0;
        if (d > maxD) maxD = d;
      } catch (e) {}
    }
    function leave() {
      account(Date.now()); depth();
      var total = Math.min(CAP_S, Math.floor(activeMs / 1000)), delta = total - sentS;
      if (delta <= 0 && leaves > 0 && maxD <= sentD) return; // nothing new; one leave (even 0 s) per view so a bounce is measured
      if (delta < 0) delta = 0;
      sentS += delta; leaves++; seq++; sentD = maxD;
      var url = ENDPOINT + "?e=leave&p=" + enc(location.pathname.slice(0, 120)) + "&v=" + (window.innerWidth < 768 ? "m" : "d") +
        "&s=" + sid + "&n=" + seq + "&w=" + w + "&a=" + delta + "&d=" + maxD;
      try {
        if (nav.sendBeacon && nav.sendBeacon(url)) return;
        if (window.fetch) fetch(url, { method: "GET", keepalive: true, credentials: "omit", cache: "no-store" }).catch(function () {});
        else new Image().src = url;
      } catch (e) {}
    }
    function pv() { fNewView(); newView(); depth(); send("pv", { w: w, ia: APP }); }   // ia: the in-app browser kind (a fixed word) so the VPS can name the source of a visit with no referrer

    // capture phase: runs even when a page handler stops propagation
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("scroll", depth, { passive: true });
    ["pointerdown", "keydown", "scroll", "touchstart", "mousemove", "wheel"].forEach(function (t) {
      document.addEventListener(t, touch, { capture: true, passive: true });
    });
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") { leave(); vis = false; }
      else { vis = true; mark = lastIn = Date.now(); } // coming back counts as activity; the hidden stretch is not credited
    });
    // back/forward cache: the page comes back alive, count it as a new view
    window.addEventListener("pageshow", function (e) { if (e.persisted) pv(); });
    // ponytail: no single-page-app route tracking (the site is static pages); input events only feed the 30 s idle window; 'leave' is sent when the tab is hidden / the page is left, with the new active seconds only.

    // ---- form and popup funnel (2026-11-18, see the header). One "instance" per form per page view; its state lives in memory only (the popup's form leaves the
    // DOM when it closes, so the field elements are kept here to read their LENGTH at page hide). Nothing typed is ever read except .length of the trimmed value.
    var FORM_EP = "/design/api/form-event";
    var LEAD_FORMS = 'form[data-lead],form[data-member],form[action="/api/inquiry"]';
    var FIELD_OK = { name: 1, email: 1, phone: 1, message: 1, project: 1, company: 1, business_type: 1, agree: 1 };
    var F_MAX = 300, F_BATCH = 20, F_WAIT = 2000;   // events per page view; per beacon; the batch timer
    var fq = [], fTimer = 0, fCount = 0, insts = [], lastTry = null;
    function formKind(f) {
      var dt = f.getAttribute("data-track") || "";
      if (dt === "bfpop-form") return "bf_popup";
      if (dt === "band-form") return "band";
      if (f.hasAttribute("data-member")) return "member";
      if (f.hasAttribute("data-lead")) return "contact";
      return "other";
    }
    function leadForm(el) { var f = el && (el.tagName === "FORM" ? el : el.form); return f && f.matches && f.matches(LEAD_FORMS) ? f : null; }
    function inst(f) {
      if (!f.__tlcF) { f.__tlcF = { el: f, fm: formKind(f), focused: {}, filled: {}, els: {}, order: [], ok: false, left: false, tryAt: 0 }; insts.push(f.__tlcF); }
      return f.__tlcF;
    }
    // how much is in a field, as a number: a ticked box is 1, an empty one 0; the value itself goes nowhere
    function sizeOf(el) { return el.type === "checkbox" ? (el.checked ? 1 : 0) : String(el.value == null ? "" : el.value).trim().length; }
    function bucket(n) { return n <= 3 ? "1-3" : n <= 10 ? "4-10" : n <= 30 ? "11-30" : "31+"; }
    function fpush(e) {
      if (fCount >= F_MAX) return;
      fCount++; fq.push(e);
      if (fq.length >= F_BATCH) fflush(); else if (!fTimer) fTimer = setTimeout(fflush, F_WAIT);
    }
    function fev(s, k, x) { var e = { k: k, fm: s.fm }; if (x) for (var q in x) if (x[q] !== "" && x[q] != null) e[q] = x[q]; fpush(e); }
    function fflush() {
      if (fTimer) { clearTimeout(fTimer); fTimer = 0; }
      while (fq.length) {
        var body = JSON.stringify({ s: sid, w: w, p: location.pathname.slice(0, 120), v: window.innerWidth < 768 ? "m" : "d", ev: fq.splice(0, F_BATCH) });
        try { if (nav.sendBeacon && nav.sendBeacon(FORM_EP, body)) continue; } catch (e) {}
        try { if (realFetch) realFetch.call(window, FORM_EP, { method: "POST", body: body, keepalive: true, credentials: "omit", headers: { "content-type": "text/plain" } }).catch(function () {}); } catch (e) {}
      }
    }
    // a field committed (change: blur after typing, a pick, autofill): its name and length bucket, again only when the bucket moved
    function fill(s, el) {
      var n = sizeOf(el); if (!n) return;
      var b = el.tagName === "SELECT" || el.type === "checkbox" ? "y" : bucket(n);
      if (s.filled[el.name] === b) return;
      s.filled[el.name] = b; fev(s, "fill", { f: el.name, b: b === "y" ? "" : b });
    }
    function fillAll(s) { var els = s.el.elements || []; for (var i = 0; i < els.length; i++) if (FIELD_OK[els[i].name]) { s.els[els[i].name] = els[i]; fill(s, els[i]); } }
    function tried(s) { var t = Date.now(); if (t - s.tryAt < 300) return; s.tryAt = t; fillAll(s); fev(s, "submit_try"); lastTry = s; }
    document.addEventListener("focusin", function (e) {
      var el = e.target, f = leadForm(el); if (!f || !FIELD_OK[el.name]) return;
      var s = inst(f); s.els[el.name] = el;
      if (!s.focused[el.name]) { s.focused[el.name] = 1; fev(s, "focus", { f: el.name }); }
    }, true);
    function onEdit(e) {
      var el = e.target, f = leadForm(el); if (!f || !FIELD_OK[el.name]) return;
      var s = inst(f); s.els[el.name] = el;
      var i = s.order.indexOf(el.name); if (i >= 0) s.order.splice(i, 1);
      if (sizeOf(el)) s.order.push(el.name);   // the order fields were last edited in: the last one is where a person stopped
      if (e.type === "change") fill(s, el);
    }
    document.addEventListener("input", onEdit, true);
    document.addEventListener("change", onEdit, true);
    document.addEventListener("submit", function (e) { var f = leadForm(e.target); if (f) tried(inst(f)); }, true);
    // the browser's own check (the Astro forms): a refused field fires 'invalid' and the form is not submitted, so this is the try
    document.addEventListener("invalid", function (e) {
      var el = e.target, f = leadForm(el); if (!f) return;
      var s = inst(f); tried(s);
      if (FIELD_OK[el.name]) fev(s, "invalid", { f: el.name });
    }, true);
    // the send's outcome, read off the /api/inquiry answer of the form tried last ({ ok: true } = sent); the request and its body are not touched
    var realFetch = typeof window.fetch === "function" ? window.fetch : null;
    if (realFetch) window.fetch = function (u, o) {
      var p = realFetch.apply(window, arguments);
      try {
        var url = typeof u === "string" ? u : (u && u.url) || "", s = lastTry;
        if (s && /\/api\/inquiry(?:[?#]|$)/.test(url)) {
          lastTry = null;
          p.then(function (r) {
            if (!r.ok) { fev(s, "submit_fail", { h: r.status === 429 ? "rate" : r.status >= 500 ? "5xx" : "4xx" }); return; }
            return r.clone().json().then(function (j) {
              if (j && j.ok === true) { s.ok = true; fev(s, "submit_ok"); fflush(); } else fev(s, "submit_fail", { h: "rejected" });
            }, function () { fev(s, "submit_fail", { h: "rejected" }); });
          }, function () { fev(s, "submit_fail", { h: "net" }); });
        }
      } catch (e) {}
      return p;
    };
    // page hide: every form with something in it and no send is "left": the fields that hold something (names only) and the last one edited
    function abandonAll() {
      for (var i = 0; i < insts.length; i++) {
        var s = insts[i]; if (s.ok || s.left) continue;
        var fs = []; for (var k in s.els) if (sizeOf(s.els[k])) { fs.push(k); fill(s, s.els[k]); }
        if (!fs.length) continue;
        var last = fs[fs.length - 1]; for (var j = s.order.length - 1; j >= 0; j--) if (fs.indexOf(s.order[j]) >= 0) { last = s.order[j]; break; }
        s.left = true; fev(s, "abandon", { f: last, fs: fs });
      }
    }
    function fNewView() { fflush(); for (var i = 0; i < insts.length; i++) delete insts[i].el.__tlcF; insts = []; lastTry = null; fCount = 0; }
    window.addEventListener("pagehide", function () { abandonAll(); fflush(); });
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") fflush(); });
    // chat.js: the popup's steps (it draws the popup) and its own field checks (its forms skip the browser's): window.__tlcForm(kind, { n | h | form, f })
    window.__tlcForm = function (k, o) {
      try {
        o = o || {};
        if (k === "popup_shown") fpush({ k: k, fm: "bf_popup", n: Math.max(1, Math.min(999, parseInt(o.n, 10) || 1)) });
        else if (k === "popup_closed") fpush(/^(x|backdrop|esc|done)$/.test(o.h) ? { k: k, fm: "bf_popup", h: o.h } : { k: k, fm: "bf_popup" });
        else if (k === "popup_never") fpush({ k: k, fm: "bf_popup" });   // the "Don't show again today" button (since 2026-11-18; the wire name is the ops book's kind)
        else if (k === "invalid" && o.form && leadForm(o.form) && FIELD_OK[o.f]) fev(inst(o.form), "invalid", { f: o.f });
      } catch (e) {}
    };

    pv();
  } catch (e) { /* never break the page */ }
})();
