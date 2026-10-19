# Site chat contract with ops: ack, route choice, human mode, typing

Status: PROPOSAL from the site dev (2026-10-19), to be confirmed or corrected by ops-construction. The widget (`chat.js`) is built to tolerate missing fields, so the server half can follow. Anything not listed here is unchanged (email gate, tz, seen ping, redeem link: see PR #44).

## A. No canned acknowledgement bubble
- Site PR #47: the widget never draws a line flagged `ack: true`. It records it as received (polling position, seen ping) and shows the typing dots with the caption "The Local Cabinetry is typing" from the moment a message is sent until the real reply arrives.
- Ops: stop producing the ack text when you can. The `ack` field may stay.

## B. Route choice (AI assistant with 5% off, or a person)
- The site has no `visit/start`. The widget sends `route: "ai" | "human"` on the FIRST `POST visit/message` of a conversation (next to `email` and `tz`, never later).
- The contact form posts a hidden field `route` with the same values to `POST /api/inquiry`.
- Questions for ops:
  1. What exactly is recorded for the 5%? Proposal: `route=ai` and `ai_comfort=ai_ok` on the thread, and the 5% applies only then.
  2. Does ops really apply the discount? The widget says "5% off when you continue with our AI assistant" only as the owner specified. If it is not recorded and honoured, a visitor is promised something nobody applies.
  3. `route=human` marks the thread `wants_human`: no AI drafts, a person answers.

## C. Human mode (the owner answers live from Local Ops)
1. **Lines**: lines typed by a person carry `by: "human"` and `name: "<first name>"` in `GET visit/messages`. The widget shows Hannah's "H" avatar and the first name for those lines, and the TLC/"M" avatar for assistant lines.
2. **Mode**: `GET visit/messages` and the `POST visit/message` answer also carry `mode: "ai" | "human"` (conversation level). In human mode the widget says "You are talking with a person" and "A person from our team will reply here", shows no AI wording and no assistant typing dots. Absent means `ai`.
3. **Typing ping**: the Ops composer calls an Ops endpoint (desk-authenticated, not under `visit/*`), for example `POST /api/web/typing {thread, on: true}` about every 3 s while a person types. The visitor sees `typing: true` in `GET visit/messages` for 8 s after the last ping; the widget shows the dots and "Hannah is typing".
4. **Delivery**: the widget polls `GET visit/messages` every 2 s while the panel is open and the thread is in human mode or a reply is owed, so a person's line is on screen in under 3 s. A server-sent stream (`GET visit/stream?after=N`, `text/event-stream`) is possible if ops prefers; polling stays the fallback.
5. **Read receipts**: `POST visit/seen {seq}` (already built in PR #44) is the "visitor saw it" signal the composer can show.
