import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import assert from "node:assert/strict";

await import("../carbon/carbon.js");
const C = globalThis.CarbonCalc;
const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const REGEN = "regenerate with services/reports/scripts/carbon-estimates.mjs --site <this checkout> in the ops repo";

const json = read("carbon/estimates.json"), T = JSON.parse(json);
assert.deepEqual(Object.keys(T).sort(), ["ex", "lf", "no", "p", "sea", "sizes"], "#166 estimates.json shape");
assert.equal(T.lf, 25);
assert.deepEqual(T.sizes, [12, 25, 40]);
assert.ok(Number.isFinite(T.sea) && T.sea > 0);
const prefixes = Object.keys(T.p);
assert.ok(prefixes.length > 850, "#166 every lower-48 ZIP prefix");
for (const p of prefixes) {
  assert.match(p, /^\d{3}$/);
  const row = T.p[p];
  assert.ok(Array.isArray(row) && row.length === 3 && row.every((v) => Number.isFinite(v) && v > 0), `#166 row ${p}`);
}
for (const p of T.no) assert.equal(T.p[p], undefined, `#166 no-truck prefix ${p} in the table`);
assert.ok(T.p[T.ex.prefix], "#166 example prefix");
assert.equal(json.endsWith("\n") && !json.slice(0, -1).includes("\n"), true);

const html = read("carbon/index.html");
const r = C.at(T, T.p[T.ex.prefix], T.lf);
const want = { flat: C.kg(r.flat), asm: C.kg(r.asm), imp: C.kg(r.imp), sea: C.kg(r.sea), imt: C.kg(r.impTruck), saved: C.saved(r) };
assert.deepEqual([want.flat, want.asm, want.imp], ["55", "155", "330"], "#166 Atlanta example unchanged");
assert.ok(Number(want.saved) > 0, "#168 the contribution line shows a positive saving");
for (const [k, v] of Object.entries(want)) {
  const shown = [...html.matchAll(new RegExp(`data-h="${k}"[^>]*>([^<]*)<`, "g"))].map((m) => m[1]);
  assert.ok(shown.length > 0, `#166 page has data-h="${k}"`);
  for (const s of shown) assert.equal(s, v, `#166 page shows ${s} for ${k}, the table gives ${v}: ${REGEN}`);
}

const TT = JSON.parse(read("carbon/totals.json"));
assert.deepEqual(Object.keys(TT).sort(), ["asof", "co2_kg", "pallets", "sets", "space_cuft"], "#168 totals.json holds totals and the date only");
assert.match(TT.asof, /^\d{4}-\d{2}-\d{2}$/);
for (const k of ["sets", "co2", "space"]) assert.match(html, new RegExp(`data-t="${k}">[^<]*</span>\\+`), `#168 the ${k} counter carries its "+" (at least)`);
assert.ok(!/since 20\d\d|old system|ledger/i.test(html), "owner 2026-11-24: numbers only, no first year or sources on the page");
for (const k of ["sets", "co2_kg", "space_cuft", "pallets"]) assert.ok(Number.isInteger(TT[k]) && TT[k] >= 0, `#168 totals ${k}`);
assert.ok(TT.sets > 0, "#168 at least one delivered order counted");
const tv = C.totalsView(TT);
for (const [k, v] of Object.entries(tv)) {
  const shown = [...html.matchAll(new RegExp(`data-t="${k}"[^>]*>([^<]*)<`, "g"))].map((m) => m[1]);
  assert.equal(shown.length, 1, `#168 page has one data-t="${k}"`);
  assert.equal(shown[0], v, `#168 page counter ${k} shows ${shown[0]}, totals.json gives ${v}: regenerate with services/reports/scripts/carbon-totals.mjs site <this checkout> in the ops repo`);
}
assert.deepEqual(C.totalsView({ asof: "2026-01-05", sets: 3, co2_kg: 12345, space_cuft: 50, pallets: 0 }), { sets: "3", co2: "12.3", "co2-unit": "tonnes CO₂e", space: "50", "space-unit": "cu ft", asof: "January 5, 2026" });
assert.equal(C.totalsView({ asof: "2026-11-23", sets: 1, co2_kg: 990, space_cuft: 80, pallets: 1 })["space-unit"], "pallet");
assert.ok(C.lookup(T, "96701").err && C.lookup(T, "3030").err && C.lookup(T, "30303").row);
assert.match(C.lookup(T, "96701").err, /lower 48/);
const big = C.at(T, T.p["303"], 40), small = C.at(T, T.p["303"], 12);
assert.ok(Math.abs(big.flat / small.flat - 40 / 12) < 1e-9);

const served = [];
const walk = (u, rel) => { for (const e of readdirSync(u)) { const p = new URL(e, u); if (statSync(p).isDirectory()) walk(new URL(e + "/", u), rel + e + "/"); else served.push(rel + e); } };
walk(new URL("carbon/", root), "carbon/");
for (const f of served) assert.match(f, /^carbon\/(index\.html|carbon\.js|estimates\.json|totals\.json|img\/[a-z0-9-]+\.(webp|jpg))$/, `#166 nothing raw under /carbon/: ${f}`);
for (const f of served.filter((f) => !/\.(webp|jpg)$/.test(f))) {
  const s = read(f);
  for (const bad of ["factors", "/sources/", "zip3", "epa.gov", "census", "Gazetteer"]) assert.ok(!s.includes(bad), `#166 ${f} names ${bad}`);
}
for (const gone of ["carbon/factors-2026-11-06.json", "carbon/factors-2026-10-31.json", "carbon/zip3.json", "carbon/sources", "scripts/carbon"]) assert.ok(!existsSync(new URL(gone, root)), `#166 ${gone} belongs in the private ops repo`);

for (const bad of ["fonts.googleapis", "fonts.gstatic", "Method &amp; sources"]) assert.ok(!html.includes(bad), `#166 page has ${bad}`);
assert.ok(html.includes("<!--fonts:start-->") && html.includes("/_astro/about.bfd6fce0.css") && html.includes('class="hero"'), "#168 the page uses the site's own fonts, stylesheet and hero");
for (const w of [/fraunces-latin-var\.woff2/g]) for (const m of html.matchAll(w)) assert.ok(existsSync(new URL("fonts/" + m[0], root)), m[0]);
assert.ok(/href="\/design"[^>]*>Add your kitchen/.test(html), "#168 Add your kitchen call to action");
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
