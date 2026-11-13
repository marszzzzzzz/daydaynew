// 銷售記錄「隱藏（租客頁面唔顯示）」API 測試（空資料庫、OWNER_USERNAME=boss OWNER_PASSWORD=BossPass!2026 嘅 server）：node scripts/sales-hidden-test.mjs
const ORIGIN = "http://localhost:3200";
const B = ORIGIN + "/api/trpc/";
let pass = 0, fail = 0;
const ck = (l, c, d) => { c ? pass++ : fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c ? "" : "  → " + JSON.stringify(d).slice(0, 500)}`); };
function client() { let cookie = ""; return async (p, input, get) => {
  const url = B + p + (get ? `?input=${encodeURIComponent(JSON.stringify({ json: input }))}` : "");
  const r = await fetch(url, { method: get ? "GET" : "POST", headers: { "content-type": "application/json", cookie }, body: get ? undefined : JSON.stringify({ json: input ?? null }) });
  for (const c of r.headers.getSetCookie()) if (c.startsWith("gridbox_sid=")) cookie = c.split(";")[0];
  const j = await r.json(); return j.error ? { err: j.error.json.message, code: j.error.json.data?.code } : j.result.data.json; }; }

const boss = client(), tenant = client(), staff = client();
await boss("account.login", { username: "boss", password: "BossPass!2026" });
const grids = await boss("shop.admin.listGrids", undefined, true);
const g1 = grids.find((g) => g.code === "001").id;
const tid = await boss("shop.admin.createTenant", { name: "陳小姐" });
const acc = await boss("account.createAccount", { username: "may", password: "start123", name: "May", role: "user" });
await boss("shop.admin.updateTenant", { id: tid, userId: acc.id });
await boss("shop.admin.setTenantAnalytics", { id: tid, enabled: true });
await boss("shop.admin.createLease", { gridId: g1, tenantId: tid, startDate: "2026-03-03", endDate: "2027-02-28", rentFreeDays: 0, monthlyRent: 500, deposit: 500 });
const sale = (name, qty, price, date) => boss("shop.admin.createSale", { gridId: g1, productName: name, quantity: qty, unitPrice: price, saleDate: date });
const idA = await sale("髮夾", 2, 50, "2026-10-05");    // 100
const idB = await sale("手作皂", 4, 50, "2026-10-06");  // 200
const idC = await sale("秘密貨", 1, 50, "2026-10-07");  // 50（之後隱藏）
const idD = await sale("內部貨", 3, 10, "2026-08-10");  // 30，8 月淨係有呢條（之後隱藏）
const idOf = (r) => r.id ?? r;
const adminRow = async (id) => (await boss("shop.admin.listSales", {}, true)).find((r) => r.id === idOf(id));
await tenant("account.login", { username: "may", password: "start123" });
const items = (month) => tenant("shop.myItems", month ? { month } : {}, true);
const trend = () => tenant("shop.myTrend", { granularity: "month", from: "2026-01-01", to: "2026-12-31" }, true);

const before = await items();
ck("預設唔隱藏：後台 listSales 每條都有 hidden = false", (await boss("shop.admin.listSales", {}, true)).every((r) => r.hidden === false), (await boss("shop.admin.listSales", {}, true))[0]);
ck("隱藏前：租客睇到 4 款、合計 $380", before.items.length === 4 && before.totalAmount === 380 && before.totalQty === 10, before);

const h1 = await boss("shop.admin.updateSale", { id: idOf(idC), hidden: true });
ck("店主隱藏一條銷售記錄", h1.ok === true && (await adminRow(idC)).hidden === true, h1);
const h2 = await boss("shop.admin.updateSale", { id: idOf(idD), hidden: true });
const after = await items();
ck("租客頁面唔再有被隱藏嘅貨品", !after.items.some((i) => i.name === "秘密貨") && !after.items.some((i) => i.name === "內部貨"), after.items);
ck("租客頁面合計唔計隱藏（$300、6 件）", after.totalAmount === 300 && after.totalQty === 6, [after.totalAmount, after.totalQty]);
ck("淨係有隱藏銷售嘅月份（2026-08）唔出現喺租客月份選單", !after.months.includes("2026-08") && after.months.includes("2026-10"), after.months);
ck("按月份睇（10 月）同樣唔計隱藏（$300）", (await items("2026-10")).totalAmount === 300 && !(await items("2026-10")).items.some((i) => i.name === "秘密貨"), await items("2026-10"));
const tr = await trend();
ck("租客走勢圖唔計隱藏（總數 $300）", tr.totalAmount === 300 && tr.buckets.find((b) => b.key.startsWith("2026-08")).amount === 0, tr.totalAmount);
ck("租客走勢圖貨品明細唔見隱藏貨品", !tr.buckets.some((b) => b.items.some((i) => i.name === "秘密貨" || i.name === "內部貨")), tr.buckets.map((b) => b.items));
const sum = await tenant("shop.mySummary", undefined, true);
ck("租客 mySummary 總數唔計隱藏", Number(sum.stats.totalAmount) === 300 && sum.stats.totalQty === 6, sum.stats);

// 店主端照舊見到全部（隱藏只係唔俾租客睇）
const trAdmin = await boss("shop.admin.shopTrend", { granularity: "month", from: "2026-01-01", to: "2026-12-31", scope: "all" }, true);
ck("店主全店走勢仍然計隱藏嘅（$380）", trAdmin.totalAmount === 380, trAdmin.totalAmount);
const rk = await boss("shop.admin.productRanking", { from: "2026-01-01", to: "2026-12-31" }, true);
ck("店主貨品排行仍然計隱藏嘅", rk.topByQty.some((p) => p.name === "秘密貨") && rk.totalAmount === 380, rk.totalAmount);
const st = await boss("shop.admin.statementPreview", { tenantId: tid, month: "2026-10" }, true);
ck("月結單仍然計隱藏嘅（10 月銷售 $350）", st.live.totals.sales === 350, st.live.totals);

// 修改其他欄位唔會重置隱藏
await boss("shop.admin.updateSale", { id: idOf(idC), note: "改咗備註" });
ck("改其他欄位（備註）唔會取消隱藏", (await adminRow(idC)).hidden === true && (await adminRow(idC)).note === "改咗備註", await adminRow(idC));

// 取消隱藏
await boss("shop.admin.updateSale", { id: idOf(idC), hidden: false });
const back = await items();
ck("取消隱藏 → 租客頁面即時見返（$350）", back.items.some((i) => i.name === "秘密貨") && back.totalAmount === 350, back);

// 權限：隱藏／取消隱藏係店主先可以做
await boss("account.createAccount", { username: "staff7", password: "staff123", name: "店員", role: "staff" });
await staff("account.login", { username: "staff7", password: "staff123" });
const own = await staff("shop.admin.createSale", { gridId: null, productName: "店員貨", quantity: 1, unitPrice: 5, saleDate: "2026-10-08" });
ck("店員改自己記錄嘅其他欄位照舊得", (await staff("shop.admin.updateSale", { id: idOf(own), note: "ok" })).ok === true, null);
ck("店員唔可以隱藏／取消隱藏（FORBIDDEN）", (await staff("shop.admin.updateSale", { id: idOf(own), hidden: true })).code === "FORBIDDEN" && (await adminRow(own)).hidden === false, await adminRow(own));
ck("租客（user）唔可以改銷售記錄", ["UNAUTHORIZED", "FORBIDDEN"].includes((await tenant("shop.admin.updateSale", { id: idOf(idA), hidden: true })).code) && (await adminRow(idA)).hidden === false, null);
ck("hidden 一定要係 true／false", (await boss("shop.admin.updateSale", { id: idOf(idA), hidden: "yes" })).code === "BAD_REQUEST", null);

console.log(`  → ${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
