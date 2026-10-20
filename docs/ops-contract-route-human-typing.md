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

## B2. Choice in the panel and the switch (owner order 2026-10-20, ops PR "web chat human mode")
- The corner button reads "Chat with us". The panel opens with two tap-first choices at the top: "Chat with our AI assistant" (instant answers, any time) or "Talk to a person" (a teammate replies here, or on WhatsApp). No 5% wording in the chat.

## B3. One button, 5% on the AI path, three ways to a person (owner order 2026-10-21, task T-261020-5; replaces "No 5% wording in the chat")
- One floating "Chat with us" button; the round WhatsApp corner bubble is gone (WhatsApp is inside the chat: header icon and the person path).
- First screen: "AI assistant" ("Design and quotation, 5% off your order") or "Talk to a person" ("Email, WhatsApp or a call").
- AI path: as before (email step, then the AI thread). The first `POST visit/message` carries `route: "ai"`; ops records the Muse choice on that line (ops PR "web chat: the AI path records the Muse 5% choice", `lib/muse.ts recordWebAiChoice`), so quotes carry "Muse 5% (AI sales rep)". That ops PR must merge before this widget goes live.
- Person path: "Email us" (`route: "human"`: the email step, then this thread in human mode), "WhatsApp" (wa.me link, the existing number), "Call" (tel: link, the number from `site.config.json`). The two links send nothing from the chat.
- Open: the contact form's `route=ai` radio ("AI assistant, 5% off your order") is posted to `/api/inquiry` but ops does not record a Muse choice from it today.
- The first `POST visit/message` carries `route`. Afterwards a small link ("Talk to a person" / "Back to AI assistant") calls `POST visit/mode {mode: "ai" | "human"}` and the server answers `{ok, mode}`; the mode is stored on the thread (`buyer_threads.human_mode`) and the book refuses AI drafts and auto-sends on it in code (gate 83).
- Human mode on: the server writes one line, once per thread, "Thanks, a teammate will reply here shortly. You can also reach us on WhatsApp." It is NOT flagged `ack` in `visit/messages`, so the widget draws it.
- The header shows "The Local Cabinetry" (never the AI as a person); its status line says "AI assistant" or "You are talking with a person".

## B3. Email first (owner order 2026-10-20, T-261018-1, ops PR "web email first")
- Right after the AI-or-person choice the panel asks for the visitor's email: heading "Your email, so we can send your design and reply if you step away", the field, the line "We only use it for your project. No spam." under it, and "Start chat". Required and checked with the same rule as the server. Human mode is asked too.
- `GET visit/config` answers `email_gate: "first"` by default now (ops `VISIT_EMAIL_GATE=off` is the kill switch). The email rides on the first `POST visit/message`; the server refuses a new conversation without one (400 `email_required`).
- A returning visitor (an email kept in this browser, or a conversation already stored) is not asked again.
- `POST visit/message` and `GET visit/messages` answer `need_email: true` on a conversation that has no email yet (begun before the step, or with the switch off). The widget then shows the same ask as a card in the thread (`POST visit/email`). The book holds AI replies on such a thread (gate 85 WEB_NO_EMAIL); a person may still answer.
- The email links or creates the customer file (same address in any case = the same file).
- Unseen reply: if our reply is not seen (`POST visit/seen`) within about 10 minutes, ONE email goes through the shop's email channel with the reply's text and the `#chat=<token>` link (redeemed by `POST visit/redeem`), at most one a day per conversation.

## C. Human mode (the owner answers live from Local Ops)
1. **Lines**: lines typed by a person carry `by: "human"` and `name: "<first name>"` in `GET visit/messages`. The widget shows Hannah's "H" avatar and the first name for those lines, and the TLC/"M" avatar for assistant lines.
2. **Mode**: `GET visit/messages` and the `POST visit/message` answer also carry `mode: "ai" | "human"` (conversation level). In human mode the widget says "You are talking with a person" and "A person from our team will reply here", shows no AI wording and no assistant typing dots. Absent means `ai`.
3. **Typing ping**: the Ops composer calls an Ops endpoint (desk-authenticated, not under `visit/*`), for example `POST /api/web/typing {thread, on: true}` about every 3 s while a person types. The visitor sees `typing: true` in `GET visit/messages` for 8 s after the last ping; the widget shows the dots and "Hannah is typing".
4. **Delivery**: the widget polls `GET visit/messages` every 2 s while the panel is open and the thread is in human mode or a reply is owed, so a person's line is on screen in under 3 s. A server-sent stream (`GET visit/stream?after=N`, `text/event-stream`) is possible if ops prefers; polling stays the fallback.
5. **Read receipts**: `POST visit/seen {seq}` (already built in PR #44) is the "visitor saw it" signal the composer can show.
