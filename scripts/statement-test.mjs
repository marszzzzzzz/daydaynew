// 租戶月結單 API 測試（空資料庫、OWNER_USERNAME=boss OWNER_PASSWORD=BossPass!2026 嘅 server）：node scripts/statement-test.mjs
const ORIGIN = "http://localhost:3200";
const B = ORIGIN + "/api/trpc/";
let pass = 0, fail = 0;
const ck = (l, c, d) => { c ? pass++ : fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c ? "" : "  → " + JSON.stringify(d).slice(0, 600)}`); };
function client() { let cookie = ""; return async (p, input, get) => {
  const url = B + p + (get ? `?input=${encodeURIComponent(JSON.stringify({ json: input }))}` : "");
  const r = await fetch(url, { method: get ? "GET" : "POST", headers: { "content-type": "application/json", cookie }, body: get ? undefined : JSON.stringify({ json: input ?? null }) });
  for (const c of r.headers.getSetCookie()) if (c.startsWith("gridbox_sid=")) cookie = c.split(";")[0];
  const j = await r.json(); return j.error ? { err: j.error.json.message, code: j.error.json.data?.code } : j.result.data.json; }; }

const anon = client(), boss = client(), staff = client();
await boss("account.login", { username: "boss", password: "BossPass!2026" });
const grids = await boss("shop.admin.listGrids", undefined, true);
const gid = (c) => grids.find((g) => g.code === c).id;
const sale = (g, name, qty, price, date) => boss("shop.admin.createSale", { gridId: gid(g), productName: name, quantity: qty, unitPrice: price, saleDate: date });
const preview = (tenantId, month) => boss("shop.admin.statementPreview", { tenantId, month }, true);
const line = (p, code) => p.live.lines.find((l) => l.gridCode === code);

const A = await boss("shop.admin.createTenant", { name: "陳小姐" });
const Bt = await boss("shop.admin.createTenant", { name: "Chris" });
await boss("shop.admin.createLease", { gridId: gid("001"), tenantId: A, startDate: "2026-03-03", endDate: "2027-02-28", rentFreeDays: 0, monthlyRent: 500, deposit: 500 });
// 002：2026-10-01 起、免租 31 日 → 10 月整月免租
await boss("shop.admin.createLease", { gridId: gid("002"), tenantId: A, startDate: "2026-10-01", endDate: "2027-03-31", rentFreeDays: 31, monthlyRent: 700, deposit: 700 });
await boss("shop.admin.createLease", { gridId: gid("003"), tenantId: Bt, startDate: "2026-03-03", endDate: "2027-02-28", rentFreeDays: 0, monthlyRent: 500, deposit: 500 });
await sale("001", "髮夾", 10, 40, "2026-10-05");   // 400
await sale("001", "手作皂", 20, 30, "2026-10-31");  // 600（月尾最後一日要計）
await sale("001", "髮圈", 1, 50, "2026-11-01");     // 50（下個月，唔計）
await sale("001", "舊貨", 1, 77, "2026-09-30");     // 77（上個月，唔計）
await sale("002", "布偶", 5, 50, "2026-10-12");     // 250
await sale("003", "背包", 3, 300, "2026-10-20");    // 900（另一個租戶）

const p1 = await preview(A, "2026-10");
ck("格仔 001：銷售 $1,000、payroll = 銷售 100%、租金 $500、payback = 銷售", JSON.stringify(line(p1, "001")) === JSON.stringify({ gridId: gid("001"), gridCode: "001", leaseId: line(p1, "001").leaseId, sales: 1000, payroll: 1000, rent: 500, rentState: "missing", payback: 1000 }), line(p1, "001"));
ck("月頭月尾邊界：10/31 計入、11/01 同 9/30 唔計", line(p1, "001").sales === 1000, line(p1, "001"));
ck("格仔 002：整月免租 → 租金 $0（狀態免租），銷售 $250", line(p1, "002").sales === 250 && line(p1, "002").rent === 0 && line(p1, "002").rentState === "free" && line(p1, "002").payback === 250, line(p1, "002"));
ck("只列呢個租戶嘅格仔（唔包 Chris 嘅 003）", p1.live.lines.map((l) => l.gridCode).join() === "001,002", p1.live.lines);
ck("合計：銷售 1250、payroll 1250、租金 500、payback 1250", JSON.stringify(p1.live.totals) === JSON.stringify({ sales: 1250, payroll: 1250, rent: 500, payback: 1250 }), p1.live.totals);
ck("未確認：confirmed = null、冇變動提示", p1.confirmed === null && p1.changedSince === false && p1.payrollRate === 100, p1);
const none = await preview(A, "2026-01");
ck("冇銷售亦冇生效租約嘅月份 → 空", none.live.lines.length === 0, none.live);

// 確認
const c1 = await boss("shop.admin.confirmStatement", { tenantId: A, month: "2026-10" });
ck("確認月結單 → 回傳 payback 合計", c1.totals?.payback === 1250 && typeof c1.id === "number", c1);
const p2 = await preview(A, "2026-10");
ck("確認後預覽見到存低嗰份（連租戶名、比例、明細）", p2.confirmed?.totals.payback === 1250 && p2.confirmed.tenantName === "陳小姐" && p2.confirmed.payrollRate === 100 && p2.confirmed.lines.length === 2 && p2.changedSince === false, p2.confirmed);

// 凍結：之後補錄銷售，存低嗰份唔變
await sale("001", "補錄貨", 1, 100, "2026-10-15");
const p3 = await preview(A, "2026-10");
ck("確認之後補錄銷售 → 存低嘅月結單唔變（payback 仍然 $1,250）", p3.confirmed.totals.payback === 1250 && line({ live: p3.confirmed }, "001").sales === 1000, p3.confirmed);
ck("實時計出 $1,350，並提示「確認之後數字有變」", p3.live.totals.payback === 1350 && p3.changedSince === true, [p3.live.totals, p3.changedSince]);
ck("再確認同一個月 → CONFLICT（要先撤銷）", (await boss("shop.admin.confirmStatement", { tenantId: A, month: "2026-10" })).code === "CONFLICT", null);

// 租金收咗唔當郁數
const Bp = await preview(Bt, "2026-10");
await boss("shop.admin.confirmStatement", { tenantId: Bt, month: "2026-10" });
await boss("shop.admin.confirmLeaseMonth", { leaseId: (await boss("shop.admin.listLeases", undefined, true)).find((l) => l.gridCode === "003").id, month: "2026-10" });
ck("確認之後先收租 → 唔算郁過數（冇變動提示）", (await preview(Bt, "2026-10")).changedSince === false && Bp.live.totals.payback === 900, await preview(Bt, "2026-10"));

// 列表：每個租戶每月 payback 總數
const list = await boss("shop.admin.listStatements", {}, true);
ck("列表有兩張（陳小姐、Chris）10 月，帶 payback 總數", list.length === 2 && list.find((r) => r.tenantName === "陳小姐").totalPayback === "1250.00" && list.find((r) => r.tenantName === "Chris").totalPayback === "900.00", list);
ck("列表可以按租戶篩", (await boss("shop.admin.listStatements", { tenantId: Bt }, true)).length === 1, null);

// 撤銷 → 重新計 → 再確認
const del = await boss("shop.admin.deleteStatement", { id: c1.id });
ck("撤銷月結單", del.ok === true && (await preview(A, "2026-10")).confirmed === null, del);
const c2 = await boss("shop.admin.confirmStatement", { tenantId: A, month: "2026-10" });
ck("撤銷後重新確認 → 用最新數字（$1,350）", c2.totals.payback === 1350, c2);

// 同時確認：只可以成功一張
const D = await boss("shop.admin.createTenant", { name: "同時確認測試" });
await boss("shop.admin.createLease", { gridId: gid("004"), tenantId: D, startDate: "2026-03-03", endDate: "2027-02-28", rentFreeDays: 0, monthlyRent: 500, deposit: 500 });
await sale("004", "貨", 1, 10, "2026-10-10");
const race = await Promise.all([boss("shop.admin.confirmStatement", { tenantId: D, month: "2026-10" }), boss("shop.admin.confirmStatement", { tenantId: D, month: "2026-10" })]);
ck("兩個視窗同時確認 → 一張成功、一張 CONFLICT，只存一張", race.filter((r) => r.id).length === 1 && race.filter((r) => r.code === "CONFLICT").length === 1 && (await boss("shop.admin.listStatements", { tenantId: D }, true)).length === 1, race);

// 錯誤輸入
ck("未到嘅月份 → BAD_REQUEST", (await boss("shop.admin.confirmStatement", { tenantId: A, month: "2099-01" })).code === "BAD_REQUEST", null);
ck("冇可以結算嘅月份 → BAD_REQUEST", (await boss("shop.admin.confirmStatement", { tenantId: A, month: "2026-01" })).code === "BAD_REQUEST", null);
ck("唔存在嘅租戶 → NOT_FOUND", (await boss("shop.admin.confirmStatement", { tenantId: 99999, month: "2026-10" })).code === "NOT_FOUND" && (await boss("shop.admin.statementPreview", { tenantId: 99999, month: "2026-10" }, true)).code === "NOT_FOUND", null);
ck("月份格式唔啱 → BAD_REQUEST", (await boss("shop.admin.confirmStatement", { tenantId: A, month: "2026-1" })).code === "BAD_REQUEST", null);

// 權限
const gate = async (c) => [(await c("shop.admin.statementPreview", { tenantId: A, month: "2026-10" }, true)).code, (await c("shop.admin.confirmStatement", { tenantId: A, month: "2026-09" })).code, (await c("shop.admin.deleteStatement", { id: 1 })).code, (await c("shop.admin.listStatements", {}, true)).code];
ck("未登入 → 全部 UNAUTHORIZED", (await gate(anon)).every((c) => c === "UNAUTHORIZED"), await gate(anon));
await boss("account.createAccount", { username: "staff7", password: "staff123", name: "店員", role: "staff" });
await staff("account.login", { username: "staff7", password: "staff123" });
ck("店員（唔係店主）→ 全部 FORBIDDEN", (await gate(staff)).every((c) => c === "FORBIDDEN"), await gate(staff));

console.log(`  → ${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
