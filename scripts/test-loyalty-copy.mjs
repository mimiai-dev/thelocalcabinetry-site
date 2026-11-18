// Loyalty card copy (owner 2026-11-18): no semicolons in what customers read, never "points never expire",
// the policy page states that points expire 1 year after they are earned, and the card pages say "Yearly fee: $0".
// Reads the built pages: visible text (scripts, styles and tags stripped, entities decoded), meta descriptions and JSON-LD descriptions.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const MEMBER = ["member/index.html", "member/silver/index.html", "member/gold/index.html", "member/diamond/index.html"];
const POLICY = "policies/index.html";

const decode = (s) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
function copyOf(html) {
  const body = html.slice(html.indexOf("<body"));
  const visible = decode(body.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
  const metas = [...html.matchAll(/<meta (?:name|property)="(?:description|og:description|twitter:description)" content="([^"]*)"/g)].map((m) => decode(m[1]));
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => {
    const out = []; const walk = (v) => { if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) (k === "description" && typeof x === "string") ? out.push(x) : walk(x); };
    walk(JSON.parse(m[1])); return out;
  });
  return { visible, said: [visible, ...metas, ...ld] };
}

let n = 0;
for (const f of [...MEMBER, POLICY]) {
  const { visible, said } = copyOf(readFileSync(f, "utf8"));
  for (const s of said) {
    assert.ok(!/never expire/i.test(s), `${f}: says "never expire": ${s.slice(0, 120)}`);
    const i = s.indexOf(";");
    assert.ok(i < 0, `${f}: semicolon in customer copy: …${s.slice(Math.max(0, i - 60), i + 40)}…`);
  }
  if (MEMBER.includes(f)) assert.match(visible, /Yearly fee: \$0/, `${f}: says the yearly fee`);
  n++;
}
const policy = copyOf(readFileSync(POLICY, "utf8")).visible;
assert.match(policy, /Points expire 1 year after the date they are earned\./, "the policy page states the 1-year expiry");
assert.match(readFileSync(POLICY, "utf8"), /<h2 id="loyalty">/, "the member pages link to /policies#loyalty");
console.log(`loyalty copy ok (${n} pages)`);
