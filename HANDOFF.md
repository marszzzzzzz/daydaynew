# 交接文件：日日新格仔鋪

> 更新日期：2026-11-07 · 最新 commit：`7fa6db0`（`main`，已推上 GitHub 同部署；輪播功能本身係 `5596ff9`）
> 完整技術資料睇 [STATUS.md](STATUS.md)。呢份只講而家去到邊、下一步做乜。

## 一句總結

首頁商品輪播同 Facebook 同步都已經上線，程式運作正常，但**正式網站仲未有任何商品被揀**，Facebook 亦**未連接**，所以首頁暫時見唔到輪播。下一步主要係店主操作，唔係寫程式。

## 而家正式網站嘅狀態（2026-11-06 檢查）

| 項目 | 狀態 |
|---|---|
| 網站 https://daydaynew.trize.shop | 正常（200），已部署 `7fa6db0` |
| `/llms.txt` | 正常（200） |
| 自動同步網址，冇密碼 | 正確拒絕（401） |
| 上行「最新商品」 | 0 件 |
| 下行「熱銷產品」 | 0 件 |
| Facebook 帖文 | 0 篇，從未同步過 |
| Vercel 環境變數 `FB_*`、`CRON_SECRET`、`ANTHROPIC_API_KEY` | 全部未加 |
| POS 銷售 | 565 筆，334 個貨品名，最新到 2026-10-31 |
| 租戶 / 員工 | 5 個租戶（分析功能全部未開）/ 7 個員工 |

## 商品輪播點運作

- **上行「最新商品」**：後台 15 將 Facebook 帖文「轉做商品」就會加入，或者喺後台 14 手動剔。最新排最前，首頁顯示 12 件。
- **下行「熱銷產品」**：後台 14 逐件撳「編輯」，剔「放入首頁熱銷產品」。揀「熱銷」篩選可以用 ↑ ↓ 調次序。
- **冇開關**：任何一行有貨就自動出現，兩行都冇貨就成段唔顯示。
- 少過 4 件嗰行唔會移動，只會靜止顯示。
- POS 貨品名唔會自動公開，首頁只顯示店主揀過嘅貨品。

## 2026-11-06 功能檢查結果

本機用測試資料庫行，冇掂正式網站。

**通過**
- 基本測試 73/73，類型檢查冇錯誤，商品 API 測試 35/35。
- 冇揀貨品時，首頁唔顯示輪播。
- 喺後台介面剔選同儲存之後，公開輪播即刻有資料，售價用 POS 最近售價。
- 手機闊度（375px）冇橫向溢出。

**今次冇重跑**：Facebook API 測試同其他 API 測試。佢哋最後一次喺 `5596ff9` 通過（Facebook 31/31），之後程式冇改過。真實 Facebook 帳號從未試過，因為未連接，測試用嘅係假 Facebook 同假 Claude。

## 2026-11-07 已修

- 後台 14「去首頁睇 ↗」而家會捲到輪播（`ProductShowcase.tsx` 資料載入後補捲，邏輯喺 `src/lib/scrollToHash.ts`，有單元測試）。
- 本機用無頭 Chromium 量度：開 `/#products` 後，輪播距離畫面頂部 112px（桌面 1280px 同手機 375px 一樣），舊版係 768 / 1269（冇捲）。冇 hash 嘅首頁仍然留喺頂部。
- 基本測試 77/77，類型檢查冇錯誤。真手機同 Safari 未試。
- 呢次部署曾經被 Vercel 攔住，原因同解法睇「工作規則」。

## 已知問題（未修）

| 嚴重程度 | 問題 | 位置 | 修法 |
|---|---|---|---|
| 低，已重現 | 直接開 `/#pricing` 都唔會捲（舊版一樣，所以唔係今次改動造成）。`#why`、`#how` 未測試。估計同一個原因：頁面係畫面出現後先有內容，開頁嗰刻搵唔到 | `src/pages/Home.tsx` | 首頁載入完成後，統一按網址 hash 補捲一次 |
| 低，只係睇程式碼，未重現 | 「熱銷」篩選加埋搜尋時用 ↑ ↓，只會重排搜尋結果，次序可能同其他貨品撞 | `src/pages/admin/tabs/products/ProductsTab.tsx` `move()` | 搜尋中隱藏 ↑ ↓，或者傳完整名單 |
| 低，只係睇程式碼，未重現 | 熱銷揀超過 30 件，第 31 件起唔顯示，後台冇提示 | `server/productsRouter.ts` `BEST_SELLER_MAX` | 後台加提示，好似「最新」嗰行咁 |

## 下一步

**店主要做**
1. 後台 14 揀 4 件或以上熱銷貨，填對外名稱同上載相。之後首頁就會出現輪播。
2. 跟後台 15 嘅步驟連接 Facebook，將 `FB_PAGE_ID`、`FB_PAGE_TOKEN`、`CRON_SECRET` 加入 Vercel，想用 AI 整理就加 `ANTHROPIC_API_KEY`。加完要重新部署。
3. 連接之後撳一次「立即同步」，用真帖文驗收，呢步從未做過。
4. 決定 GitHub repo 係咪轉做私人：**而家係公開（PUBLIC）**。

**開發者可以做（要店主同意先開始）**
- 修上面三個已知問題。
- 之前提過但未決定：後台 06 加「設定狀態」欄、免租處理、`generateMonthRent` 冇理會租約日期、tinyu 租約結束日期。

**STATUS.md 有幾處已經過時**
- 「Import September POS」：資料庫已經有 9 月同 10 月銷售。
- 「Live DB has only test employee」：而家有 7 個員工。
- 最新備份應該係 `backups/gridbox-20261028-092408`，但嗰次之後資料已經有更新，部署前要再備份。
- 「Decide whether GitHub repo should be private」仲未決定。

## 工作規則

- 同店主用廣東話溝通。
- Commit 用 conventional commits，**唔好加 Co-Authored-By 或者任何署名**。
- 先寫測試。瀏覽器測試只可以用 `localhost:3200`，動手之前要確認 `location.origin`。
- 正式資料庫只可以讀；改 schema 要透過 `db/ddl.ts`，部署後會自動執行，同時要重新生成 `db/migrations/0001_gridbox.sql`（文件尾嘅 Supabase `REVOKE` 兩行要保留）。
- 部署之前跑 `npm run db:backup`。`backups/` 有密碼雜湊，只可以留喺本機。
- **唔好經手店主嘅 Facebook 權杖或者密碼**，叫店主自己放入 Vercel。加 Vercel 環境變數之前要先問。
- 部署：`vercel deploy --prod --yes`，大約要 7 分鐘，部署前工作區要乾淨（`git status` 冇改動），`HANDOFF.md` 未 commit 時要暫時搬走。
- **Git 電郵（重要）**：Vercel 免費（Hobby）計劃會核實 commit 作者電郵配對到 GitHub 帳戶，配對唔到就攔住部署，錯誤只會顯示 "Not authorized"，**重試冇用**（2026-11-06 試過三次都失敗，部署詳情頁寫明原因）。呢個 repo 已經用 `git config --local user.email` 設定 GitHub 專用 noreply 電郵（`<GitHub 帳戶編號>+marszzzzzzz@users.noreply.github.com`），所以唔好改返做 `trizemars@gmail.com`。全域設定仍然係舊電郵，其他 repo 要自己留意。唔需要升級 Pro。
- 部署遇到 `Blocked`：去 Vercel 部署詳情頁睇紅框寫嘅原因，唔好盲目重試。
- 程式碼喺 `app/`。`daydaynew/` 同 `app.bak-sqlite-v2/` 唔係現行網站，唔好改。

## 本機測試

```bash
npm run build
```

```bash
env DATABASE_URL= PORT=3200 PGLITE_DIR=memory:// SESSION_SECRET=test-secret-0123456789abcdef0123456789 DEMO_MODE=false OWNER_USERNAME=boss 'OWNER_PASSWORD=BossPass!2026' npm start
```

```bash
node scripts/products-test.mjs
```

`DATABASE_URL=` 一定要留空，測試先唔會掂到 Supabase。Facebook 測試要額外環境變數，睇 `scripts/facebook-test.mjs` 文件頭。
