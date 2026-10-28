// Time on page: runs the real t.js in a fake browser and checks what it sends (node scripts/test-time-on-page.mjs).
// Contract with the VPS (local-cabinets-ops scripts/vps/traffic-core.mjs): pv carries w (6 chars); every leave carries the same w and
// a = ACTIVE seconds since the previous leave; the server sums them per w. Wall-clock time must never be sent.
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
const src = fs.readFileSync(new URL("../t.js", import.meta.url), "utf8");

function run() {
  let now = 1_000_000;
  const sent = [], L = {}, store = {};
  const doc = { visibilityState: "visible", body: {}, addEventListener(t, f) { (L[t] ||= []).push(f); }, querySelector() { return null; } };
  const win = { innerWidth: 1200, addEventListener(t, f) { (L["w:" + t] ||= []).push(f); } };
  const fire = (t, ev = {}) => (L[t] || []).forEach((f) => f(ev));
  const nav = { doNotTrack: null, sendBeacon(u) { sent.push({ via: "beacon", u }); return true; } };
  class D extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const ctx = { navigator: nav, document: doc, location: { hostname: "thelocalcabinetry.com", pathname: "/kitchens/", search: "", href: "https://thelocalcabinetry.com/kitchens/" },
    sessionStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } }, crypto: { getRandomValues: (a) => a.fill(7) },
    Date: D, URL, URLSearchParams, Image: class { set src(u) { sent.push({ via: "img", u }); } }, encodeURIComponent, Math, JSON, Number };
  ctx.fetch = win.fetch = (u) => { sent.push({ via: "fetch", u }); return Promise.resolve(); };
  ctx.window = Object.assign(win, { navigator: nav, document: doc, location: ctx.location, sessionStorage: ctx.sessionStorage });
  vm.runInNewContext(src, ctx);
  return { sent, fire, doc, tick: (ms) => { now += ms; }, q: (u) => Object.fromEntries(new URLSearchParams(u.split("?")[1])) };
}

// 1. pv carries w; leave on hide carries the same w and the active seconds (visible, input within 30 s)
{
  const t = run();
  const pv = t.q(t.sent[0].u);
  assert.equal(pv.e, "pv"); assert.match(pv.w, /^[a-z0-9]{6}$/);
  t.tick(10_000); t.fire("pointerdown");   // 10 s, then input
  t.tick(20_000);                          // 20 s more, still inside 30 s of the input
  t.doc.visibilityState = "hidden"; t.fire("visibilitychange");
  const lv = t.q(t.sent.at(-1).u);
  assert.equal(t.sent.at(-1).via, "beacon");
  assert.equal(lv.e, "leave"); assert.equal(lv.w, pv.w); assert.equal(lv.a, "30"); assert.equal(lv.d, undefined);
  const n = t.sent.length; t.fire("w:pagehide"); assert.equal(t.sent.length, n); // pagehide right after hide sends nothing new
}
// 2. idle: a tab left open with no input counts only 30 s; a hidden stretch counts 0; returning sends only the new seconds
{
  const t = run();
  t.tick(600_000);
  t.doc.visibilityState = "hidden"; t.fire("visibilitychange");
  assert.equal(t.q(t.sent.at(-1).u).a, "30");
  t.tick(3_600_000);
  t.doc.visibilityState = "visible"; t.fire("visibilitychange");
  t.tick(5_000); t.doc.visibilityState = "hidden"; t.fire("visibilitychange");
  assert.equal(t.q(t.sent.at(-1).u).a, "5");
}
// 3. a bounce still sends one leave of 0 s; a long active visit is capped at 30 minutes
{
  const t = run(); t.fire("w:pagehide");
  assert.equal(t.q(t.sent.at(-1).u).a, "0");
  const u = run();
  for (let i = 0; i < 120; i++) { u.tick(25_000); u.fire("keydown"); }
  u.fire("w:pagehide");
  const total = Number(u.q(u.sent.at(-1).u).a);
  assert.equal(total, 1800);
}
// 4. bfcache restore is a new page view: new pv with a fresh w, then its own leave
{
  const t = run(); t.fire("w:pagehide");
  t.fire("w:pageshow", { persisted: true });
  const pv2 = t.q(t.sent.at(-1).u); assert.equal(pv2.e, "pv"); assert.match(pv2.w, /^[a-z0-9]{6}$/);
  t.tick(4_000); t.fire("w:pagehide");
  const l2 = t.q(t.sent.at(-1).u); assert.equal(l2.w, pv2.w); assert.equal(l2.a, "4");
}
// 5. Do-Not-Track: nothing at all
{
  let sent = 0; const ctx = { navigator: { doNotTrack: "1", sendBeacon() { sent++; } }, window: {}, document: {}, location: { hostname: "thelocalcabinetry.com" } };
  vm.runInNewContext(src, ctx); assert.equal(sent, 0);
}
console.log("time-on-page: ok");
