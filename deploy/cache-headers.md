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

## Lighthouse "Use efficient cache lifetimes" (2026-10-31)

Live today: HTML and the unhashed scripts answer `no-cache`; images, fonts and video answer `max-age=14400` (4 h, Cloudflare's default Browser Cache TTL, because the origin sends nothing for them). Lighthouse flags the 4 h files (about 500 KiB on the news pages). The repo cannot set response headers; the fix is the VPS nginx or Cloudflare:
- fonts (`/fonts/*.woff2`): `public, max-age=31536000, immutable` (never edited in place).
- `/chat.js?v=...`, `/t.js?v=...`: the `?v=` token changes with the content, so `public, max-age=31536000, immutable` is safe for URLs that carry `v=`.
- images and video (`.webp .jpg .png .svg .mp4 .ico`): `public, max-age=2592000` (30 days). Edit an image in place and visitors keep the old one for up to 30 days; give a changed image a new file name.
- HTML: stays `no-cache`.
In Cloudflare this is a Cache Rule (Caching > Cache Rules), "Edge TTL: use cache-control header if present", "Browser TTL: Override, <value>" per the list above; or the equivalent `location` blocks in `cache-headers.nginx.example`.
Check the result with `node scripts/lighthouse.mjs` (live); the `--local` server cannot judge it.
