# /points redesign: mock for the ops builders

Screenshots: `shots/` (390 and 1280). Files: `points.html` (form), `points-found.html` (result), `points-missing.html` (not found / same text for a bad id), `points.css`. The mock links the CSS and the logo for review; in production the CSS goes in ONE inline `<style>` and the logo is a `data:` URI.

## What stays exactly as ops has it (`lib/design-site/points.ts`, route `app/(design)/points/route.ts`)
- `GET /points` = the form; `POST /points` with field **`card`** (form-encoded or JSON `{card}`); same status codes, limits, 350 ms floor, no cookie, no script.
- Input `id="card"` `name="card"`, `autocapitalize="characters"`, `maxlength`, label "Card ID", hint line. Submit button "Check points".
- Result card (`aria-live="polite"`): tier pill = tier name, "Your points" + number (`toLocaleString("en-US")`), the static line "Higher tiers earn more points.", then `howLine(...)` (point value and expiry from the program row). Not found / malformed / hidden check failed: the SAME card `role="alert"` with `NOT_FOUND_TEXT`; too many tries: `TOO_MANY_TEXT`.
- Headers unchanged: `no-store`, `noindex`, `referrer-policy: no-referrer`, CSP `default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`.

## What is new
- Brand header (logo-tlc.svg as data URI) and footer, a hero with a decorative member card (inline, NOT a customer's card: the real `loyalty/[ref]/card.svg` is customer-specific and must not appear on a public page), "How points work" in 3 steps, a tier table, FAQ (`<details>`, no script), a membership upsell with the 10% off line linking `/member/`.
- Tier table and step 3 text come from the program and tier rows at render time (the mock shows `{{placeholders}}` marked "sample"): tier name, how you reach it, points earned. Nothing is hardcoded.
- Upsell text: "Membership is $20 per month, billed yearly ($240 per year), and members get 10% off all orders, plus free 3D layouts and quotes, priority lead times and a dedicated rep." Link: `/member/`.

## Deliberately NOT done (ops privacy design; the owner/lead must change it if wanted)
- No progress bar or "points to the next tier": the current page is static on purpose ("it would let an id holder infer lifetime spend"). A progress bar needs a policy decision.
- Lookup by card ID only. Email lookup would let anyone test whether an email is a customer.
- Fonts: the page's CSP has no `font-src`, so Fraunces/Hanken cannot load; the mock uses the same serif and system stacks as today. To use the site fonts, add `font-src https://fonts.gstatic.com; style-src ... https://fonts.googleapis.com` (third party contact: not recommended on this page).
- No script: the FAQ uses `<details>`.

## Accessibility and layout
Mobile first (390), two columns from 860 px; contrast (WCAG, computed): navy on white 15.2:1, mute grey on white 6.5:1, light text on navy 10.4:1, gold-on-navy 7.6:1, text in the darker gold #7a5a14 (labels) above 6:1; the bright gold #b4862f is used only for borders, rules and the focus ring (3.3:1 on white, so never for text); focus ring 3 px gold; inputs 54 px high; respects reduced motion.
