# Cache headers for thelocalcabinetry.com (to apply on the VPS nginx / Cloudflare rules)

Why: on 2026-10-18 `/_astro/about.DFV3oLg6.css` was edited in place. It is served `immutable` for a year, so Cloudflare
and every returning browser kept the old file and the new header rendered unstyled.

Rules:
- `/_astro/*` files whose name carries a hash: `Cache-Control: public, max-age=31536000, immutable`. Never edit one in place:
  a change means a NEW file name (content hash) and updated page references. `sh scripts/check-assets.sh` enforces it.
- HTML pages, `/chat.js`, `/t.js`, `/luxova-*.js`, `/catalog/*`, icons, `/og-home.*` and any other unhashed file:
  `Cache-Control: no-cache` (the browser and the CDN revalidate with the ETag, so a deploy shows at once).
- Cloudflare: Cache Rule "Respect origin Cache-Control" for these paths (no Edge TTL override), and turn off Web Analytics
  auto-injection (it adds static.cloudflareinsights.com/beacon.min.js to every page; our CSP blocks it).

See `cache-headers.nginx.example` (nginx syntax; a hashed-asset location overrides the catch-all).
