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

**CORRECTED (user said it is the scanning function of their Vercel app):** the scanner is not in `main`. It lives in two other branches of this repo, each deployed as its own Vercel project: `origin/claude/card-market` (project `daydaynew-card-market`, trading-card photos) and `origin/claude/bizcards` (project `bizcards`, business cards). Both use in-browser OCR (tesseract.js). Parts B and C above (Facebook) are secondary. The primary analysis is Section 8. Which of the two projects is the one they mean is still unconfirmed, so both are covered. `daydaynew-shop` (this `main` branch) has no scanner.

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
1. `React.lazy` plus `Suspense` at the **route level** (`src/App.tsx:4-10` imports every page, including AdminDashboard) and per admin tab, plus a manual chunk for recharts (P1/S3).
2. Set `staleTime` and `refetchOnWindowFocus: false` on **public pages only** (P5). Keep admin screens fresh, or they will show stale numbers after another user's edit.
3. Cache only the true public procedures (publicStats, publicGridWall, showcase, banner) with a short `s-maxage` and correct `Vary`. tRPC batches vary by cookie, so a mistake could leak role-specific data through the CDN (P3). Prefer a longer client `staleTime` on public pages first.
4. Debounce the product search (P4).
5. Verify `inspectAttr()` is dev-only; gate it with `apply: "serve"` (S6).
6. Lower `bodyLimit` for non-import routes (S7).

**Step 2: Scan accuracy (medium risk)**
1. Send the post photo to Claude as an image block (base64 or URL) alongside the text. Remove the `needsAi` text-only skip (I1).
2. Fetch all attachments of a post (`attachments{media}`) and store up to N photos (I2).
3. Avoid `sharp`: it is a native dependency that the single-file esbuild bundle (`scripts/build-vercel.mjs`) does not package. Instead, ask Graph for a smaller picture, or resize in the browser (`compressImage` already exists). Measure real `full_picture` sizes first (I5). Redirect handling is speculative: only change it if real failures show up (I6).
   - Download the photo **at sync time** (or re-fetch it by post id before use). `full_picture` URLs are signed fbcdn links that expire, so a click days later may fail.
   - Guard the Claude image block (type, size under about 5 MB, resized) and cap parallel calls: 6 posts at a 20 s timeout is already near Vercel's 30 s limit.
   - A failed AI call on a photo-only post currently saves the rule insight with `aiPending` false and is never retried. Fix that.
4. Surface `analyzedBy` and a "needs review" flag in the inbox UI. Raise the 6-post cap or queue the remainder (I3).
5. Pick the model by measurement on the Step 0 test set (I7).
6. HEIC: add a client-side decoder fallback, or accept the server upload and convert (I4).
7. Add tests with recorded real-looking fixtures. Report precision on the labelled set.

**Step 3: Structural refactor (only with owner approval; no behaviour change)**
- Split `shopRouter.ts` and `queries/shop.ts` by domain (sales, rent, leases, tenants, statements, import). Split `PayrollTab.tsx`.
- S5: replace `LIKE 'YYYY-MM%'` and `substr()` (`shop.ts:459, 514, 569, 858, 892`, `payrollRouter.ts:42`) with range predicates (`>= 'YYYY-MM-01' AND < next month`). This works on text with no migration. Only consider a `date` column migration later, with a backup per `db:backup`. At about 565 rows this does not matter yet.
- Move product photos to object storage if the DB grows (S4).

**Step 4: Verify**: rerun typecheck, tests and Lighthouse, and compare with the Step 0 numbers.

## 5. Risks and open questions

1. Which feature does the owner mean by "automatic image scanning"? (Part 0)
2. Where is the Supabase project hosted (region)? That decides whether P2 is real.
3. Facebook is not connected in production yet. Step 2 cannot be validated end to end until it is (needs `FB_PAGE_ID` / `FB_PAGE_TOKEN`).
4. Sending photos to Claude has a cost per post and a privacy aspect (public Page posts only, so low).
5. Repo rule: Cantonese for owner communication; conventional commits with no attribution lines.

## 6. Goldfish review result (fresh-context reviewer, static reading only)

Confirmed against the code: S1, S3, S4, S5, S7, S8, P1, P3, P4, P5, P6, I1, I2, I4, I5, I6 (mechanism), I7. Notably I1 is exact: `needsAi` skips photo-only posts, and the Graph request asks only for `full_picture` (one URL, no attachments).

Unverified: S6 (`inspectAttr()` is unconditional in `vite.config.ts:12` and the production build uses the same config. Check `dist` output for injected attributes), P2 (needs the Supabase region), S9/I3/I8 (docs not read).

Plan corrections made above: route-level lazy loading; public-only caching scope; no `sharp`; range predicates instead of a date migration; sync-time photo download; image guard and parallelism cap; retry for failed AI on photo-only posts.

Minor: the `substr` line is `shop.ts:892`, and the `findTenantById` loop is about `shopRouter.ts:1117`. `inspectAttr` is listed under `dependencies`, not `devDependencies`.

## 7. Approval needed before any code change

1. Confirm that "image scanning" means the Facebook post and photo analysis (B and C).
2. Approve Step 0 (measurement), then Step 1 (performance), then Step 2 (scan accuracy). Step 3 only if wanted.

## 8. Scanner audit (card-market and bizcards branches)

Read from worktrees of `origin/claude/card-market` (HEAD `5b989a2`) and `origin/claude/bizcards` (HEAD `3bb4a15`). Static reading only: not run, no sample photos, no Lighthouse. The two branches share most of the OCR code (`lib/ocr.ts` is near-identical; bizcards adds PSM 11 and layout parsing).

### 8.1 Pipeline

Camera frame (or gallery photo) -> shrink to 1600 px -> [card-market only, multi-card photo: `detectCards` finds boxes, `cropCard` cuts them] -> `readText` (tesseract.js in the browser, one job at a time) -> regex/heuristic parsing (`hints`, `scriptLanguage`; bizcards `parseCard`) -> user confirms in a review screen -> upload to Vercel Blob or the card backend. There is no server-side OCR and no AI vision call.

### 8.2 Slowness root causes

| ID | Finding | Evidence |
|----|---------|----------|
| O1 | **Auto language mode can run up to four full OCR passes per photo.** The loop tries the last language, then the other three, and stops only when the read "fits" its script AND confidence >= 70. Tesseract LSTM confidence on CJK, stylised or foil text is often under 70, so many photos take the full sweep. | `lib/ocr.ts` bizcards:23,111; card-market:23,109 |
| O2 | **Worker thrash.** Only 2 workers are kept (`workers.size > 2`), but the sweep needs 4 models (`eng`, `chi_tra+eng`, `jpn+eng`, `kor+eng`). Older workers are terminated, so the next photo reloads big traineddata. | `lib/ocr.ts` bizcards:74; card-market:72 |
| O3 | **Heavy models.** `copy-ocr.mjs` ships `4.0.0_best_int` data (the highest-accuracy, slowest tier) for CJK, and every language is listed with `+eng`. First use downloads and parses several MB to tens of MB per language. | `scripts/copy-ocr.mjs:14` |
| O4 | **Large canvas.** Photos are upscaled up to 2x and capped at 2200 px (`Math.min(2, ...)`) before recognition, so Tesseract works on up to about 4-5 megapixels per pass. | `lib/ocr.ts:17,28` |
| O5 | **Serial queue.** Jobs run strictly one at a time (`queue`), a batch of 10 cards with fronts and backs is 20 jobs, and multi-card review awaits each card and each back in sequence. | `lib/ocr.ts` queue; `ReviewStep.tsx:66-67` |
| O6 | **Main-thread image work.** `prepare()` does a full `getImageData` loop on the main thread, and `detectCards` runs its flood fill and morphology on the main thread (card-market). Both block the UI on phones. | `lib/ocr.ts:27-56`; `lib/detect.ts` |

### 8.3 Inaccuracy root causes

| ID | Finding | Evidence |
|----|---------|----------|
| A1 | **Camera frames are video grabs, not stills.** `getUserMedia` asks for an *ideal* 1920x1080 stream and the shot is a canvas copy of the cropped frame. The framed card is often only about 600-1000 px tall, which is low for small print (and what Tesseract needs is about 30 px text height). `ImageCapture.takePhoto()` or native photo capture would give full sensor resolution. | `Camera.tsx:66, 142-150` |
| A2 | **Sharpness gauge is advisory and probably mis-calibrated.** It computes Laplacian variance on an 80x134 downscale of the frame, which measures coarse contrast, not text crispness. The threshold `SHARP = 60` has no stated calibration. It never blocks a blurry shot and there is no glare check. | `Camera.tsx:15-20, 98-104, 161` |
| A3 | **Multi-card detection drops tilted cards.** A blob is rejected if its pixels fill less than 55% of its axis-aligned bounding box. A card rotated about 25-45 degrees fills roughly 50-60% and gets discarded. Boxes are axis-aligned, so there is no perspective correction or de-skew either. | `lib/detect.ts:93` |
| A4 | **Background assumed from the photo edge.** The background colour is the median of a 3% border band. Cards touching the photo edge, a patterned or glossy table, or shadows break the foreground mask. The fixed thresholds (`thr`, 640 px working size, 1.2% area minimum) are untested on real photos. | `lib/detect.ts:11,26,37,92` |
| A5 | **Touching cards are split by area, not by edges.** A merged blob is cut into `round(area / typical)` equal slices (max 6), and when only one blob exists it falls back to an aspect-ratio guess. Sizes that differ (a landscape card, a toploader) mis-split. | `lib/detect.ts:100-112` |
| A6 | **Contrast stretch only.** Greyscale plus a 1st-99th percentile stretch is a global operation. There is no deskew, no local/adaptive thresholding for uneven lighting, and no glare handling for foil cards. | `lib/ocr.ts:27-56` |
| A7 | **Language heuristics.** `scriptLanguage` picks the language by script counts with fixed thresholds (`cjk < 3`, `latin * 0.15`, kana >= 15%). Short names, Chinese cards with a few Latin letters, and mixed-script cards can land in the wrong language, which then selects the wrong model first (`lastFound`) for the next photo. | `lib/ocr.ts` scriptLanguage |
| A8 | **Heuristic field parsing.** Number regexes (`\d{1,3}\s*/\s*\d{1,3}`, `#\d{1,4}`) also match dates and street numbers. `NOISE` drops legitimate short lines. bizcards uses PSM 11 (sparse text), which fragments lines, and name/title/company assignment depends on keyword lists. | `lib/ocr.ts` NUMBER_PATTERNS; `lib/bizcard.ts` |
| A9 | **No ground truth.** There are unit tests for parsing (`tests/lib.test.ts`) but no labelled photo set and no accuracy metric, so "inaccurate" cannot be measured or regressed. | `tests/` |

### 8.4 Fix plan for the scanner (proposal; nothing implemented)

**Step S0: Measure (no behaviour change).** Collect 30-50 real photos from the owner's phone (good light, glare, tilt, dark table, 2-4 cards per photo, mixed languages) with hand-written expected fields. Add a script that runs the OCR and parser on them and prints per-field accuracy and time per photo. Record the current numbers.

**Step S1: Cheap speed wins.**
1. Stop the four-model sweep. Default to one model per card (let the user pick, remember it per batch), and sweep only on failure. Lower `CONFIDENT` or replace it with a script-based check only (O1/O2).
2. Raise the worker cap to match the models in use, or prewarm only `eng` plus the one chosen CJK model (O2).
3. Cap the recognition canvas near 1600 px and stop upscaling beyond need; test accuracy at each size (O4).
4. Move `prepare()` and `detectCards` to a Web Worker or `OffscreenCanvas` (O6).
5. Evaluate `best_int` vs `fast_int` data on the labelled set before changing O3. Accuracy may drop.

**Step S2: Accuracy.**
1. Capture a still: try `ImageCapture.takePhoto()` with the highest available resolution and fall back to the video grab; request a higher ideal resolution (A1).
2. Make the sharpness gauge meaningful: measure on the full-resolution crop and gate or warn the shutter. Add a simple glare check (A2).
3. Detection: accept rotated rectangles (minimum-area box or Hough/contour approach), apply a perspective warp to a flat card, lower the fill-ratio rule or replace it with a rectangularity test on the contour (A3/A5). Use `OffscreenCanvas` or OpenCV.js only if the labelled set shows the heuristic cannot reach the target.
4. Add adaptive thresholding or CLAHE before OCR; compare on the labelled set (A6).
5. Add a "confidence low, please check" flag in the review UI instead of silently auto-filling (A7/A8).

**Step S3: Decision point on a different engine.** If S1-S2 do not reach the target on the labelled set, compare server-side Claude vision (structured output, one call per card, Vercel function in `sin1`) with the on-device path. That gives better CJK and layout reading, at a per-photo cost and with a privacy trade-off (business-card photos contain personal data). The owner must approve this explicitly.

**Step S4: Verify.** Rerun the labelled set, record accuracy and time per photo, compare with S0.

### 8.5 Open questions

1. Which Vercel project does the owner mean: `daydaynew-card-market`, `bizcards` (its latest deployment is `CANCELED`), or both?
2. What does "inaccurate" look like in practice: wrong text, wrong language, missed cards in a multi-card photo, or fields in the wrong boxes? One or two example photos would settle it.
3. Is sending photos to a server-side vision model acceptable (S3), especially for business cards?
4. Which devices (iPhone Safari, Android Chrome)? The camera and `createImageBitmap` behaviour differ.
