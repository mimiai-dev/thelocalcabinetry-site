// Form and popup funnel (owner 2026-11-18): runs the real t.js in a fake browser and checks what it sends to /design/api/form-event
// (node scripts/test-form-funnel.mjs). Contract with Local Ops (local-cabinets-ops web-portal/form-interaction-funnel, form-events.ts): a JSON batch
// {s, w, p, v, ev: [{k, fm, f?, b?, n?, h?, fs?}]} by navigator.sendBeacon. A field is sent by NAME and LENGTH BUCKET only: never its value.
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
const src = fs.readFileSync(new URL("../t.js", import.meta.url), "utf8");
const EP = "/design/api/form-event";

// a form element as the selectors in t.js see it: form[data-lead], form[data-member], form[action="/api/inquiry"], data-track
function makeForm(attrs, fields) {
  const form = {
    tagName: "FORM", elements: [],
    getAttribute: (k) => (k in attrs ? attrs[k] : null), hasAttribute: (k) => k in attrs,
    matches: (sel) => sel.split(",").some((one) => { const m = /^form\[([\w-]+)(?:="([^"]*)")?\]$/.exec(one.trim()); return !!m && m[1] in attrs && (m[2] === undefined || attrs[m[1]] === m[2]); }),
  };
  for (const [name, type = "text"] of fields) form.elements.push({ tagName: type === "select" ? "SELECT" : type === "textarea" ? "TEXTAREA" : "INPUT", type, name, value: "", checked: false, form });
  form.f = Object.fromEntries(form.elements.map((e) => [e.name, e]));
  return form;
}

function run({ dnt = false } = {}) {
  let now = 1_000_000;
  const beacons = [], L = {}, store = {}, timers = [];
  const doc = { visibilityState: "visible", body: {}, addEventListener(t, f) { (L[t] ||= []).push(f); }, querySelector() { return null; } };
  const win = { innerWidth: 1200, addEventListener(t, f) { (L["w:" + t] ||= []).push(f); } };
  const fire = (t, ev = {}) => (L[t] || []).forEach((f) => f(ev));
  const nav = { doNotTrack: dnt ? "1" : null, sendBeacon(u, body) { beacons.push({ u, body }); return true; } };
  class D extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const ctx = { navigator: nav, document: doc, location: { hostname: "thelocalcabinetry.com", pathname: "/kitchens/", search: "", href: "https://thelocalcabinetry.com/kitchens/" },
    sessionStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } }, crypto: { getRandomValues: (a) => a.fill(7) },
    Date: D, URL, URLSearchParams, Image: class { set src(u) {} }, encodeURIComponent, Math, JSON, Number,
    setTimeout: (f) => { timers.push(f); return timers.length; }, clearTimeout: (i) => { timers[i - 1] = null; } };
  const answers = [];   // what the fake /api/inquiry answers next: { status, body } | "net"
  const fetched = [];
  ctx.fetch = (u) => { fetched.push(String(u)); return Promise.resolve({ ok: true, status: 204 }); };
  win.fetch = (u, o) => {
    fetched.push(String(u));
    const a = answers.shift() ?? { status: 200, body: { ok: true } };
    if (a === "net") return Promise.reject(new TypeError("Failed to fetch"));
    const res = { ok: a.status >= 200 && a.status < 300, status: a.status, clone: () => ({ json: () => Promise.resolve(a.body) }) };
    return Promise.resolve(res);
  };
  const realWinFetch = win.fetch;
  ctx.window = Object.assign(win, { navigator: nav, document: doc, location: ctx.location, sessionStorage: ctx.sessionStorage });
  vm.runInNewContext(src, ctx);
  const batches = () => beacons.filter((b) => b.u === EP).map((b) => ({ raw: b.body, ...JSON.parse(b.body) }));
  const events = () => batches().flatMap((b) => b.ev);
  const on = (t, target) => fire(t, { target, type: t });
  const type = (el, value) => { on("focusin", el); el.value = value; on("input", el); on("change", el); };
  const runTimers = () => { const t = timers.splice(0); t.forEach((f) => f && f()); };
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return { win, doc, fire, on, type, batches, events, answers, fetched, runTimers, settle, tick: (ms) => { now += ms; }, wrapped: win.fetch !== realWinFetch };
}
const band = () => makeForm({ action: "/api/inquiry", "data-track": "band-form" }, [["name"], ["email", "email"], ["phone", "tel"], ["project", "select"], ["message", "textarea"], ["agree", "checkbox"]]);
const contact = () => makeForm({ "data-lead": "" }, [["name"], ["email", "email"], ["phone", "tel"], ["message", "textarea"]]);

// 1. the popup's steps from chat.js go out in one batch on hide, with the tab id, page-view id, path and device
{
  const t = run();
  t.win.__tlcForm("popup_shown", { n: 2 });
  t.win.__tlcForm("popup_closed", { h: "esc" });
  t.win.__tlcForm("popup_closed", { h: "<b>" });   // an unknown way is sent without one
  t.win.__tlcForm("popup_never");
  assert.equal(t.batches().length, 0, "batched, not one request per event");
  t.fire("w:pagehide");
  const [b] = t.batches();
  assert.match(b.s, /^[a-z0-9]{10}$/); assert.match(b.w, /^[a-z0-9]{6}$/); assert.equal(b.p, "/kitchens/"); assert.equal(b.v, "d");
  assert.deepEqual(b.ev, [{ k: "popup_shown", fm: "bf_popup", n: 2 }, { k: "popup_closed", fm: "bf_popup", h: "esc" }, { k: "popup_closed", fm: "bf_popup" }, { k: "popup_never", fm: "bf_popup" }]);
}
// 2. a form filled and left: names and length buckets only, then on hide the abandon with the fields left filled and the last one edited. Never a value.
{
  const t = run(), f = band();
  t.type(f.f.name, "Jane Doe");
  t.type(f.f.email, "jane.doe@example.com");
  t.type(f.f.message, "My kitchen is 10 by 12, white shaker, call me after five on weekdays please");
  f.f.message.value = ""; t.on("input", f.f.message);   // cleared again: not in the abandon list
  f.f.project.value = "Kitchen"; t.on("change", f.f.project);
  t.on("focusin", f.f.name);   // a second focus of the same field is not sent again
  t.fire("w:pagehide");
  const ev = t.events();
  assert.deepEqual(ev, [
    { k: "focus", fm: "band", f: "name" }, { k: "fill", fm: "band", f: "name", b: "4-10" },
    { k: "focus", fm: "band", f: "email" }, { k: "fill", fm: "band", f: "email", b: "11-30" },
    { k: "focus", fm: "band", f: "message" }, { k: "fill", fm: "band", f: "message", b: "31+" },
    { k: "fill", fm: "band", f: "project" },
    { k: "abandon", fm: "band", f: "project", fs: ["name", "email", "project"] }]);
  const all = t.batches().map((b) => b.raw).join("");
  for (const bad of ["Jane", "jane", "example", "weekdays", "shaker", "Kitchen"]) assert.ok(!all.includes(bad), `"${bad}" left the page`);
}
// 3. the browser's own check refuses a field (the Astro form): one try + the refused field; then a good send: tried, sent, and no abandon on hide
{
  const t = run(), f = contact();
  t.type(f.f.name, "Ravi");
  t.on("invalid", f.f.email); t.on("invalid", f.f.phone);
  t.tick(5_000);
  t.type(f.f.email, "ravi@example.org");
  t.on("submit", f);
  t.win.fetch("/api/inquiry", { method: "POST", body: {} });
  await t.settle(); await t.settle();
  t.fire("w:pagehide");
  assert.deepEqual(t.events().map((e) => [e.k, e.f ?? null]), [["focus", "name"], ["fill", "name"], ["submit_try", null], ["invalid", "email"], ["invalid", "phone"],
    ["focus", "email"], ["fill", "email"], ["submit_try", null], ["submit_ok", null]]);
  assert.ok(t.events().every((e) => e.fm === "contact"));
}
// 4. a failed send says why (server error, refused, too many, rejected answer, no connection); chat.js reports its own refused fields
{
  const t = run(), f = band();
  t.type(f.f.name, "Al");
  for (const a of [{ status: 503, body: {} }, { status: 400, body: {} }, { status: 429, body: {} }, { status: 200, body: { ok: false, error: "bad email" } }, "net"]) {
    t.answers.push(a); t.tick(1_000); t.on("submit", f); t.win.fetch("/api/inquiry", { method: "POST" }); await t.settle(); await t.settle();
  }
  t.win.__tlcForm("invalid", { form: f, f: "agree" });
  t.win.__tlcForm("invalid", { form: f, f: "website" });   // not a field we name: dropped
  t.fire("w:pagehide");
  assert.deepEqual(t.events().filter((e) => e.k === "submit_fail").map((e) => e.h), ["5xx", "4xx", "rate", "rejected", "net"]);
  assert.deepEqual(t.events().filter((e) => e.k === "invalid").map((e) => e.f), ["agree"]);
  assert.equal(t.events().filter((e) => e.k === "abandon").length, 1, "never sent: left on hide");
}
// 5. other forms are not watched, other fetches are untouched; 30 events are one beacon at once, fewer wait for the 2 s timer
{
  const t = run();
  const search = makeForm({ action: "/search" }, [["name"]]);
  t.type(search.f.name, "x");
  t.win.fetch("/design/api/visit/message", { method: "POST" }); await t.settle();
  t.runTimers();
  assert.equal(t.events().length, 0);
  for (let i = 0; i < 31; i++) t.win.__tlcForm("popup_shown", { n: 1 });
  assert.equal(t.batches().length, 1); assert.equal(t.batches()[0].ev.length, 30);
  t.runTimers();
  assert.equal(t.batches().length, 2); assert.equal(t.batches()[1].ev.length, 1);
}
// 6. Do-Not-Track: no hook for chat.js, no beacon, fetch not wrapped
{
  const t = run({ dnt: true });
  assert.equal(t.win.__tlcForm, undefined);
  assert.equal(t.wrapped, false);
  t.fire("w:pagehide");
  assert.equal(t.batches().length, 0);
}
console.log("ok  form funnel: popup steps, names and length buckets only, abandon on hide, send outcome, batching, Do-Not-Track");
