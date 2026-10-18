# 名片簿 Business Card Book

Scan business cards (front + back, up to 10 per batch), read them on the device (tesseract.js), fix fields with a tap,
then organise contacts and reach them on WhatsApp or e-mail with drafts and templates. Built from the
`BUSINESS_CARDS_SYSTEM.md` spec, reusing card-market's camera, OCR, image and i18n code.

## Stack
Next.js 16 (App Router) · React 19 · Tailwind 4 · Postgres (Neon, via `postgres`) · Vercel Blob (private) · Resend (optional)

## Setup on Vercel
1. Storage → **Neon Postgres** → Connect to this project (adds `DATABASE_URL`). Tables are created automatically on first request.
2. Storage → **Blob** (private) → Connect (adds `BLOB_READ_WRITE_TOKEN`).
3. Optional e-mail sending: `RESEND_API_KEY`, `MAIL_FROM`, `RESEND_WEBHOOK_SECRET` (webhook → `/api/webhooks/resend`).
4. Optional: `SESSION_SECRET`, `APP_URL`.
5. `/api/health` shows what is connected.

## Develop
```bash
npm install
DATABASE_URL=postgres://… npm run dev   # photos go to .data/ without a Blob token
npm test                                # parser, phone, vCard, template unit tests
node tests/smoke.mjs http://localhost:3000   # API end-to-end check
```
