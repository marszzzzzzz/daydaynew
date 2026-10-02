# 格仔鋪 GridBox

格仔鋪（寄賣格仔租賃店）嘅全棧管理網站：對外有宣傳頁吸引租客，對內有租戶專區同店主 Admin 後台，管理格仔、租約、租金按金同每日銷售記錄，並支援 CSV 匯入匯出。

---

## 功能總覽

### 1. 宣傳頁 `/`（公開）

- 實時格仔牆：70 格（10 排 × 7 列，編號 **001–070**；第 3、4 排係大格），直接讀取資料庫，顯示每格編號、尺寸、狀態（招租中 / 已租出 / 已預留），招租格顯示月租
- 全店統計（格仔總數、已租出、出租率、活躍租戶）
- 點解租格、M/L 收費表（中格 $500／大格 $700）、四步開檔流程、CTA

### 2. 登入 / 註冊頁 `/login`

- 用戶名 + 密碼自助註冊及登入，帳號記錄喺後台資料庫（密碼以 scrypt 雜湊儲存）
- 用戶名支援**中英文**、數字、_ . -（3–32 字符）；輸入有誤會顯示中文提示（例如「密碼最少 6 個字符」）
- **公開註冊一律係租客（唯讀）**；店主戶口只可以由伺服器設定建立（見下面「店主戶口」），唔會再有「搶先註冊做店主」嘅漏洞
- 同一 IP + 用戶名 15 分鐘內登入錯 8 次會暫時鎖住
- **Demo 免註冊試用只限示範模式**（`DEMO_MODE=true`）：登入頁先會顯示「店主 Demo / 租戶 Demo」；正式模式下 Demo 登入、demo 戶口同示範資料生成全部停用
- **示範資料生成器**（Admin「08 示範資料」）：初始化 70 格佈局、清除【示範】營業資料；生成示範資料只限示範模式
- 登入後經 `/dashboard` 按身份自動分流：店主 → `/admin`，租戶 → `/tenant`

### 3. 租客專區 `/tenant`（需登入，**唯讀**）

- 本月 / 累計銷售額及售出件數統計
- 自己名下格仔嘅銷售明細表，可按月份篩選
- 租客戶口**只可以讀取、查看自己格仔嘅銷售數據**；唔可以上傳 CSV 或改動任何資料，所有數據由店主／店員匯入及管理
- 租戶檔案未連結登入戶口時，會顯示提示（需店主喺後台連結）

### 3b. 店員專區 `/staff`（需 staff 或 admin 身份）

- **記錄銷售**：揀格仔（須有生效租約）或「店舖直銷」，輸入日期、時間、貨品、數量、單價，金額自動計
- **我嘅記錄**：列出自己輸入嘅銷售，可以修改或刪除（店主嘅記錄唔准郁）
- **上載 CSV**：標準格式銷售 CSV 匯入（同店主「07 匯入匯出」一樣）
- **週結報表**：同店主「09 週結報表」相同嘅結算視圖

### 4. 店主 Admin `/admin`（需 admin 身份）

| 分頁 | 功能 |
| --- | --- |
| 01 總覽 | 本月銷售額、出租率、30 日內到期租約、未收租金總額、最新銷售、快捷操作 |
| 02 格仔管理 | 新增格仔（編號 / M 中格·L 大格 / 月租）、改租、改狀態、刪除（有生效租約嘅格仔不可刪除） |
| 03 銷售記錄 | 每日記錄售出格仔嘅貨品、數量、售價；揀格仔後自動對返生效租約嘅租戶；支援日期 / 格仔 / 租戶篩選、行內修改、刪除 |
| 04 租金按金 | 一鍵為當月全部生效租約批量開立租金單（重複自動略過）；單獨記錄租金或按金；標記已收 / 未收；刪除 |
| 05 租約管理 | 建立租約（格仔、租戶、起訖日期、免租期日數、月租、按金、備註）；建立後格仔自動標記「已租出」；終止後回復「招租中」 |
| 06 租戶管理 | 建立租戶檔案（名稱 / 電話 / 電郵 / 備註）；連結租戶嘅登入戶口；「已登記用戶」名單列出所有註冊戶口（用戶名、身份、註冊日期、最近登入、連結狀態） |
| 07 匯入匯出 | 五類資料匯出 CSV；銷售（標準格式）及格仔支援 CSV 匯入，逐行驗證並報錯；**直接匯入 POS 收銀系統「商品銷售_明細」CSV**（Day Day New 格式），揀格仔＋記帳日期即成 |
| 08 示範資料 | 初始化／補齊 70 格佈局；一鍵生成或清除【示範】營業資料；重置 demo 戶口密碼 |
| 09 週結報表 | 星期一至日結算：逐格仔、逐日、店舖直銷分開列示（店員亦可查看） |

---

### 5. 兼職人工（Admin「10 兼職人工」，店主專用）

- **員工**：姓名、時薪、有冇供強積金；有返工記錄嘅員工唔可以刪，只可以停用
- **返工記錄**：每更日期、返工／落更時間、休息分鐘；落更早過返工 = 跨午夜；每更記低當時時薪，之後加人工唔會改舊記錄
- **月結**：自動計工時、總人工、僱員／僱主強積金（5%；月入低過 $7,100 僱員唔使供；上限 $30,000）、實收、店舖人工成本；可匯出 CSV
- **出糧**：可加「調整」（法定假日薪酬、獎金 + ／扣減 −）；出糧後該月更表鎖定、數字凍結，要改先「取消出糧」
- 時薪低過法定最低工資（`contracts/payroll.ts` 嘅 `MIN_WAGE_HKD`，現時 $42.1）會顯示警告；勞工處公布新數字時改呢個常數
- 計算規則同單元測試：`contracts/payroll.ts`、`contracts/payroll.test.ts`（`npm test`）

## 角色與權限（v2 三級制）

| 角色 | 權限 |
| --- | --- |
| **店主（admin）** | 全權；由 `OWNER_USERNAME` / `OWNER_PASSWORD` 或 `npm run owner:create` 建立（得一個） |
| **店員（staff）** | 上載銷售數據（逐筆記錄／CSV）、修改或刪除**自己輸入**嘅記錄、查看週結報表 |
| **租客（user）** | **唯讀**——只可以睇自己所屬格仔嘅銷售數據；唔可以上傳 CSV 或改動任何資料 |

- 登入方式：用戶名 + 密碼（密碼 scrypt 雜湊），JWT session 存 httpOnly + SameSite=Lax cookie，有效期 30 日
- 店員／租客戶口由店主喺「06 租戶管理」直接開立，或將已註冊戶口「升為店員／降為租客」；忘記密碼由店主「重設密碼」
- 登入後經 `/dashboard` 按身份分流：店主 → `/admin`，店員 → `/staff`，租客 → `/tenant`
- API 分四層：`publicQuery`（公開統計）/ `authedQuery`（租客專區）/ `staffQuery`（店員＋店主）/ `adminQuery`（店主專用）

## 技術棧

- **前端**：React 19 + TypeScript + Vite + Tailwind CSS + shadcn/ui + react-router v7
- **後端**：Hono + tRPC 11（superjson 序列化，Date 等類型自動保留）
- **資料庫**：Supabase Postgres（Drizzle ORM + postgres-js），全部表放喺獨立 schema `gridbox`；本機開發冇 `DATABASE_URL` 時自動用 PGlite（嵌入式 Postgres，同一套 SQL）
- **認證**：用戶名密碼註冊（scrypt）+ JWT session（httpOnly cookie）
- **部署**：Vercel（正式網址 https://gridbox-shop.vercel.app ，香港附近 sin1 region）；亦可以用 Docker（`npm start` 跑 `dist/boot.js`，port 4100）

## 頁面路由

| 路徑 | 說明 | 權限 |
| --- | --- | --- |
| `/` | 宣傳頁 | 公開 |
| `/login` | 登入 | 公開 |
| `/dashboard` | 身份分流 | 需登入 |
| `/tenant` | 租客專區（唯讀） | 需登入（檔案須被連結） |
| `/staff` | 店員專區 | 需 staff 或 admin |
| `/admin` | 店主後台 | 需 admin |

## 資料庫表（`db/schema.ts`）

| 表 | 內容 |
| --- | --- |
| `users` | 登入戶口（unionId、用戶名、密碼雜湊、role: user/staff/admin） |
| `tenants` | 租戶檔案，可連結 `userId` |
| `grids` | 格仔（code 唯一、size M/L、monthlyRent、status） |
| `leases` | 租約（gridId、tenantId、起訖日、rentFreeDays 免租期、月租、按金、active/ended） |
| `sales` | 銷售記錄（格仔、租戶、售出日期、貨品、數量、單價、總額） |
| `rent_records` | 每月租金 / 按金（YYYY-MM、類型、金額、已收/未收、收款日） |
| `employees` | 兼職員工（時薪、強積金、在職／停用） |
| `shifts` | 返工記錄（日期、返工／落更、休息、當時時薪） |
| `payroll_payments` | 已出糧記錄（每人每月一條，凍結數字） |

## CSV 格式

匯出檔案為 UTF-8（含 BOM，Excel 可直接開啟）。匯入欄位次序：

- **銷售** `saleDate, gridCode, productName, quantity, unitPrice, note`
例：`2026-09-01,A01,手繪耳環,2,88,可留空`（gridCode 須存在且有生效租約）
- **格仔** `code, size, monthlyRent`
例：`D01,M,500`（size 只接受 M / L）

每次匯入上限：銷售 2000 行、格仔 1000 行；錯誤行會逐行列出原因，正確行照常寫入。

### POS 收銀明細匯入（商品銷售_明細 · Day Day New）

店主喺「07 匯入匯出」直接上傳收銀系統匯出嘅 CSV，無需改格式：

- 自動識別並跳過檔頭兩行（標題＋記錄數）、欄位標題行同最尾「合計」行
- 抽取欄位：`商品名稱`、`數量`、`銷售金額`；單價 = 銷售金額 ÷ 數量
- 商品編號、規格、分類、條碼會寫入「備註」欄（以 POS 匯入 標記）
- 由於 POS 檔冇格號同每日日期，匯入時需揀**所屬格仔**（須有生效租約）及**記帳日期**；系統會自動讀取檔名標題嘅日期範圍作對照
- 上限 5MB；已用三個真實檔案（212 / 98 / 107 條）驗證，匯入數量及金額與「合計」行完全一致

## 環境變數（`.env`，參考 `.env.example`）

| 變數 | 用途 |
| --- | --- |
| `DATABASE_URL` | Supabase 連線字串（正式環境必填）。本機開發留空 → 用 PGlite（`data/pglite`） |
| `SESSION_SECRET` | 簽登入 session 用，正式環境必填，最少 32 字符（`openssl rand -hex 32`） |
| `OWNER_USERNAME` / `OWNER_PASSWORD` / `OWNER_NAME` | 開機時如果未有店主，就用呢組資料建立店主（密碼最少 8 字符）。建立後可以刪走 |
| `DEMO_MODE` | `true` = 開放 Demo 一撳登入 + 自動生成示範資料；**正式開舖一定要 `false`**（預設） |

## 常用指令

```bash
npm run dev          # 開發伺服器 http://localhost:4100
npm run build        # 生產建構（前端 dist/public + 後端 dist/boot.js）
npm start            # 生產模式啟動
npm run check        # TypeScript 類型檢查
npm run owner:create -- <用戶名> <密碼> [顯示名稱]   # 建立 / 重設店主戶口
```

## 連接 Supabase（一次性設定）

1. Supabase Dashboard → 項目 **DDN** → **Project Settings → Database → Connection string**，揀 **Transaction pooler**（port 6543，IPv4 都用到），複製連線字串，將 `[YOUR-PASSWORD]` 換成資料庫密碼
2. 喺部署環境（或本機 `.env`）設定 `DATABASE_URL`、`SESSION_SECRET`、`OWNER_USERNAME`、`OWNER_PASSWORD`、`DEMO_MODE=false`
3. 啟動 server：bootstrap 會自動喺 Supabase 建立 `gridbox` schema 同六張表、補齊 70 格、建立店主
   （亦可以手動將 `db/migrations/0001_gridbox.sql` 貼入 Supabase SQL Editor 執行）
4. 開 `你嘅網址/api/trpc/shop.dbHealth`，見到 `"driver":"postgres"` 同 `"grids":70` 就代表連上咗

> `gridbox` schema 冇經 Supabase REST API 暴露，六張表都開咗 RLS（冇 policy），anon / authenticated 角色讀唔到任何資料；只有 app 伺服器用 `DATABASE_URL` 直連先讀寫到。

## 部署去 Vercel

項目已連結 Vercel 項目 **gridbox-shop**，正式網址：https://gridbox-shop.vercel.app

- 建構方式：Build Output API（`scripts/build-vercel.mjs`）
  - 前端 `vite build` → Vercel CDN
  - 後端 `server/vercel-entry.ts` 用 esbuild 打包成單一 Function（`/api/*`），region `sin1`（新加坡，同 Supabase 同區）
- 環境變數：`npm run vercel:env` 會將本機 `.env` 嘅 `DATABASE_URL` 同一個新生成嘅 `SESSION_SECRET` 設定到 Vercel（Sensitive，唔會印出），`DEMO_MODE=false`
- 部署指令：

```bash
vercel deploy          # preview 版本
vercel deploy --prod   # 正式版
```

> Vercel Function 請求上限約 4.5MB，POS CSV 太大請分開幾次上載。登入失敗鎖定係按 Function instance 記錄，喺 Vercel 上保護較弱。

## 資料初始化

伺服器啟動時會自動執行 bootstrap（`server/bootstrap.ts`）：

1. `CREATE SCHEMA / TABLE IF NOT EXISTS` 建立 `gridbox` schema 同全部六張表（idempotent，可重複執行；SQL 喺 `db/ddl.ts`）
2. 補齊 70 個格仔——10 排 × 每排 7 格，編號 001–070；第三、四排（015–028）係大格 $700/月，其餘中格 $500/月
3. 按 `OWNER_USERNAME` / `OWNER_PASSWORD` 建立店主（已有店主就略過）
4. `DEMO_MODE=true`：資料庫冇租戶時生成示範營業資料 + demo 戶口；`DEMO_MODE=false`：自動刪除 demo 戶口（示範營業資料要喺後台「08 示範資料」手動清除）
5. 公開診斷端點 `shop.dbHealth` 可隨時查詢資料庫狀態及各表記錄數

## 資料存放須知

- 數據存喺 Supabase Postgres，重新部署 / 重啟 server **唔會**清走數據
- 租戶 / 格仔有租約、銷售或租金記錄時唔可以刪除（資料庫外鍵保護，避免留低孤兒記錄）
- 仍然建議店主定期用「07 匯入匯出」匯出 CSV 做額外備份；Supabase 免費版冇自動每日備份

## 項目結構

```javascript
├── server/              # 後端（Hono + tRPC）
│   ├── app.ts           # Hono app（/api 路由）
│   ├── boot.ts          # 本機 / Docker 入口（加靜態檔 + listen）
│   ├── vercel-entry.ts  # Vercel Function 入口
│   ├── bootstrap.ts     # 自動建表 + 店主 + 示範資料
│   ├── accountRouter.ts # 註冊 / 登入 / 開戶口 / 重設密碼
│   ├── auth/session.ts  # JWT session 簽發同驗證
│   ├── router.ts        # tRPC 總路由（auth / shop）
│   ├── shopRouter.ts    # 格仔鋪業務 API（公開 / 租戶 / admin / CSV）
│   └── queries/shop.ts  # Drizzle 查詢函數
├── contracts/           # 前後端共享常數
├── db/
│   ├── schema.ts        # 資料表定義（Drizzle pg-core，gridbox schema）
│   ├── ddl.ts           # 建表 SQL（開機自動執行）
│   ├── migrations/      # 同一份 SQL，可貼入 Supabase SQL Editor
│   ├── create-owner.ts  # npm run owner:create
│   └── seed-lib.ts      # 示範資料邏輯
├── src/
│   ├── pages/
│   │   ├── Home.tsx             # 宣傳頁
│   │   ├── Login.tsx            # 登入頁
│   │   ├── DashboardRedirect.tsx# 身份分流
│   │   ├── TenantDashboard.tsx  # 租戶專區
│   │   └── admin/               # 店主後台（八個分頁）
│   └── components/      # GridWall 格仔牆、StrokeButton、Noise、DashHeader
└── Dockerfile
```

## 設計系統

- 暖米紙底 `#F8F7E5`、墨黑 `#1D1D1D`、赭金 `#B39C4F`
- 全頁紙感噪點覆層（multiply 5.5%）、規格書虛線分隔
- 字體：Fraunces（拉丁展示）× Noto Serif TC（中文展示）× Noto Sans TC（正文）× IBM Plex Mono（數據）
- 動態描邊 pill 按鈕（hover 時 SVG 描邊繞行一圈）、格仔牆 stagger 入場動畫

## Phase 2 路線圖（未實裝）

1. 倉儲管理（入貨、庫存）
2. 零售販賣 invoice
3. 零售單完成後，按產品平均售價及入貨價自動計算利潤