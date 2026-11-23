import { readFileSync, writeFileSync } from "node:fs";
import { load, table, calc } from "./model.mjs";

await import("../../carbon/carbon.js");
const C = globalThis.CarbonCalc;
const check = process.argv.includes("--check");
const out = new URL("../../carbon/estimates.json", import.meta.url);
const page = new URL("../../carbon/index.html", import.meta.url);

export function headline(m) {
  const r = calc(m.K, m.zip3[m.K.example.prefix], m.K.refLf);
  return {
    flat: C.kg(r.flat), asm: C.kg(r.asm), imp: C.kg(r.imp), sea: C.kg(r.sea), imt: C.kg(r.impTruck),
    "less-asm": String(C.lessPct(r.flat, r.asm)), "less-imp": String(C.lessPct(r.flat, r.imp))
  };
}

export function render(m, html) {
  const json = JSON.stringify(table(m)) + "\n";
  let page = html;
  for (const [k, v] of Object.entries(headline(m))) {
    const re = new RegExp(`(<[^>]*\\sdata-h="${k}"[^>]*>)[^<]*(<)`, "g");
    if (!re.test(page)) throw new Error(`carbon/index.html has no data-h="${k}"`);
    page = page.replace(re, `$1${v}$2`);
  }
  return { json, page };
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const m = load();
  const html = readFileSync(page, "utf8");
  const r = render(m, html);
  let old = "";
  try { old = readFileSync(out, "utf8"); } catch {}
  const stale = old !== r.json || html !== r.page;
  if (check) { if (stale) { console.error("carbon: estimates.json or the page numbers are stale; run node scripts/carbon/build.mjs"); process.exit(1); } console.log("carbon build: up to date"); }
  else { writeFileSync(out, r.json); writeFileSync(page, r.page); console.log("carbon build: wrote carbon/estimates.json and the page numbers"); }
}
