# Lighthouse (owner 2026-10-31: all four categories 100, mobile and desktop)

`node scripts/lighthouse.mjs` runs Google Lighthouse 13.6.0 (Apache-2.0, via `npx`) in headless Chrome over the page list, mobile and desktop, prints a score table and the failing audits, and exits 1 if anything is under 100.
Each run goes through the office `heavy-lock` (one at a time; it waits for the machine). Options: `--local` (static server of this checkout: cannot judge cache lifetimes, compression, CDN headers or Cloudflare's injected beacon), `--base URL`, `--only /,/news/`, `--form mobile`, `--details`.
Run it against live after every change that touches CSS, images or scripts.

Cloudflare settings that only the dashboard can change (the repo cannot): Web Analytics automatic setup OFF (its beacon is blocked by our CSP and logs a console error), Scrape Shield > Email Address Obfuscation OFF (it injects a render-blocking `cdn-cgi/.../email-decode.min.js`), a Transform Rule that adds `Content-Security-Policy: frame-ancestors 'none'` as a response header (the meta tag cannot carry it; `X-Frame-Options: DENY` already covers framing), and the cache rule in `deploy/cache-headers.md`.
