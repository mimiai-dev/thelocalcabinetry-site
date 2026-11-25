// Loyalty card copy (owner 2026-11-18): no semicolons in what customers read, never "points never expire",
// the policy page states that points expire 1 year after they are earned, and the card pages say "Yearly fee: $0".
// Rates (owner 2026-11-19, from 2026-11-20): Silver 0.5%, Gold 1%, Diamond 2%, bracketed at $3,000 and $9,000.
// Reads the built pages: visible text (scripts, styles and tags stripped, entities decoded), meta descriptions and JSON-LD descriptions.
import { readFileSync, readdirSync } from "node:fs";
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
const RATE = { silver: "0.5%", gold: "1%", diamond: "2%" };
for (const f of MEMBER) {
  const { said } = copyOf(readFileSync(f, "utf8"));
  const all = said.join(" ");
  assert.ok(!/\b3% back|earns? 3%|\$30 in points/.test(all), `${f}: still says the old 3% Diamond rate`);
  assert.match(all, /Silver earns 0\.5% on the first \$3,000|0\.5% of the goods total, which is \$5 in points|Silver card 0\.5% back in points/, `${f}: Silver 0.5%`);
  const tier = Object.keys(RATE).find((t) => f.includes(`/${t}/`));
  if (tier) assert.match(said[1] ?? "", new RegExp(`^The ${tier[0].toUpperCase() + tier.slice(1)} loyalty card: ${RATE[tier].replace(".", "\\.")} back in points`), `${f}: meta states ${RATE[tier]}`);
}
const policy = copyOf(readFileSync(POLICY, "utf8")).visible;
assert.match(policy, /Points expire 1 year after the date they are earned\./, "the policy page states the 1-year expiry");
assert.match(readFileSync(POLICY, "utf8"), /<h2 id="loyalty">/, "the member pages link to /policies#loyalty");
const SERVED = readdirSync(".", { recursive: true }).filter((f) => !/^(\.git|docs|scripts|node_modules)\//.test(f) && (/\.html$/.test(f) || f === "llms.txt" || f === "chat.js"));
let paid = 0;
for (const f of SERVED) {
  const s = readFileSync(f, "utf8");
  const hit = s.match(/\$240|\$20 (per|a|\/) ?month|billed yearly|10% off all (your )?orders|first month of membership|free first month|offer=free-month|12-month membership|separate paid program/i);
  assert.ok(!hit, `${f}: still sells the paid membership (#174): "${hit && hit[0]}"`);
  if (/"@type":"MemberProgram","@id":"https:\/\/thelocalcabinetry\.com\/#membership"/.test(s)) { assert.match(s, /"description":"Membership is free to join\. Get 10% off your first order and earn points on every order\."/, `${f}: MemberProgram says the free first-order offer (#174)`); paid++; }
}
for (const f of ["member/index.html", "member/annual/index.html"]) {
  const { visible, said } = copyOf(readFileSync(f, "utf8"));
  assert.match(visible, /10% off your first order/, `${f}: says 10% off your first order (#174)`);
  assert.match(visible, /Free to join|free to join/, `${f}: says free to join (#174)`);
  assert.ok(!/priority lead|dedicated rep|free 3D layouts/i.test(said.join(" ")), `${f}: no paid-plan perks (#174)`);
  assert.ok(!/"@type":"Offer","@id":"https:\/\/thelocalcabinetry\.com\/member\/annual#offer"/.test(readFileSync(f, "utf8")), `${f}: no paid Offer in JSON-LD (#174)`);
}
assert.match(readFileSync("member/annual/index.html", "utf8"), /name="product_id" value="Member application"/, "the join form still posts product_id Member application");
assert.match(readFileSync("chat.js", "utf8"), /text: 'Membership is free to join: 10% off your first order\.', link: 'Join free', href: '\/member\/annual\/#apply'/, "chat.js: the membership bar is the free first-order offer (#174)");
console.log(`loyalty copy ok (${n} pages), membership copy ok (${SERVED.length} files, ${paid} with MemberProgram)`);
