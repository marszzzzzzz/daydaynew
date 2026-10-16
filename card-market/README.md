# 日日新卡市 · Card Market

A player-to-player market for **real trading cards**, built on the Card Pool backend
(see `REAL_CARDS_AND_MARKET.md`). Collectors photograph a card, set an asking price and list it;
buyers make offers; once the seller accepts, both sides see each other's WhatsApp and finish the
deal in person. **The site never takes payment.**

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · SWR. Traditional Chinese by default, with English.

## How it talks to Card Pool

Card Pool's API sends no CORS headers, so this app uses the **proxy** option from the spec (§10.2 b):

```
browser ──/api/*──▶ app/api/[...path]/route.ts ──Bearer token──▶ CARD_POOL_API_URL/api/*
```

- Accounts, cards, photos, listings and deals all live in Card Pool. This app has no database.
- The session token is stored in an **httpOnly cookie** (`cm_session`), not `localStorage`. The proxy
  adds it as `Authorization: Bearer …`, so private photos load with a plain `<img src="/api/…">`.
- Only the routes the market needs are forwarded: `config`, `me`, `me/whatsapp`,
  `auth/{login,register,password,name-available}`, `real-cards/**` and `real-market/**`.
  Game and admin routes answer 404.
- Writes must come from this site (`Origin` / `Sec-Fetch-Site` check) and the cookie is `SameSite=Lax`.

## Screens

| Path | Screen |
|---|---|
| `/` | Landing (signed out) · player market with search, category and sort (signed in) |
| `/listing/[id]` | Listing photos and details, offer form (price per copy, copies, message) |
| `/sell` | My cards: seller checklist (password + WhatsApp), market status, “list publicly” switch |
| `/sell/new`, `/sell/[id]` | Add / edit a card: front & back photos (shrunk to 1600 px JPEG on the device), name suggestions, price, copies for sale |
| `/deals`, `/deals/[id]` | Offers received / sent with unread badges; conversation, accept · decline · withdraw · cancel · complete; WhatsApp button once accepted |
| `/account` | WhatsApp number, password, region, sign out |
| `/login`, `/signup` | Sign in with a Card Pool name + password; sign up as a collector, then add WhatsApp |

## Run locally

```bash
npm install
CARD_POOL_API_URL=http://localhost:8787 npm run dev   # a local Card Pool API (npm run dev:api in that repo)
# or leave CARD_POOL_API_URL unset to use the live Card Pool site
```

`npm run typecheck` · `npm run build`.

## Deploy on Vercel

New project → root directory **`card-market`** → framework Next.js. Optional env var
`CARD_POOL_API_URL` (defaults to `https://daydaynew-card-pool.vercel.app`). Functions run in `sin1`,
next to Card Pool.

## Known limits

- No single-listing endpoint upstream: a listing page looks the card up in the market list (newest 200).
- No on-device OCR here (Card Pool's add-card screen has it); name suggestions come from typing.
- Pools (Quick Sale / Long-term) are left as they are; manage them in Card Pool.
