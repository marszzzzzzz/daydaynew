# STATUS — 日日新格仔鋪 (DayDayNew.HK)

> Last updated: 2026-10-05 · HEAD see `git log` on `main` · all work committed & pushed · production deployed

## 0. Quick reference

| Item | Value |
|---|---|
| Project root (git repo) | `~/Downloads/Kimi_Agent_格仔鋪網站MVP/app` |
| GitHub | `https://github.com/marszzzzzzz/daydaynew` — **PUBLIC** repo, branch `main` |
| Production | `https://gridbox-shop.vercel.app` (Vercel team `trizemars-projects`, project now named `daydaynew-shop`, region `sin1`) |
| Database | Supabase project **DDN**, ref `gndrrgqihsbweocoedvp`, region `ap-southeast-1`, schema **`gridbox`** (10 tables) |
| Owner login | `adminddn` (password only in local `app/.env` → `OWNER_PASSWORD`; never committed) |
| Local dev URL | `http://localhost:4100` (`npm run dev` or `npm run build && npm start`) |
| Stack | React 19 + Vite 7 + Tailwind 3 + shadcn/ui · Hono + tRPC 11 (superjson) · Drizzle ORM · **node-postgres (`pg`)** · Recharts · PGlite for local tests |
| Language of UI copy | Cantonese (繁體) |

### Commands
```bash
npm run dev            # Vite + Hono dev server :4100
npm run build && npm start   # prod build, :4100 (uses .env → Supabase)
npm run check          # tsc -b
npm test               # vitest (contracts/payroll.test.ts + attendance.test.ts, 15 tests)
npm run setup          # interactive .env creation (DB password, SESSION_SECRET, owner)
npm run owner:create -- <user> <pass> [name]   # create/reset owner (min 8 chars)
npm run vercel:env     # push DATABASE_URL + new SESSION_SECRET + DEMO_MODE=false to Vercel (sensitive)
npm run db:backup      # read-only dump → backups/gridbox-YYYYMMDD-HHMMSS/ (gitignored)
vercel deploy --prod --yes   # deploy (retry if "Not authorized", see §3)
```

---

## 1. Current Progress

### 1.1 Features completed (chronological)
1. **SQLite → Supabase Postgres** (`gridbox` schema, RLS on, `anon`/`authenticated` revoked); local tests use PGlite.
2. **Security**: removed Kimi OAuth; public registration = tenant only; owner via env/CLI; `DEMO_MODE` gate; `auth.me` strips `passwordHash`; required `SESSION_SECRET` (≥32); login lockout (8 fails / 15 min, per instance); session cookie `gridbox_sid` HttpOnly SameSite=Lax 30 d.
3. **Vercel deploy** via Build Output API (`scripts/build-vercel.mjs`): static → CDN, `server/vercel-entry.ts` bundled to one Function `/api/*`.
4. **DB driver fix**: postgres-js → `pg` Pool (postgres-js pipelined parallel queries → Supabase transaction pooler 6543 hung → Vercel 30 s timeouts / "Unexpected token 'A'" popups).
5. **Branding**: 日日新格仔鋪 / DayDayNew.HK; logo `public/logo.png` (160px) + `public/favicon.png` (64px); address 「北角 · 每日 11:30 – 19:30」.
6. **Grid wall** (`GridWall.tsx`): 7 shelves × 10 columns, column-major numbering (001–007 = column 1). 大格 = shelves 3–4, all 10 columns → **20 grids**: 003,004,010,011,017,018,024,025,031,032,038,039,045,046,052,053,059,060,066,067 ($700); others 中格 ($500). Every cell links to WhatsApp.
7. **WhatsApp CTA**: `+852 9149 2405` on every grid cell + "How it works" button (`src/const.ts → whatsappLink(gridCode?)`).
8. **Logout fix** (`useAuth.ts`): clears `auth.me` cache + `window.location.replace(/login)`.
9. **Friendly API errors**: client fetch wrapper converts non-JSON responses to Chinese messages; Hono `app.onError` returns JSON.
10. **POS CSV import** (`PosImport.tsx`, `importPosSales`): raw 「商品銷售_明細」 file; `NN格` → grid `0NN`; other categories → 店舖直銷; `租金|按金` categories skipped; 合計 row skipped; preview (dryRun) → confirm; duplicate-period guard via note prefix `[POS start~end]`; sale date picked by user (default = period end − 1 day).
11. **Edit-row fix** for sales tables (amount column live-calculated, note under product).
12. **Admin 10 兼職人工 (payroll)**: **attendance-machine CSV import** (「員工考勤_明細」: staff no.-name, shift count, HH:MM:SS hours; preview → confirm; auto-creates new staff with entered rate; re-import replaces; 合計 row checksum), employees (with 工號 `staffCode`), manual shifts (overnight, break, per-shift rate snapshot), monthly summary, pay-out lock, CSV export. **MPF removed** (staff not enrolled; pay = gross).
13. **Admin 11 租戶銷售**: per-tenant / unleased-grid ranking for a period, prior-period comparison, top products, daily bars, CSV, "立即重新配對".
14. **Lease ↔ sales auto-assignment**: `assignSalesToLeases()` after createLease / updateLease / imports; `unassignSalesOutsideLease()` on date change; POS import credits tenant only if sale date ∈ lease.
15. **Tenant page simplified**: total sales + per-item totals; month filter; grid filter (multi-grid tenants); no notes/barcodes sent.
16. **Tenant trend chart** (`SalesTrend.tsx`): revenue columns + top-5 product lines, day/week/month, period list drill-down (month→week→day), stable per-product colours.
17. **Owner approval gate** for tenant analytics: `tenants.analyticsEnabled` (default false) + approver/time; Admin 06 「批准開通 / 取消」.
18. **In-page dialogs** (`AppDialog.tsx`) replacing all 18 `window.confirm/prompt` (Claude in-app browser auto-cancels native dialogs).
19. **Admin 12 銷售分析**: whole-shop trend (scope 全店/格仔/直銷, filter by tenant or grid), grid vs direct split per period.
20. **Backup tooling**: `npm run db:backup` (restore.sql + per-table JSON + manifest SHA-256); restore verified in PGlite.

### 1.2 Files created
| Path | Purpose |
|---|---|
| `server/app.ts` | Hono app (`/api/*`, lazy `initDb`+`ensureDb`, JSON `onError`) |
| `server/boot.ts` | local/Docker entry (static + listen :4100) |
| `server/vercel-entry.ts` | Vercel Function entry (`getRequestListener(app.fetch)`) |
| `server/auth/session.ts`, `server/auth/types.ts` | JWT (HS256) sign/verify, `authenticateRequest` |
| `server/payrollRouter.ts` | payroll tRPC router |
| `db/ddl.ts` | idempotent DDL run at boot |
| `db/create-owner.ts` | `npm run owner:create` |
| `db/migrations/0001_gridbox.sql` | generated from `db/ddl.ts` + REVOKE (paste into Supabase SQL editor) |
| `contracts/payroll.ts`, `contracts/attendance.ts` (+ `.test.ts`) | payroll rules, attendance CSV parser + 15 unit tests |
| `src/components/AttendanceImport.tsx` | attendance CSV upload/preview/confirm |
| `src/components/PosImport.tsx` | POS preview/import UI (`isPosCsv`, `PosImport`) |
| `src/components/SalesTrend.tsx` | shared trend chart (renamed from `TenantTrend.tsx`) |
| `src/components/AppDialog.tsx` | `askConfirm` / `askPrompt` / `<DialogHost/>` |
| `src/pages/admin/tabs/PayrollTab.tsx` | Admin 10 |
| `src/pages/admin/tabs/TenantSalesTab.tsx` | Admin 11 |
| `src/pages/admin/tabs/AnalyticsTab.tsx` | Admin 12 |
| `public/logo.png`, `public/favicon.png` | brand assets |
| `scripts/setup-env.mjs` | interactive `.env` |
| `scripts/vercel-env.mjs` | push env to Vercel without printing values |
| `scripts/build-vercel.mjs` | Build Output API v3 |
| `scripts/backup-db.mjs` | DB backup |
| `scripts/loop-test.mjs` | 4-phase E2E (56 checks) |
| `scripts/payroll-test.mjs` (32, reads `~/2026ai/員工考勤_明細-*.csv`), `tenant-sales-test.mjs` (16), `assign-sales-test.mjs` (6), `tenant-multigrid-test.mjs` (6), `tenant-trend-test.mjs` (13), `tenant-analytics-approval-test.mjs` (12), `shop-trend-test.mjs` (13) | API E2E tests |
| `vercel.json`, `.vercelignore`, `.env.example`, `.gitignore`, `README.md`, `STATUS.md` | config/docs |

### 1.3 Files modified (major)
`server/shopRouter.ts`, `server/queries/shop.ts`, `server/queries/connection.ts`, `server/accountRouter.ts`, `server/middleware.ts`, `server/bootstrap.ts`, `server/lib/{env,cookies,vite}.ts`, `server/router.ts`, `server/context.ts`, `server/queries/users.ts`, `db/schema.ts`, `db/seed-lib.ts`, `contracts/gridLayout.ts`, `contracts/constants.ts`, `src/App.tsx`, `src/const.ts`, `src/index.css`, `src/providers/trpc.tsx`, `src/hooks/useAuth.ts`, `src/components/{GridWall,DashHeader}.tsx`, `src/pages/{Home,Login,TenantDashboard,StaffDashboard}.tsx`, `src/pages/admin/AdminDashboard.tsx`, `src/pages/admin/tabs/{CsvTab,DemoTab,GridsTab,LeasesTab,RentTab,SalesTab,TenantsTab}.tsx`, `index.html`, `package.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.server.json`, `Dockerfile`.

### 1.4 Files deleted / moved
- `api/` → **`server/`** (all backend; `api/` name reserved by Vercel).
- Deleted: `api/kimi/auth.ts`, `api/kimi/platform.ts`, `db/seed.ts`, `drizzle.config.ts`, `src/components/TenantTrend.tsx` (→ `SalesTrend.tsx`).
- Removed deps: `sql.js`, `@types/sql.js`, `@aws-sdk/*`. Added: `pg`, `@types/pg`, `@electric-sql/pglite`, `postgres` (only used by `scripts/setup-env.mjs`).
- Outside repo: backup of pre-migration app at `~/Downloads/Kimi_Agent_格仔鋪網站MVP/app.bak-sqlite-v2/`; Hermes project moved to `~/Downloads/hermes-dashboard`.

---

## 2. Technical Details & Context

### 2.1 Environment keys (`app/.env`, Vercel env)
| Key | Notes |
|---|---|
| `DATABASE_URL` | Supabase **transaction pooler** `postgresql://postgres.gndrrgqihsbweocoedvp:<pw>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`. Empty → PGlite (dev only; prod requires it unless `PGLITE_DIR` set) |
| `SESSION_SECRET` | ≥32 chars; Vercel has a different value from local |
| `OWNER_USERNAME` / `OWNER_PASSWORD` / `OWNER_NAME` | bootstrap creates owner only if none exists |
| `DEMO_MODE` | `false` in prod; `true` enables demo login + demo seed; switching off deletes `local:demo-*` users |
| `PGLITE_DIR` | local/test only (`memory://` for tests) |
| `PORT` | default 4100 |
| `VERCEL` | auto; pool `max: 5` on Vercel else 10 |

### 2.2 DB schema (`db/schema.ts`, pgSchema `gridbox`; camelCase quoted columns; money = `numeric(12,2)` → string)
- `users(id serial, unionId uniq "local:<lowercase username>", name, email, avatar, passwordHash "s2$salt$hex" scrypt, role 'user'|'staff'|'admin', createdAt, updatedAt, lastSignInAt)`
- `tenants(id, userId→users SET NULL, name, phone, email, note, analyticsEnabled bool default false, analyticsApprovedAt timestamptz, analyticsApprovedBy→users, …)`
- `grids(id, code uniq '001'..'070', size 'M'|'L', monthlyRent, status 'vacant'|'occupied'|'reserved')`
- `leases(id, gridId→grids, tenantId→tenants, startDate, endDate 'YYYY-MM-DD', rentFreeDays, monthlyRent, deposit, status 'active'|'ended', note)`
- `sales(id, gridId→grids NULL=店舖直銷, tenantId→tenants NULL=unassigned, saleDate 'YYYY-MM-DD', saleTime 'HH:MM'|null, productName, quantity int, unitPrice, totalAmount, note, createdBy→users)`
- `rent_records(id, leaseId, gridId, tenantId, month 'YYYY-MM', type 'rent'|'deposit', amount, status 'unpaid'|'paid', paidAt, note)`
- `employees(id, name, staffCode (考勤機工號, partial UNIQUE), phone, hourlyRate, mpfEnrolled (deprecated, unused), active bool, note)`
- `attendance(id, employeeId, month, shiftCount, seconds, hours numeric(8,2), hourlyRate snapshot, period, createdBy)`, UNIQUE(employeeId, month) — one imported row per staff per month
- `shifts(id, employeeId, workDate, startTime, endTime 'HH:MM', breakMinutes, hourlyRate snapshot, note, createdBy)`
- `payroll_payments(id, employeeId, month, hours, basePay, adjustment, grossPay, mpfEmployee/mpfEmployer (deprecated, always 0), netPay (= gross), paidAt, note)`, UNIQUE(employeeId, month)
- FK prevents deleting tenants/grids with history → middleware maps 23503 to 「呢項資料仍有相關記錄…」.
- Schema changes = edit `db/schema.ts` **and** `db/ddl.ts` (use `ADD COLUMN IF NOT EXISTS`), regenerate `db/migrations/0001_gridbox.sql`; DDL auto-runs on first request after deploy.

### 2.3 Server architecture
- `server/app.ts`: middleware lazily `initDb()` + `ensureDb()` (DDL, owner, seed) once per instance; `bodyLimit 50MB` (Vercel caps ~4.5 MB).
- `server/middleware.ts`: `publicQuery` / `authedQuery` / `staffQuery` (staff|admin) / `adminQuery`; `errorFormatter` (zod → Chinese, FK → Chinese, raw SQL hidden).
- `server/queries/connection.ts`: `pg.Pool({ max, idleTimeoutMillis 20000, connectionTimeoutMillis 10000, query_timeout 15000, ssl rejectUnauthorized:false })`; `drizzle-orm/node-postgres`. **Do not reintroduce postgres-js for the app.**
- Grid rules: `contracts/gridLayout.ts` (`GRID_SHELVES=7`, `GRID_COLUMNS=10`, `LARGE_SHELVES={3,4}`, `LARGE_COLUMN_RANGE {1..10}`, `gridColumnOf`, `gridShelfOf`, `gridSizeOf`, `gridRentOf`).
- Payroll rules: `contracts/payroll.ts` (`MIN_WAGE_HKD = 42.1`, `shiftHours` overnight-aware, `computeMonthPay(shifts, attendance|null, adjustment)` → `{shifts, hours, base, adjustment, gross, belowMinWage}`; no MPF). Attendance parser: `contracts/attendance.ts` `parseAttendanceCsv` (BOM/CRLF/tab-tolerant, month from period start, rejects totals mismatch / duplicates / bad durations); pay = round2(hours) × rate.

### 2.4 tRPC API (`/api/trpc/<path>`, superjson; batch GET `?batch=1`)
**public**: `ping`, `shop.publicStats`, `shop.publicGridWall`, `shop.dbHealth`, `account.config`, `account.register`, `account.login`, `account.demoLogin` (DEMO_MODE only), `auth.logout`
**authed (tenant)**: `auth.me`, `shop.myItems {month?, gridCode?}` → `{tenant, analyticsEnabled, grids, gridOptions, gridCode, months, totalAmount, totalQty, items[]}`, `shop.myTrend {granularity, from, to, gridCode?}` (FORBIDDEN unless `analyticsEnabled`), `shop.mySales`, `shop.mySummary`, `shop.myTenantProfile` (legacy, used by tests)
**staff+admin**: `shop.admin.listGrids`, `listSales {from?,to?,gridId?,tenantId?,mine?}`, `weeklyReport`, `createSale`, `updateSale` (staff: own rows only), `deleteSale`, `importSales {rows[]}`, `importPosSales {saleDate, csvText, dryRun}`
**admin**: `shop.admin.stats`, grids CRUD, `listTenants` (incl. analytics fields), `listUsers`, `createTenant`, `updateTenant {userId}`, `setTenantAnalytics {id, enabled}`, `deleteTenant`, `listLeases`, `createLease` → `{id, assigned}`, `updateLease` → `{ok, assigned}`, `endLease`, `assignSalesToLeases`, `shopTrend {granularity, from, to, scope 'all'|'grids'|'direct', tenantId?, gridCode?}`, `salesDateRange`, `tenantSalesReport {from,to}`, rent CRUD, `exportCsv`, `importGrids`, demo endpoints; `account.createAccount`, `account.resetPassword`, `account.setUserRole`; `payroll.*` (rules, employees CRUD (+`staffCode`), shifts CRUD, `importAttendance {csvText, month?, newRates{key→rate}, dryRun}` → `{month, period, rows[status new|create|replace|locked], imported, created, skipped}`, `listAttendance {month}`, `deleteAttendance {id}`, `monthSummary {month}`, `markPaid {employeeId, month, paidAt, adjustment, note}`, `unmarkPaid`).
- Trend payload: `{granularity, from, to, topProducts[{name, amount}], totalAmount, totalQty, buckets[{key, from, to, label, amount, qty, directAmount, gridAmount, top: number[5], items[{name, qty, amount}]}]}`. Range caps: day ≤186 d, week ≤3 y, month ≤10 y. Week = Monday start; labels clipped to range.
- `tenantSalesReport` comparison period: whole months → previous same-count months; Jan-1 start → same dates last year; else preceding equal-length span.

### 2.5 Frontend state & data flow
- `src/providers/trpc.tsx`: `httpBatchLink` + custom `fetch` (credentials include; non-JSON → Chinese `Error`).
- `useAuth()` → `trpc.auth.me` (staleTime 5 min); logout `onSettled` clears cache + hard redirect.
- `TenantDashboard.tsx`: `useState month`, `useState gridCode`; `trpc.shop.myItems.useQuery({month, gridCode}, {placeholderData: prev})`; renders `<SalesTrend key={gridCode||"all"} source={{kind:"tenant", gridCode}} latestMonth={d.months[0]}/>` only if `d.analyticsEnabled`, else locked note.
- `SalesTrend.tsx` props `{ source: TrendSource; latestMonth: string|null; title?: string }`, `TrendSource = {kind:"tenant"; gridCode} | {kind:"shop"; scope; tenantId?; gridCode?}`. State: `g` ('day'|'week'|'month'), `range {from,to}` (via `recentRange(g, anchor)`; anchor = min(today, end of `latestMonth`)), `crumbs[]` (drill stack), `selected` bucket key, `showEmpty`, `showAllItems`. Two `useQuery`s (`myTrend` / `shopTrend`) toggled by `enabled`. `colorOf = useRef(Map<product, hex>)` keeps colour per product (8-slot palette `#2a78d6,#eb6834,#1baf7a,#eda100,#e87ba4,#008300,#4a3aa7,#e34948`, validated CVD ΔE≥9.1). Recharts `BarChart` (`isAnimationActive={false}`, `maxBarSize 24`, radius `[4,4,0,0]`) + `LineChart` (strokeWidth 2, dot r 4). `compact()` axis ticks `$10.5k`.
- `AnalyticsTab.tsx`: `useState scope`, `tenantId`, `gridCode`; tenant/grid selection forces `scope="grids"`; `salesDateRange` → `latestMonth`.
- `AppDialog.tsx`: module-level `enqueue`; `askConfirm(msg, {confirmLabel, danger})`, `askPrompt(msg, default, {inputType})`; `<DialogHost/>` in `App.tsx` (Radix AlertDialog, queue).
- `PosImport.tsx`: `useState saleDate/preview/done`; `importPosSales` dryRun → confirm.
- `GridWall.tsx`: `grid-flow-col grid-cols-10 [grid-template-rows:repeat(7,…)]`; cells are `<a href={whatsappLink(code)}>`; tooltip rendered only when active, aligned by column.

### 2.6 Testing workflow
- E2E scripts hit `http://localhost:3200`. Start a throwaway server:
  ```bash
  env DATABASE_URL= PORT=3200 PGLITE_DIR=memory:// SESSION_SECRET=test-secret-0123456789abcdef0123456789 DEMO_MODE=false OWNER_USERNAME=boss 'OWNER_PASSWORD=BossPass!2026' npm start
  node scripts/tenant-multigrid-test.mjs   # seeds chris (038+045), reads ~/2026ai POS CSVs
  node scripts/shop-trend-test.mjs && node scripts/tenant-analytics-approval-test.mjs && node scripts/tenant-trend-test.mjs   # order matters
  ```
- `scripts/loop-test.mjs <1|2|3|4>` needs a fresh PGlite dir per run and specific env per phase (phase 3 `DEMO_MODE=true`, phases 3/4 need `COOKIE_FILE`). **Always blank `DATABASE_URL`** so tests never touch Supabase.
- Last results: loop 56/56, unit 15/15, payroll E2E 32/32, tenant-sales 16/16, assign 6/6, multigrid 6/6, trend 13/13, approval 12/12, shop-trend 13/13.

---

## 3. Next Steps & Pending Issues

### 3.1 Immediate actions (owner)
- [ ] **Approve tenant analytics**: Admin 06 → Chris / test → 「批准開通」 (both currently `analyticsEnabled=false`).
- [ ] **Import September POS** `~/2026ai/商品銷售_明細-日期 2026-09-01 10-00-00至2026-09-30 10-00-00.csv` (live DB has Feb–Aug only; 409 sales, $115,919).
- [ ] **Import September attendance** in Admin 10 (`~/2026ai/員工考勤_明細-日期 2026-09-01 10-00-00至2026-10-01 10-00-00.csv`): enter each new staff member's hourly rate in the preview. Live DB has only test employee "Mars" (+1 shift) — stop/delete if not a real staff member.
- [ ] MPF removed at owner's request — HK law generally requires MPF for employees employed ≥ 60 days (incl. part-time); confirm staff status with accountant.
- [ ] Re-import Feb–Jun POS month-by-month if monthly accuracy needed (currently all dated 2026-06-29).
- [ ] Create remaining tenants/leases; existing grid sales auto-assign on lease creation.
- [ ] Copy `backups/` to safe storage (contains password hashes; local only). Latest: `backups/gridbox-20261005-061040`.
- [ ] Decide whether GitHub repo `daydaynew` should be **private**.
- [ ] Verify `MIN_WAGE_HKD` (42.1) against Labour Department.

### 3.2 Known issues / edge cases
| Issue | Origin / repro | Workaround / fix idea |
|---|---|---|
| `vercel deploy --prod` intermittently returns `"message": "Not authorized"` | CLI 62.1.0, random | retry loop (always succeeds on 2nd try) |
| Login lockout is per Vercel instance | in-memory `Map` in `accountRouter.ts` | move to DB / Upstash for real enforcement |
| Request body ≤ ~4.5 MB on Vercel | Function limit | split large POS CSVs |
| POS files have no per-day dates | POS export format | export per month/day; charts concentrate on chosen date |
| Native `confirm/prompt` auto-cancelled in Claude in-app browser | Claude Browser pane | fixed via `AppDialog`; don't reintroduce `window.confirm` |
| Tenants see empty page | tenant account not linked (`tenants.userId`) or no lease covering sale dates | link in Admin 06; use 「立即重新配對」 |
| Supabase advisors WARN on `public` schema (legacy DDN tables, `btree_gist` ext, SECURITY DEFINER funcs) | pre-existing project | unrelated to `gridbox`; clean up if DDN legacy unused |
| `server/shopRouter.ts` has a stale duplicate JSDoc above `importPosSales` | old comment | delete old block |
| `mySales` / `mySummary` / `myTenantProfile` unused by UI | legacy | keep for tests or remove; `mySales` still returns notes |
| `TenantSalesTab` bar column narrow on small widths | layout | widen or move bar into separate row |
| Vercel MCP plugin not authenticated | `/mcp` not run | authorize `plugin:vercel:vercel` if MCP tools needed |
| GitHub MCP plugin fails ("Authorization header is badly formatted") | plugin config | re-auth; `gh` CLI works |
| `daydaynew/index.html` (sibling folder) is a separate legacy single-file localStorage app | original Kimi output | not deployed; ignore or archive |

### 3.3 Suggested next features
- Staff self-service shift entry; printable payslips.
- 「開始租格」 hero button → WhatsApp (currently → `/login`).
- Logo on login page / dashboard headers.
- Scheduled DB backups (cron) + off-site storage; Supabase Pro daily backups.
- Phase 2 roadmap (README): inventory, retail invoices, profit calculation.
- Persisted rate-limit + audit log for admin actions.
