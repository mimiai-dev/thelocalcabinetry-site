# Design login by 6-digit code: contract with ops

Status: PROPOSAL from the site dev (2026-10-19) for ops-construction to confirm or correct. The page is served by the ops app on the design host (`https://design.thelocalcabinetry.com/design`); the site repo only has a redirect stub. Mock to copy: `docs/mocks/design-login.html`, `.css`, `.js` (works offline with `MOCK=true`; set `MOCK=false` in production).

Flow: email, we email a 6-digit code, type it, signed in, straight into the design chat. No password. This replaces the old "Email me a link" wall.

## Endpoints (JSON, same origin, no CORS)
Paths are a proposal (`/api/portal/...` as the lead named); change the two constants at the top of `design-login.js` if ops uses others.

### `POST /api/portal/send-code`  body `{ "email": "a@b.com" }`
| Status | Meaning | UI text |
|---|---|---|
| 204 | Code sent (or silently not sent for an unknown address: ALWAYS answer the same, so the form cannot be used to test who is a customer) | goes to the code step |
| 400 | Not a valid email | "Please enter a valid email address." |
| 429 | Too many requests (per email and per IP; send `Retry-After`) | "Too many tries. Please wait a few minutes and try again." |
| 5xx / network | | "We could not send the code. Check your connection and try again." |

### `POST /api/portal/verify-code`  body `{ "email": "a@b.com", "code": "123456" }`
| Status | Meaning | UI |
|---|---|---|
| 200 | Signed in: the response sets the session cookie (HttpOnly, Secure, SameSite=Lax). Optional JSON `{ "next": "/design" }`; the UI goes there | "Signed in. Opening your design page..." then redirect |
| 400 | Wrong code (also for a malformed code) | boxes turn red: "That code is not right. Check it and try again." |
| 410 | Code expired or already used | "That code has expired. Send a new code." (resend enabled) |
| 429 | Too many wrong tries (suggest 5 per code, then the code is dead; plus per IP) | "Too many tries. Please wait a few minutes and try again." |

Rules proposed for ops: code = 6 random digits from a CSPRNG, valid 10 minutes, single use, stored hashed; a new send invalidates the old code; resend cooldown 30 s per email (UI also enforces 30 s); lock after 5 wrong tries per code; `Cache-Control: no-store`; same response time whether or not the email is known; the cookie is the existing portal session, so "straight into the design chat" is just the redirect.

## Email
Subject: `Your sign-in code: 123456`. Body: the code in large type, "It works for 10 minutes. If you did not ask for it, ignore this email." From the usual design sender. Put the code in the subject so mobile notifications show it. Plain text plus simple HTML. No link (that is the old wall being removed).

## Page behaviour (all in the mock)
- Step 1: one email field, "Send me a code". Step 2: six boxes (`autocomplete="one-time-code"` on the first so iOS/Android offer the code from the email), auto-advance, backspace goes back, arrow keys, paste of all 6 digits (non-digits stripped), auto-submit on the 6th digit, "Send a new code" after a 30 s countdown, "Use a different email".
- Accessibility: labels, `aria-live` messages, visible focus ring, 54 to 60 px targets, errors in text not only color; works at 390 and 1280.
- Works without hover; needs JavaScript (the forms are `novalidate` with no action).

## CSP note (design host)
Today the design pages use `default-src 'none'` (no script). The boxes need script: serve `design-login.js` from the same origin and use `script-src 'self'`, or inline it with a nonce. Also needed: `connect-src 'self'` (fetch), `style-src 'unsafe-inline'` (as now), `img-src data:`, `font-src 'self'` if the site fonts are used (see `docs/mocks/points-README.md`), `form-action 'self'`, `frame-ancestors 'none'`. Suggested full policy: `default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; font-src 'self'; img-src data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`.

## Test codes in the mock only
Any email; `123456` signs in, `000000` is wrong (400), `999999` is expired (410), `429429` is rate limited (429).
