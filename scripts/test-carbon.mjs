// node scripts/test-carbon.mjs : the /carbon/ numbers come only from the dated factors file, and the page text agrees with it.
import { readFileSync } from "node:fs"; import assert from "node:assert/strict";
await import("../carbon/carbon.js"); const C = globalThis.CarbonCalc;
const f = JSON.parse(readFileSync(new URL("../carbon/factors-2026-10-31.json", import.meta.url)));
const zip3 = JSON.parse(readFileSync(new URL("../carbon/zip3.json", import.meta.url))).p;
assert.equal(C.FACTORS_FILE, "/carbon/factors-2026-10-31.json");
const K = C.build(f), r = C.calc(K, zip3["303"], 25);
// the first release's Atlanta example: 55 / 155 / 330 kg
assert.equal(C.kg(r.flat), "55"); assert.equal(C.kg(r.asm), "155"); assert.equal(C.kg(r.imp), "330");
assert.ok(Math.abs(K.truckKgPerTonMile - 0.187476) < 1e-6 && Math.abs(K.seaKgPerTonMile - 0.078398) < 1e-6);
assert.ok(!C.lookup(K, "96701", zip3).coords && !C.lookup(K, "3030", zip3).coords && C.lookup(K, "30303", zip3).coords);
// no hard-coded factor left in the script
const js = readFileSync(new URL("../carbon/carbon.js", import.meta.url), "utf8");
for (const bad of ["0.186", "1.22", "11.6", "694", "29.768", "3958"]) assert.ok(!js.includes(bad), "hard-coded " + bad);
// the page stays short (owner 2026-10-31: "too AI"); the audit numbers live only in the dated factors file, which the page links as its source
const html = readFileSync(new URL("../carbon/index.html", import.meta.url), "utf8");
for (const s of ["Starts at our Houston warehouse (77020); transport to Houston is not counted.", "/carbon/factors-2026-10-31.json"]) assert.ok(html.includes(s), "page lacks " + s);
for (const s of ["Method &amp; sources", "Your ZIP stays in your browser"]) assert.ok(!html.includes(s), "page still has " + s);
assert.equal(f.circuity.factor, 1.22); assert.equal(f.density.breakeven_lb_per_cuft, 11.6); assert.equal(f.cube.flat.lb, 694);
for (const k of ["version", "date", "factors", "circuity", "density", "cube", "import_route", "changelog"]) assert.ok(f[k], k);
console.log("carbon ok");
