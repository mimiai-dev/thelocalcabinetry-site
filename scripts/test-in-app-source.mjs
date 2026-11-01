// Social source: runs the real t.js in a fake browser with real user agents and checks what it sends and keeps (node scripts/test-in-app-source.mjs).
// Contract with local-cabinets-ops (nginx/tlc-events.conf `ia`, lib/lead-source.ts cleanSrc): the pv carries ia = a fixed word or nothing; src has ck google|meta|tiktok and ia;
// the user agent string and the click id never leave the page.
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
const src = fs.readFileSync(new URL("../t.js", import.meta.url), "utf8");

const UA = {
  fbIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 [FBAN/FBIOS;FBAV/470.0.0.37.108;FBBV/600000000;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]",
  fbAndroid: "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/470.0.0.50.109;]",
  insta: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 Instagram 340.0.2.14.88 (iPhone14,5; iOS 17_5; en_US; en; scale=3.00; 1170x2532; 612345678)",
  instaAndroid: "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A.240505.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36 Instagram 340.0.0.30.99 Android (34/14; 420dpi; 1080x2400; Google/google; Pixel 8; shiba; shiba; en_US; 612345678)",
  tiktok: "Mozilla/5.0 (Linux; Android 13; SM-A546B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.179 Mobile Safari/537.36 musical_ly_2023405030 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly app_version/34.5.3 ByteLocale/en ByteFullLocale/en Region/US BytedanceWebview/d8a21c6",
  tiktokIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_34.5.0 BytedanceWebview/d8a21c6 Channel/App Store",
  linkedin: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 LinkedInApp/9.30.1234",
  pinterest: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [Pinterest/iOS]",
  snapchat: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Snapchat/12.80.0.40 (like Safari/8618.2.12.0.3, iPhone14,5; iOS 17.5; gzip)",
  safari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  chromeAndroid: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
};

function run(ua, search = "", extra = {}) {
  const sent = [], store = {}, L = {};
  const doc = { visibilityState: "visible", body: {}, referrer: extra.referrer || "", addEventListener(t, f) { (L[t] ||= []).push(f); }, querySelector() { return null; } };
  const win = { innerWidth: 390, addEventListener() {} };
  const nav = { userAgent: ua, doNotTrack: extra.dnt ?? null, sendBeacon() { return true; } };
  const loc = { hostname: "thelocalcabinetry.com", pathname: "/", search, href: "https://thelocalcabinetry.com/" + search };
  const ctx = { navigator: nav, document: doc, location: loc, sessionStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    crypto: { getRandomValues: (a) => a.fill(7) }, Date, URL, URLSearchParams, Image: class {}, encodeURIComponent, Math, JSON, Number,
    fetch: (u) => { sent.push(u); return Promise.resolve(); } };
  win.fetch = ctx.fetch;
  ctx.window = Object.assign(win, { navigator: nav, document: doc, location: loc, sessionStorage: ctx.sessionStorage });
  vm.runInNewContext(src, ctx);
  const q = sent.length ? Object.fromEntries(new URLSearchParams(sent[0].split("?")[1])) : null;
  return { pv: q, sentRaw: sent, src: ctx.window.__tlcSrc && ctx.window.__tlcSrc() };
}

const FB = "?fbclid=IwY2xjawNabc123EXTbnRjbQIxMAABHm1";
const cases = [
  ["Facebook iOS", UA.fbIos, "", "facebook"], ["Facebook Android", UA.fbAndroid, "", "facebook"],
  ["Instagram iOS", UA.insta, FB, "instagram"], ["Instagram Android", UA.instaAndroid, FB, "instagram"],
  ["TikTok Android", UA.tiktok, "", "tiktok"], ["TikTok iOS", UA.tiktokIos, "", "tiktok"],
  ["LinkedIn", UA.linkedin, "", "linkedin"], ["Pinterest", UA.pinterest, "", "pinterest"], ["Snapchat", UA.snapchat, "", "snapchat"],
  ["Safari", UA.safari, "", undefined], ["Chrome", UA.chrome, "", undefined], ["Chrome Android", UA.chromeAndroid, "", undefined],
];
for (const [name, ua, search, kind] of cases) {
  const r = run(ua, search);
  assert.equal(r.pv.e, "pv", name);
  assert.equal(r.pv.ia, kind, `${name}: pv ia`);
  assert.equal(r.src.ia, kind, `${name}: src ia`);
  const all = JSON.stringify([r.sentRaw, r.src]);
  assert.ok(!all.includes("FBAN") && !all.includes("Mozilla") && !all.includes("AppleWebKit") && !all.includes("612345678") && !all.includes("BytedanceWebview"), `${name}: the user agent never leaves the page`);
}
// the owner's link: fbclid alone -> ck meta (the VPS reads it as "Social: Facebook", not an ad), the id itself is in neither the src nor any beacon
{
  const r = run(UA.safari, FB);
  assert.equal(r.src.ck, "meta"); assert.equal(r.src.ia, undefined);
  assert.ok(!JSON.stringify([r.sentRaw, r.src]).includes("IwY2xj"), "the click id is never stored or sent");
}
{ const r = run(UA.chromeAndroid, "?ttclid=E.C.P.abcdef"); assert.equal(r.src.ck, "tiktok"); assert.ok(!JSON.stringify(r.src).includes("abcdef")); }
{ const r = run(UA.safari, "?gclid=Cj0KCQabc&fbclid=x"); assert.equal(r.src.ck, "google"); }
// utm labels still ride along
{ const r = run(UA.fbIos, "?utm_source=facebook&utm_medium=paid_social&fbclid=zz"); assert.deepEqual([r.src.us, r.src.um, r.src.ck, r.src.ia], ["facebook", "paid_social", "meta", "facebook"]); }
// Do-Not-Track: nothing at all
{ const r = run(UA.fbIos, FB, { dnt: "1" }); assert.equal(r.sentRaw.length, 0); assert.equal(r.src, undefined); }
console.log("in-app source: ok");
