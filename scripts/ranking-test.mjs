// 全店銷售排行 API 測試（空資料庫、OWNER_USERNAME=boss OWNER_PASSWORD=BossPass!2026 嘅 server）：node scripts/ranking-test.mjs
const ORIGIN = "http://localhost:3200";
const B = ORIGIN + "/api/trpc/";
let pass = 0, fail = 0;
const ck = (l, c, d) => { c ? pass++ : fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c ? "" : "  → " + JSON.stringify(d).slice(0, 400)}`); };
function client() { let cookie = ""; return async (p, input, get) => {
  const url = B + p + (get ? `?input=${encodeURIComponent(JSON.stringify({ json: input }))}` : "");
  const r = await fetch(url, { method: get ? "GET" : "POST", headers: { "content-type": "application/json", cookie }, body: get ? undefined : JSON.stringify({ json: input ?? null }) });
  for (const c of r.headers.getSetCookie()) if (c.startsWith("gridbox_sid=")) cookie = c.split(";")[0];
  const j = await r.json(); return j.error ? { err: j.error.json.message, code: j.error.json.data?.code } : j.result.data.json; }; }

const anon = client(), boss = client(), staff = client();
await boss("account.login", { username: "boss", password: "BossPass!2026" });
const blank = { displayName: "", description: "", keywords: "", category: "", latest: false, bestSeller: false, hidden: false };
const rank = (extra = {}) => boss("shop.admin.productRanking", { from: "2026-06-01", to: "2026-10-31", ...extra }, true);
const sale = (gridId, productName, quantity, unitPrice, saleDate) => boss("shop.admin.createSale", { gridId, productName, quantity, unitPrice, saleDate });

// 店舖直銷
await sale(null, "保鮮盒", 5, 89, "2026-09-28");
await sale(null, "保鮮盒", 1, 99, "2026-09-28");
await sale(null, "髮夾", 3, 15, "2026-09-20");
await sale(null, "米奇背包", 8, 120, "2026-07-01");
await sale(null, "秘密貨", 10, 50, "2026-09-25");
await sale(null, "散Card", 20, 1, "2026-10-02");
// 格仔銷售（租戶陳小姐租格仔 001）
const grids = await boss("shop.admin.listGrids", undefined, true);
const g1 = grids.find((g) => g.code === "001");
const tid = await boss("shop.admin.createTenant", { name: "陳小姐" });
await boss("shop.admin.createLease", { gridId: g1.id, tenantId: tid, startDate: "2026-09-01", endDate: "2027-02-28", rentFreeDays: 0, monthlyRent: 500, deposit: 500 });
await sale(g1.id, "髮夾", 4, 15, "2026-09-10");
await sale(g1.id, "手作皂", 2, 30, "2026-09-12");
// 商品類別：只有店主喺「商品 SEO」揀過先有
await boss("products.save", { ...blank, sourceName: "保鮮盒", category: "廚具" });
await boss("products.save", { ...blank, sourceName: "髮夾", category: "配飾" });
await boss("products.save", { ...blank, sourceName: "米奇背包", category: "袋" });
await boss("products.save", { ...blank, sourceName: "手作皂", category: " 配飾 " });

const all = await rank();
ck("銷量榜按數量由多到少（相同就睇銷售額）", all.topByQty.map((p) => p.name).join() === "散Card,秘密貨,米奇背包,髮夾,保鮮盒,手作皂", all.topByQty.map((p) => [p.name, p.qty]));
ck("合計：件數 / 銷售額 / 貨品款數", all.totalQty === 53 && all.totalAmount === 2189 && all.productCount === 6, [all.totalQty, all.totalAmount, all.productCount]);
const hair = all.topByQty.find((p) => p.name === "髮夾");
ck("同一件貨直銷 + 格仔銷售加埋計（髮夾 3 + 4 = 7 件、$105）", hair.qty === 7 && hair.amount === 105, hair);
ck("銷量榜帶住類別", hair.category === "配飾" && all.topByQty.find((p) => p.name === "散Card").category === "", all.topByQty);

const cats = all.categories;
ck("類別按銷量排，未分類永遠最後（雖然未分類賣最多）", cats.map((c) => c.category).join() === "配飾,袋,廚具,未分類", cats.map((c) => c.category));
const cat = (n) => cats.find((c) => c.category === n);
ck("同一類別嘅貨品合併計：配飾 = 髮夾 7 + 手作皂 2 = 9 件", cat("配飾")?.qty === 9 && cat("配飾")?.productCount === 2, cat("配飾"));
ck("類別入面貨品按銷量排", cat("配飾").top.map((p) => p.name).join() === "髮夾,手作皂", cat("配飾"));
ck("未分類 = 冇設定類別嘅貨品（散Card + 秘密貨 = 30 件）", cat("未分類")?.qty === 30 && cat("未分類")?.uncategorized === true, cat("未分類"));

const sep = await rank({ from: "2026-09-01", to: "2026-09-30" });
ck("只計揀咗嘅期間（9 月：秘密貨 10、髮夾 7、保鮮盒 6、手作皂 2）", sep.topByQty.map((p) => p.name).join() === "秘密貨,髮夾,保鮮盒,手作皂", sep.topByQty.map((p) => [p.name, p.qty]));
const oneDay = await rank({ from: "2026-09-28", to: "2026-09-28" });
ck("期間頭尾日子都計入（只有 9/28：保鮮盒 6 件）", oneDay.topByQty.length === 1 && oneDay.topByQty[0].qty === 6, oneDay.topByQty);

const direct = await rank({ scope: "direct" });
ck("只睇店舖直銷：唔計格仔嗰 4 件髮夾同手作皂", direct.topByQty.find((p) => p.name === "髮夾")?.qty === 3 && !direct.topByQty.some((p) => p.name === "手作皂"), direct.topByQty);
const grid = await rank({ scope: "grids" });
ck("只睇格仔銷售", grid.topByQty.map((p) => p.name).join() === "髮夾,手作皂" && grid.totalQty === 6, grid.topByQty);
const byTenant = await rank({ tenantId: tid });
ck("按租戶篩", byTenant.totalQty === 6 && byTenant.productCount === 2, byTenant);
const byGrid = await rank({ gridCode: "001" });
ck("按格仔篩", byGrid.totalQty === 6, byGrid);
const empty = await rank({ gridCode: "070" });
ck("冇銷售嘅格仔 → 全部係空", empty.totalQty === 0 && empty.topByQty.length === 0 && empty.categories.length === 0, empty);

ck("開始日期遲過結束日期 → BAD_REQUEST", (await rank({ from: "2026-10-31", to: "2026-06-01" })).code === "BAD_REQUEST", null);
ck("唔存在嘅格仔 → NOT_FOUND", (await rank({ gridCode: "999" })).code === "NOT_FOUND", null);
ck("格仔編號格式唔啱 → BAD_REQUEST", (await rank({ gridCode: "1" })).code === "BAD_REQUEST", null);
ck("未登入 → UNAUTHORIZED", (await anon("shop.admin.productRanking", { from: "2026-06-01", to: "2026-10-31" }, true)).code === "UNAUTHORIZED", null);
await boss("account.createAccount", { username: "staff7", password: "staff123", name: "店員", role: "staff" });
await staff("account.login", { username: "staff7", password: "staff123" });
ck("店員（唔係店主）→ FORBIDDEN", (await staff("shop.admin.productRanking", { from: "2026-06-01", to: "2026-10-31" }, true)).code === "FORBIDDEN", null);

console.log(`  → ${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
