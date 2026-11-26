# App audit and fix plan (EGM Elephant draft)

Status: PROPOSAL ONLY. No application code has been changed.
Method: Elephant-Goldfish Model (google/elephant-goldfish-model). This is the Elephant draft. The Goldfish review is appended at the bottom.

## 0. Scope assumption (needs owner confirmation)

The repo has **no dedicated "automatic image scanning" module** (no OCR, no vision call, no barcode/receipt scanner). The code paths that touch images are:

| # | Path | Files |
|---|------|-------|
| A | Browser photo compression for product photos | `src/lib/imageResize.ts`, `src/pages/admin/tabs/products/*` |
| B | Facebook post "scan": rule-based insight plus Claude analysis | `server/facebook/analyze.ts`, `contracts/facebook.ts`, `server/facebookRouter.ts` |
| C | Facebook post photo download for "turn into product" | `server/facebook/graph.ts` `downloadImage` |
| D | Attendance CSV import (the only other "automatic scan" of an uploaded file) | `src/components/AttendanceImport.tsx`, `contracts/attendance.ts` |

Plan assumes the user means B plus C (auto-reading Facebook posts and their photos). If they mean something else (e.g. scanning receipts or shelf photos), Part 3 changes.

## 1. Structural / code-quality findings

| ID | Finding | Evidence | Severity |
|----|---------|----------|----------|
| S1 | God files: `server/shopRouter.ts` (1199 lines) and `server/queries/shop.ts` (1080) hold sales, rent, leases, tenants, statements, demo data and CSV import in one module. | `wc -l` | Medium |
| S2 | `PayrollTab.tsx` (681 lines) defines 4+ components with their own queries in one file. | grep of `useQuery` lines 18, 56, 218, 369, 545 | Medium |
| S3 | Admin tabs are all statically imported, with no code splitting (see P1). | `AdminDashboard.tsx:4-18` | Medium |
| S4 | Product photos are stored as base64 data-URLs in a Postgres `text` column and served by decoding each time. | `server/app.ts:54-61`, `readImage` | Medium |
| S5 | `sales.saleDate` is `text`. Month filters use `LIKE 'YYYY-MM%'` and `substr()`, which cannot use the `sales_date_idx` b-tree under a non-C collation. | `server/queries/shop.ts:~858,~890` | Medium |
| S6 | `kimi-plugin-inspect-react` runs in `vite.config.ts` unconditionally. It is a dev-inspection plugin and may add attributes to the production DOM. Needs verification. | `vite.config.ts:4,12` | Low-Med |
| S7 | `bodyLimit` is 50 MB globally. Only CSV import and photo upload need it; photos are capped at 400 KB. | `server/app.ts:43` | Low |
| S8 | N+1 pattern: `for (const id of tenantIds) ... await q.findTenantById(id)`. | `shopRouter.ts:1119` | Low |
| S9 | STATUS.md and HANDOFF.md are stale in places (HANDOFF lists this). | HANDOFF.md | Low |

Positives to keep: the pg pool is tuned for the Supabase pooler, `Promise.all` is used for parallel queries, there are zod contracts plus tests (77 passing per HANDOFF), the image route has immutable caching, and the Facebook image download has an SSRF allowlist.

## 2. Performance findings (root causes, ranked)

| ID | Root cause | Evidence | Expected impact |
|----|-----------|----------|-----------------|
| P1 | One JS bundle holds all 15 admin tabs plus recharts and 40 Radix packages. Home and Login visitors download admin code. | `AdminDashboard.tsx` static imports; `grep lazy` returns nothing | High on first load, especially mobile |
| P2 | Serverless cold start plus DB round-trip: Vercel region `sin1` with a pool of 5 and `query_timeout` of 15 s. The Supabase region is unknown. A region mismatch adds 100-300 ms per query. | `vercel.json`, `connection.ts` | Potentially high. **Must measure** |
| P3 | Every public Home visit runs `publicStats`, `publicGridWall`, `products.showcase` and `banner.current` against the DB. Only showcase and banner set `staleTime`. Responses carry no CDN cache headers. | `Home.tsx:22-23`; `ProductShowcase.tsx:56` | Medium. Easy win via `s-maxage` or a longer `staleTime` |
| P4 | `salesByProduct()`, `latestPrices()` and `productRanking` aggregate the whole `sales` table on every call, and the admin product list calls them on each search keystroke. Fine at 565 rows, linear growth after that. | `queries/products.ts:58-79`; `ProductsTab.tsx:77` | Low now, growing |
| P5 | The default `QueryClient()` has `refetchOnWindowFocus: true` and `staleTime: 0`, so every admin tab refetches on each focus and mount. | `providers/trpc.tsx:9` | Medium for admin |
| P6 | Product photo bytes come out of Postgres as base64 text (about 33% larger) and are re-decoded per request. The CDN caches only when `?v=` matches. | `app.ts:54` | Low-Med |

**Do not guess: measure first.** Step 0 of the fix plan adds measurement, because P2 and P3 are hypotheses until timed.

## 3. Image / scan accuracy findings (root causes)

| ID | Root cause | Evidence |
|----|-----------|----------|
| I1 | **Claude never sees the image.** `aiInsight(message, createdTime)` sends text only. A post that is just a photo (or whose price and grid code are only in the photo) returns an empty insight, and `needsAi` explicitly skips AI for photo-only posts. This is the main cause of "scanning does not reliably process images". | `analyze.ts:42-58,60` |
| I2 | Only one photo per post is kept (`imageUrl`). Multi-photo albums are dropped. | `fb_posts.imageUrl` schema; `graph.ts` |
| I3 | AI is capped at 6 posts per sync and failures fall back silently to rule-based parsing, so accuracy differs from post to post with no visible signal. `analyzedBy` exists but the UI may not make the difference obvious. | STATUS.md item 25 |
| I4 | Browser compression relies on `createImageBitmap`. HEIC (iPhone) fails on Chrome, Firefox and Android, with the message "convert to JPG". The EXIF orientation behaviour of `createImageBitmap` is not verified. | `imageResize.ts:27-33` |
| I5 | `downloadImage` rejects anything over 400 KB. Facebook photos usually exceed that, so "use post photo" mostly fails with a "too big" error instead of being resized server-side. | `graph.ts:59-61` |
| I6 | `downloadImage` uses `redirect: "error"`. fbcdn URLs can redirect, which causes spurious failures. | `graph.ts:54` |
| I7 | Model `claude-opus-5-5` with `effort: low` and an 8000 max_tokens is oversized for classification. It adds latency and cost against a 20 s timeout. | `analyze.ts:5-9` |
| I8 | The Facebook connection has never been tested against a real account (HANDOFF.md). All current tests use a fake Facebook and a fake Claude, so real-world accuracy is **unmeasured**. | HANDOFF.md |

## 4. Proposed fix plan (ordered; nothing is implemented yet)

**Step 0: Baseline (no behaviour change)**
- Run `npm ci && npm run check && npm test` and `vite build`; record bundle sizes.
- Lighthouse on `/` and `/admin` (mobile). Time `/api/trpc/...` calls and cold start against the production region.
- Collect 20 real Facebook posts (10 text-only, 10 with price or grid in the photo) with hand-labelled expected output, as an accuracy test set.

**Step 1: Quick performance wins (low risk)**
1. `React.lazy` plus `Suspense` per admin tab, and a manual chunk for recharts (P1/S3).
2. Set a `QueryClient` default `staleTime` of 30-60 s and `refetchOnWindowFocus: false` (P5).
3. Add `Cache-Control: s-maxage` for public tRPC reads (publicStats, publicGridWall) (P3).
4. Debounce the product search (P4).
5. Verify `inspectAttr()` is dev-only; gate it with `apply: "serve"` (S6).
6. Lower `bodyLimit` for non-import routes (S7).

**Step 2: Scan accuracy (medium risk)**
1. Send the post photo to Claude as an image block (base64 or URL) alongside the text. Remove the `needsAi` text-only skip (I1).
2. Fetch all attachments of a post (`attachments{media}`) and store up to N photos (I2).
3. Server-side resize on download (for example `sharp`) instead of rejecting over 400 KB. Follow at most one redirect, and re-check the host after redirect (I5/I6).
4. Surface `analyzedBy` and a "needs review" flag in the inbox UI. Raise the 6-post cap or queue the remainder (I3).
5. Pick the model by measurement on the Step 0 test set (I7).
6. HEIC: add a client-side decoder fallback, or accept the server upload and convert (I4).
7. Add tests with recorded real-looking fixtures. Report precision on the labelled set.

**Step 3: Structural refactor (only with owner approval; no behaviour change)**
- Split `shopRouter.ts` and `queries/shop.ts` by domain (sales, rent, leases, tenants, statements, import). Split `PayrollTab.tsx`.
- Convert `sales.saleDate` to a `date` column (or add an expression index) via a reviewed migration, with a backup first (S5). **High risk. Needs a production backup per `db:backup`.**
- Move product photos to object storage if the DB grows (S4).

**Step 4: Verify**: rerun typecheck, tests and Lighthouse, and compare with the Step 0 numbers.

## 5. Risks and open questions

1. Which feature does the owner mean by "automatic image scanning"? (Part 0)
2. Where is the Supabase project hosted (region)? That decides whether P2 is real.
3. Facebook is not connected in production yet. Step 2 cannot be validated end to end until it is (needs `FB_PAGE_ID` / `FB_PAGE_TOKEN`).
4. Sending photos to Claude has a cost per post and a privacy aspect (public Page posts only, so low).
5. Repo rule: Cantonese for owner communication; conventional commits with no attribution lines.
