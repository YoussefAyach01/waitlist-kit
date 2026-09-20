# Waitlist Kit (waitlist-kit)

Embeddable waitlist with a referral queue. A visitor leaves an e-mail, gets a rank and an invite link;
each friend who joins through that link moves them up. The owner manages lists in a password-protected
dashboard and exports CSV.

- `public/widget.js`: dependency-free widget (shadow DOM, no `innerHTML`, remembers the visitor in localStorage)
- Next.js 16 API + dashboard, SQLite via Node's built-in `node:sqlite` (Node >= 22.5, no native modules)
- Single owner (one admin password), many waitlists

## Run

```bash
cp .env.example .env.local      # set ADMIN_PASSWORD and SESSION_SECRET
npm install
npm run dev                     # http://localhost:3220  ->  /login -> create a waitlist
npm run typecheck && npm run lint && npm test
npm run build && npm start
```

Embed on any page:

```html
<script src="https://your-host/widget.js" data-list="LIST_ID" defer></script>
```

Optional attributes: `data-title`, `data-button`, `data-target` (CSS selector to mount into), `data-api`.
Or share the hosted page `https://your-host/w/LIST_ID`.

## How ranking works

Rank = 1 + people ahead. Ahead means more referrals, or equal referrals and joined earlier. Joining twice
with the same e-mail returns the same standing. A referral counts only if the code belongs to the same list
and the referred visitor comes from a different IP (skipped when no trusted client IP is available).

## Security notes

Server-side e-mail validation, JSON only with a 4 KB cap, honeypot field, per-IP and per-list+IP rate limits,
optional per-list origin allowlist, hashed IPs, parameterised SQL, HMAC session cookie (httpOnly, SameSite
Strict), constant-time password check, login rate limit, CSV formula-injection guard, CSP + security headers.

## Deploy

Needs a persistent disk (SQLite): a small VPS, Fly.io or Railway volume with `DATABASE_PATH` on it. Not
suitable for Vercel. Use HTTPS. Set `TRUST_PROXY=1` only behind a proxy that sets `X-Forwarded-For`; without
it all visitors share one rate-limit bucket. If you set an origin allowlist and run behind a proxy, add your
own public origin to it (the "own origin" exception uses the internal request URL).

## Limits

- No e-mail confirmation or welcome e-mail yet, so addresses are unverified.
- The join endpoint returns the existing rank and referral code when an e-mail is already on the list. That
  lets anyone who knows an address fetch its referral link. Low impact, but double opt-in would fix it.
- Rate limiting is in-memory (one process).
- The widget was tested in jsdom against the real API handlers, not in a real browser; the hosted `/w/<id>`
  page mounts it through `next/script` and has not been opened in a browser.
