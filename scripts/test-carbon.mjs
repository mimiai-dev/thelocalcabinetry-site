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
const want = {
  flat: C.kg(r.flat), asm: C.kg(r.asm), imp: C.kg(r.imp), sea: C.kg(r.sea), imt: C.kg(r.impTruck),
  "less-asm": String(C.lessPct(r.flat, r.asm)), "less-imp": String(C.lessPct(r.flat, r.imp))
};
assert.deepEqual([want.flat, want.asm, want.imp], ["55", "155", "330"], "#166 Atlanta example unchanged");
for (const [k, v] of Object.entries(want)) {
  const shown = [...html.matchAll(new RegExp(`data-h="${k}"[^>]*>([^<]*)<`, "g"))].map((m) => m[1]);
  assert.ok(shown.length > 0, `#166 page has data-h="${k}"`);
  for (const s of shown) assert.equal(s, v, `#166 page shows ${s} for ${k}, the table gives ${v}: ${REGEN}`);
}

assert.ok(C.lookup(T, "96701").err && C.lookup(T, "3030").err && C.lookup(T, "30303").row);
assert.match(C.lookup(T, "96701").err, /lower 48/);
const big = C.at(T, T.p["303"], 40), small = C.at(T, T.p["303"], 12);
assert.ok(Math.abs(big.flat / small.flat - 40 / 12) < 1e-9);

const served = [];
const walk = (u, rel) => { for (const e of readdirSync(u)) { const p = new URL(e, u); if (statSync(p).isDirectory()) walk(new URL(e + "/", u), rel + e + "/"); else served.push(rel + e); } };
walk(new URL("carbon/", root), "carbon/");
for (const f of served) assert.match(f, /^carbon\/(index\.html|carbon\.js|estimates\.json|img\/[a-z0-9-]+\.(webp|jpg))$/, `#166 nothing raw under /carbon/: ${f}`);
for (const f of served.filter((f) => !/\.(webp|jpg)$/.test(f))) {
  const s = read(f);
  for (const bad of ["factors", "/sources/", "zip3", "epa.gov", "census", "Gazetteer"]) assert.ok(!s.includes(bad), `#166 ${f} names ${bad}`);
}
for (const gone of ["carbon/factors-2026-11-06.json", "carbon/factors-2026-10-31.json", "carbon/zip3.json", "carbon/sources", "scripts/carbon"]) assert.ok(!existsSync(new URL(gone, root)), `#166 ${gone} belongs in the private ops repo`);

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
