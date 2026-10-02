// 租戶銷售情況端到端測試（空資料庫、boss 店主；會讀 ~/2026ai 嘅 POS 檔）：node scripts/tenant-sales-test.mjs
import fs from "node:fs";
const B = "http://localhost:3200/api/trpc/";
let cookie = "", pass = 0, fail = 0;
const ck = (l, c, d) => { c ? pass++ : fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c ? "" : "  → " + JSON.stringify(d).slice(0, 300)}`); };
async function call(p, input, get) {
  const url = B + p + (get ? `?input=${encodeURIComponent(JSON.stringify({ json: input }))}` : "");
  const r = await fetch(url, { method: get ? "GET" : "POST", headers: { "content-type": "application/json", cookie }, body: get ? undefined : JSON.stringify({ json: input ?? null }) });
  for (const c of r.headers.getSetCookie()) if (c.startsWith("gridbox_sid=")) cookie = c.split(";")[0];
  const j = await r.json();
  return j.error ? { err: j.error.json.message, code: j.error.json.data?.code } : j.result.data.json;
}
await call("account.login", { username: "boss", password: "BossPass!2026" });
const grids = await call("shop.admin.listGrids", undefined, true);
const gid = (c) => grids.find((g) => g.code === c).id;
const t1 = await call("shop.admin.createTenant", { name: "測試租戶A" });
const t2 = await call("shop.admin.createTenant", { name: "測試租戶B" });
const t3 = await call("shop.admin.createTenant", { name: "冇生意租戶C" });
await call("shop.admin.createLease", { gridId: gid("004"), tenantId: t1, startDate: "2026-01-01", endDate: "2026-12-31", rentFreeDays: 0, monthlyRent: 700, deposit: 700 });
await call("shop.admin.createLease", { gridId: gid("024"), tenantId: t2, startDate: "2026-01-01", endDate: "2026-12-31", rentFreeDays: 0, monthlyRent: 700, deposit: 700 });
await call("shop.admin.createLease", { gridId: gid("050"), tenantId: t3, startDate: "2026-01-01", endDate: "2026-12-31", rentFreeDays: 0, monthlyRent: 500, deposit: 500 });
const files = fs.readdirSync(process.env.HOME + "/2026ai").filter((f) => f.startsWith("商品銷售_明細"));
for (const f of files) {
  const csvText = fs.readFileSync(process.env.HOME + "/2026ai/" + f, "utf8");
  const pre = await call("shop.admin.importPosSales", { csvText, saleDate: "2026-01-01", dryRun: true });
  const date = { "2026-02-01": "2026-06-29", "2026-07-01": "2026-07-30", "2026-08-01": "2026-08-31", "2026-09-01": "2026-09-29" }[pre.period?.start] ?? pre.saleDate;
  const r = await call("shop.admin.importPosSales", { csvText, saleDate: date });
  console.log("  匯入", f.slice(18, 40), r.inserted ?? r.err);
}
const y = await call("shop.admin.tenantSalesReport", { from: "2026-01-01", to: "2026-12-31" }, true);
ck("全年總數 = 4 個 POS 檔合計 $128,568", y.totals.amount === 128568, y.totals);
ck("店舖直銷 $46,301", y.totals.directAmount === 46301, y.totals);
const A = y.groups.find((g) => g.name === "測試租戶A"), Bt = y.groups.find((g) => g.name === "測試租戶B"), C = y.groups.find((g) => g.name === "冇生意租戶C");
ck("租戶A（004）= $8,420（含 9 月 $840）", A?.amount === 8420 && A.grids.join() === "004", A);
ck("租戶B（024）= $15,270（含 9 月 $960）", Bt?.amount === 15270, Bt);
ck("冇銷售嘅租戶都列出（$0）", C && C.count === 0 && C.amount === 0 && C.monthlyRent === 500, C);
ck("未有租約嘅格仔獨立列出", y.groups.some((g) => g.kind === "grid" && g.name.includes("038")), y.groups.map((g) => g.name));
ck("排序：銷售額由高至低，直銷最尾", y.groups.at(-1).kind === "direct" && y.groups[0].amount >= y.groups[1].amount, y.groups.slice(0, 3).map((g) => [g.name, g.amount]));
ck("佔比加埋 ≈ 100%", Math.abs(y.groups.reduce((a, g) => a + g.share, 0) - 100) < 0.5, y.groups.reduce((a, g) => a + g.share, 0));
ck("熱賣貨品按金額排", A.topProducts[0].amount >= A.topProducts[1].amount, A.topProducts);
const aug = await call("shop.admin.tenantSalesReport", { from: "2026-08-01", to: "2026-08-31" }, true);
const augA = aug.groups.find((g) => g.name === "測試租戶A");
ck("8 月：租戶A $1,325，對上一期（7 月）$500", augA.amount === 1325 && augA.prevAmount === 500, augA);
ck("8 月比較期間 = 7 月 1–31 日", aug.prev.from === "2026-07-01" && aug.prev.to === "2026-07-31", aug.prev);
const sep = await call("shop.admin.tenantSalesReport", { from: "2026-09-01", to: "2026-09-30" }, true);
ck("9 月（30 日）比較期間 = 8 月 1–31 日", sep.prev.from === "2026-08-01" && sep.prev.to === "2026-08-31", sep.prev);
const q3 = await call("shop.admin.tenantSalesReport", { from: "2026-07-01", to: "2026-09-30" }, true);
ck("7–9 月比較 4–6 月", q3.prev.from === "2026-04-01" && q3.prev.to === "2026-06-30", q3.prev);
const ytd = await call("shop.admin.tenantSalesReport", { from: "2026-01-01", to: "2026-10-02" }, true);
ck("今年至今比較去年同期", ytd.prev.from === "2025-01-01" && ytd.prev.to === "2025-10-02", ytd.prev);
const bad = await call("shop.admin.tenantSalesReport", { from: "2026-09-01", to: "2026-08-01" }, true);
ck("開始日遲過結束日 → 錯誤", !!bad.err, bad);
await call("account.createAccount", { username: "staff1", password: "staff123", name: "店員", role: "staff" });
cookie = ""; await call("account.login", { username: "staff1", password: "staff123" });
const st = await call("shop.admin.tenantSalesReport", { from: "2026-01-01", to: "2026-12-31" }, true);
ck("店員睇唔到 → FORBIDDEN", st.code === "FORBIDDEN", st);
console.log(`  → ${pass} 通過 / ${fail} 失敗`);
