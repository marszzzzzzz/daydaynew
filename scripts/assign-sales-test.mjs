import fs from "node:fs";
const B = "http://localhost:3200/api/trpc/";
let cookie = "", pass = 0, fail = 0;
const ck = (l, c, d) => { c ? pass++ : fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c ? "" : "  → " + JSON.stringify(d).slice(0, 300)}`); };
async function call(p, input, get) {
  const url = B + p + (get ? `?input=${encodeURIComponent(JSON.stringify({ json: input }))}` : "");
  const r = await fetch(url, { method: get ? "GET" : "POST", headers: { "content-type": "application/json", cookie }, body: get ? undefined : JSON.stringify({ json: input ?? null }) });
  for (const c of r.headers.getSetCookie()) if (c.startsWith("gridbox_sid=")) cookie = c.split(";")[0];
  const j = await r.json(); return j.error ? { err: j.error.json.message } : j.result.data.json;
}
await call("account.login", { username: "boss", password: "BossPass!2026" });
const dir = process.env.HOME + "/2026ai/";
const file = (k) => fs.readFileSync(dir + fs.readdirSync(dir).find((f) => f.startsWith("商品銷售_明細") && f.includes(k)), "utf8");
// 1. 未有租約先匯入 2–6 月 同 7 月
await call("shop.admin.importPosSales", { csvText: file("2026-02-01"), saleDate: "2026-06-29" });
await call("shop.admin.importPosSales", { csvText: file("2026-07-01"), saleDate: "2026-07-30" });
const grids = await call("shop.admin.listGrids", undefined, true);
const g038 = grids.find((g) => g.code === "038").id;
const chris = await call("shop.admin.createTenant", { name: "Chris" });
const before = (await call("shop.admin.listSales", { gridId: g038 }, true));
ck("建租約前：038 有 2 筆、未計入租戶", before.length === 2 && before.every((r) => r.tenantId == null), before.map((r) => [r.saleDate, r.tenantId]));
// 2. 建租約 2026-03-03 → 2027-03-31（同 Chris 一樣）
const lease = await call("shop.admin.createLease", { gridId: g038, tenantId: chris, startDate: "2026-03-03", endDate: "2027-03-31", rentFreeDays: 84, monthlyRent: 700, deposit: 700 });
ck("建租約後自動配對 2 筆（06-29 同 07-30）", lease.assigned === 2, lease);
const rep = await call("shop.admin.tenantSalesReport", { from: "2026-01-01", to: "2026-12-31" }, true);
const c = rep.groups.find((g) => g.name === "Chris");
ck("租戶銷售報表：Chris $5,200 + $1,500 = $6,700", c?.amount === 6700, c);
// 3. 改租約開始日去 07-01 → 06-29 嗰筆撤回
const upd = await call("shop.admin.updateLease", { id: lease.id, startDate: "2026-07-01" });
const after = await call("shop.admin.listSales", { gridId: g038 }, true);
ck("改租約日期：期外 06-29 撤回、07-30 保留", after.find((r) => r.saleDate === "2026-06-29").tenantId == null && after.find((r) => r.saleDate === "2026-07-30").tenantId === chris, after.map((r) => [r.saleDate, r.tenantId]));
// 4. 有租約之後再匯入 8 月 → 直接計入
const aug = await call("shop.admin.importPosSales", { csvText: file("2026-08-01"), saleDate: "2026-08-31" });
const augRows = (await call("shop.admin.listSales", { gridId: g038, from: "2026-08-01", to: "2026-08-31" }, true));
ck("租約期間內匯入 8 月 → 038 直接計入 Chris", augRows.length === 1 && augRows[0].tenantId === chris, augRows);
// 5. 手動重新配對（冇嘢要配）
const again = await call("shop.admin.assignSalesToLeases");
ck("重新配對可以重複執行（0 筆）", again.assigned === 0, again);
console.log(`  → ${pass} 通過 / ${fail} 失敗`);
