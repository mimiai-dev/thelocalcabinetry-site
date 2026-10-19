# Design login by 6-digit code: contract with ops

Status: aligned with ops PR #1165 (in review) on 2026-10-20. The page is served by the ops app on the design host (`https://design.thelocalcabinetry.com/design`); the site repo only has a redirect stub. Mock to copy: `docs/mocks/design-login.html`, `.css`, `.js` (works offline with `MOCK=true`; set `MOCK=false` in production).

Flow: email, we email a 6-digit code, type it, signed in, straight into the design chat. No password. This replaces the old "Email me a link" wall.

## Endpoints (as built by ops-construction, ops PR #1165; JSON, same origin)
Every POST must be same-origin and carry the header `x-lco-design: 1`, otherwise 403. `/api/portal/*` is the token-only adapter API (403 to browsers), not used by the page.

### `POST /design/api/login/send-code`  body `{ "email": "a@b.com", "name"?: "..." }`
| Status | Meaning | UI text |
|---|---|---|
| 204 | Same empty answer for every valid address (nothing reveals who is a customer) | goes to the code step |
| 400 `bad_email` | Not a valid email | "Please enter a valid email address." |
| 429 `slow_down` | Per IP / global limit | "Too many tries. Please wait a few minutes and try again." |
| 503 `mail_not_ready` | Mail key off | "We cannot send codes right now. Please write to info@thelocalcabinetry.com." |
| 5xx / network | | "We could not send the code. Check your connection and try again." |

### `POST /design/api/login/verify-code`  body `{ "email": "a@b.com", "code": "123456" }`
| Status | Meaning | UI |
|---|---|---|
| 200 `{ok,signedIn,email}` | Signed in, sets the `lco_dsession` cookie (HttpOnly, Path=/design) | "Signed in. Opening your design page..." then go to `/design` |
| 400 `wrong_code {tries_left}` or `bad_code` | Wrong or malformed code | boxes red: "That code is not right. N tries left." |
| 410 `expired` | Expired, used, or 5 tries spent | "That code has expired. Send a new code." (resend enabled) |
| 410 `superseded` | An older code replaced by a resend (no try spent) | "A newer code was sent to you. Use the latest email." |
| 429 | Too many requests | "Too many tries. Please wait a few minutes and try again." |

Rules: code valid 10 minutes, single use, 5 tries, 30 s between sends, code in the email subject.

## Email
Subject: `Your sign-in code: 123456`. Body: the code in large type, "It works for 10 minutes. If you did not ask for it, ignore this email." From the usual design sender. Put the code in the subject so mobile notifications show it. Plain text plus simple HTML. No link (that is the old wall being removed).

## Page behaviour (all in the mock)
- Step 1: one email field, "Send me a code". Step 2: ONE real `<input autocomplete="one-time-code" inputmode="numeric" maxlength="6">` laid over six drawn boxes (six separate inputs break iOS/Android autofill), so typing, paste, delete and autofill all work natively; non-digits stripped; auto-submit on the 6th digit, "Send a new code" after a 30 s countdown, "Use a different email".
- Accessibility: labels, `aria-live` messages, visible focus ring, 54 to 60 px targets, errors in text not only color; works at 390 and 1280.
- Works without hover; needs JavaScript (the forms are `novalidate` with no action). The JS must send the `x-lco-design: 1` header (it does).

## CSP note (design host)
Today the design pages use `default-src 'none'` (no script). The boxes need script: serve `design-login.js` from the same origin and use `script-src 'self'`, or inline it with a nonce. Also needed: `connect-src 'self'` (fetch), `style-src 'unsafe-inline'` (as now), `img-src data:`, `font-src 'self'` if the site fonts are used (see `docs/mocks/points-README.md`), `form-action 'self'`, `frame-ancestors 'none'`. Suggested full policy: `default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; font-src 'self'; img-src data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`.

## Test codes in the mock only
Any email; `123456` signs in, `000000` is wrong (400, 4 tries left), `999999` is expired (410), `888888` is superseded (410), `429429` is rate limited (429).
