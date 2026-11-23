import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import assert from "node:assert/strict";
import { load, calc } from "./carbon/model.mjs";
import { render, headline } from "./carbon/build.mjs";

const C = globalThis.CarbonCalc;
const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const m = load();

const ex = calc(m.K, m.zip3["303"], 25);
assert.deepEqual([C.kg(ex.flat), C.kg(ex.asm), C.kg(ex.imp)], ["55", "155", "330"], "Atlanta example unchanged");
assert.ok(Math.abs(m.K.truckKgPerTonMile - 0.187476) < 1e-6 && Math.abs(m.K.seaKgPerTonMile - 0.078398) < 1e-6);

const html = read("carbon/index.html"), json = read("carbon/estimates.json");
const built = render(m, html);
assert.equal(json, built.json, "#166 carbon/estimates.json is stale: node scripts/carbon/build.mjs");
assert.equal(html, built.page, "#166 page headline numbers are stale: node scripts/carbon/build.mjs");
const h = headline(m);
for (const [k, v] of Object.entries(h)) assert.match(html, new RegExp(`data-h="${k}"[^>]*>${v}<`), `#166 headline ${k} shows ${v}`);

const T = JSON.parse(json);
let n = 0;
for (const [prefix, row] of Object.entries(T.p)) {
  for (const lf of [12, 25, 40]) {
    const a = calc(m.K, m.zip3[prefix], lf), b = C.at(T, row, lf);
    for (const k of ["flat", "asm", "imp", "sea", "impTruck"]) assert.equal(C.kg(b[k]), C.kg(a[k]), `#166 ${prefix} ${lf} lf ${k}`);
    assert.deepEqual(C.lines(b), C.lines(a), `#166 ${prefix} ${lf} lf lines`);
    n++;
  }
}
assert.ok(n > 2500, "every lower-48 prefix at every size");
for (const p of m.K.noTruck) assert.ok(!T.p[p], `no-truck prefix ${p} not in the table`);

assert.ok(C.lookup(T, "96701").err && C.lookup(T, "3030").err && C.lookup(T, "30303").row);
assert.match(C.lookup(T, "96701").err, /lower 48/);

const served = [];
const walk = (u, rel) => { for (const e of readdirSync(u)) { const p = new URL(e, u); if (statSync(p).isDirectory()) walk(new URL(e + "/", u), rel + e + "/"); else served.push(rel + e); } };
walk(new URL("carbon/", root), "carbon/");
for (const f of served) assert.match(f, /^carbon\/(index\.html|carbon\.js|estimates\.json|img\/[a-z0-9-]+\.(webp|jpg))$/, `#166 nothing raw is served under /carbon/: ${f}`);
for (const f of served.filter((f) => !/\.(webp|jpg)$/.test(f))) {
  const s = read(f);
  for (const bad of ["factors", "/sources/", "zip3", "epa.gov", "census", "Gazetteer"]) assert.ok(!s.includes(bad), `#166 ${f} names ${bad}`);
}
for (const gone of ["carbon/factors-2026-11-06.json", "carbon/factors-2026-10-31.json", "carbon/zip3.json", "carbon/sources"]) assert.ok(!existsSync(new URL(gone, root)), `#166 ${gone} is served`);

for (const bad of ["fonts:start", "woff2", "@font-face", "fonts.googleapis", "Method &amp; sources"]) assert.ok(!html.includes(bad), `#166 page has ${bad}`);
assert.ok(html.includes("Starts at our Houston warehouse (77020)."));
const text = html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, " ");
assert.ok(!/carbon[- ]neutral|eco-?friendly|sustainab|offset|net[- ]zero|climate[- ]positive|planet[- ]friendly|trees? planted/i.test(text), "#166 no claim the numbers do not back");

const notices = read("THIRD-PARTY-NOTICES.md");
for (const f of served.filter((f) => f.startsWith("carbon/img/"))) {
  const base = f.replace(/-(800|1600)\.webp$|\.jpg$/, "").replace("carbon/img/", "");
  assert.ok(notices.includes(`carbon/img/${base}`), `#166 ${f} recorded in THIRD-PARTY-NOTICES.md`);
}
for (const src of html.matchAll(/(?:src|srcset)="([^"]+)"/g)) {
  for (const u of src[1].split(",").map((s) => s.trim().split(/\s+/)[0])) {
    if (u.startsWith("/carbon/img/") || u.startsWith("/accessories/")) assert.ok(existsSync(new URL(u.slice(1), root)), `#166 ${u} exists`);
  }
}
console.log("carbon ok");
