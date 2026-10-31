#!/usr/bin/env node
// One command: Lighthouse (Google, Apache-2.0) over the page list, mobile + desktop, score table, exit 1 under 100.
//   node scripts/lighthouse.mjs                       # live https://thelocalcabinetry.com
//   node scripts/lighthouse.mjs --local               # a local static server of this checkout (no CDN/headers/compression)
//   node scripts/lighthouse.mjs --base https://x --only /,/news/ --form mobile --details
// Each run goes through the office's heavy-lock (one at a time, waits for the machine) when it exists.
// A local server cannot judge: cache lifetimes, text compression, CDN headers (CSP header, frame-ancestors), TLS/HTTP2,
// Cloudflare's injected beacon. Treat those audits as live-only.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { readFileSync, existsSync, statSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const flag = (n) => args.includes(n);
const PAGES = (opt('--only') || '/,/news/how-to-plan-a-kitchen-cabinet-budget/,/news/,/news/category/guides/,/black-friday/,/carbon/,/c/kitchen-cabinets/,/member/,/design').split(',');
const SKIP_LOCAL = ['/design'];   // /design is the ops app, not a static page of this repo
const FORMS = (opt('--form') || 'mobile,desktop').split(',');
const LH = 'lighthouse@13.6.0';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const LOCK = process.env.HEAVY_LOCK || '/Users/airm1/Workspace/projects/alibaba-store-diagnost-ai/local-cabinets-ops/scripts/dev/heavy-lock.mjs';
const CATS = ['performance', 'accessibility', 'best-practices', 'seo'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4', '.txt': 'text/plain', '.xml': 'application/xml', '.ico': 'image/x-icon' };

let server, base = opt('--base', 'https://thelocalcabinetry.com');
if (flag('--local')) {
  // Same cache split as production's documented rules, so the cache audit is honest about the repo's files.
  server = createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    let f = join(root, p); if (!f.startsWith(root)) { r.writeHead(403).end(); return; }
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
    if (!existsSync(f)) { r.writeHead(404).end('not found'); return; }
    const type = TYPES[extname(f)] || 'application/octet-stream', gz = /text|javascript|json|svg|xml/.test(type) && /gzip/.test(q.headers['accept-encoding'] || '');
    const body = gz ? gzipSync(readFileSync(f)) : readFileSync(f);
    r.writeHead(200, { 'content-type': type, 'cache-control': /^\/_astro\//.test(p) ? 'public, max-age=31536000, immutable' : 'no-cache', ...(gz ? { 'content-encoding': 'gzip' } : {}) });
    r.end(body);
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}`;
}

const keep = opt('--keep');   // --keep DIR leaves the raw JSON reports there
const out = keep ? resolve(keep) : mkdtempSync(join(tmpdir(), 'lh-'));
if (keep) mkdirSync(out, { recursive: true });
const rows = []; const fails = [];
for (const page of PAGES.filter((p) => !(flag('--local') && SKIP_LOCAL.includes(p)))) for (const form of FORMS) {
  const file = join(out, `${form}-${page.replace(/\W+/g, '_')}.json`);
  const lh = ['npx', '--yes', LH, base.replace(/\/$/, '') + page, `--output=json`, `--output-path=${file}`, `--only-categories=${CATS.join(',')}`,
    `--chrome-flags=--headless=new --no-sandbox`, '--quiet', ...(form === 'desktop' ? ['--preset=desktop'] : [])];
  const cmd = existsSync(LOCK) ? ['node', LOCK, 'run', '--who', 'lighthouse', '--max-load', '8', '--wait-min', '30', '--', ...lh] : lh;
  // async spawn: the --local server lives in this process and must keep serving while Lighthouse runs
  const r = await new Promise((ok) => { const c = spawn(cmd[0], cmd.slice(1), { env: { ...process.env, CHROME_PATH: CHROME }, stdio: ['ignore', 'ignore', 'inherit'] }); const t = setTimeout(() => c.kill(), 900000); c.on('close', (status) => { clearTimeout(t); ok({ status }) }) });
  if (!existsSync(file)) { rows.push({ page, form, err: `no report (exit ${r.status})` }); continue; }
  const j = JSON.parse(readFileSync(file, 'utf8'));
  if (j.runtimeError) { rows.push({ page, form, err: j.runtimeError.message }); continue; }
  const sc = Object.fromEntries(CATS.map((c) => [c, Math.round((j.categories[c]?.score ?? 0) * 100)]));
  rows.push({ page, form, sc });
  for (const a of Object.values(j.audits)) {
    if (a.scoreDisplayMode === 'error' || (a.score !== null && a.score < 1 && !['informative', 'notApplicable', 'manual'].includes(a.scoreDisplayMode)))
      fails.push(`${form.padEnd(7)} ${page}  ${a.id}${a.displayValue ? ' (' + a.displayValue + ')' : ''}${flag('--details') ? '  ' + JSON.stringify((Array.isArray(a.details?.items) ? a.details.items : []).slice(0, 4).map((i) => i.node?.selector || i.url || i.source?.url || i.description || i.message || i.label || '') ) : ''}`);
  }
}
server?.close(); if (!keep) rmSync(out, { recursive: true, force: true });

const pad = (s, n) => String(s).padEnd(n);
console.log(`\nLighthouse ${LH}  ${base}\n`);
console.log(pad('page', 58) + pad('form', 9) + 'perf  a11y  best  seo');
let bad = false;
for (const r of rows) {
  if (r.err) { bad = true; console.log(pad(r.page, 58) + pad(r.form, 9) + 'ERROR ' + r.err); continue; }
  const s = r.sc; if (CATS.some((c) => s[c] < 100)) bad = true;
  console.log(pad(r.page, 58) + pad(r.form, 9) + [s.performance, s['accessibility'], s['best-practices'], s.seo].map((v) => pad(v, 6)).join(''));
}
if (fails.length) console.log('\nFailing audits:\n' + [...new Set(fails)].join('\n'));
console.log(bad ? '\nFAIL: something is under 100' : '\nPASS: all 100');
process.exit(bad ? 1 : 0);
