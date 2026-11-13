// 租約逐月租金確認 API 測試（空資料庫、OWNER_USERNAME=boss OWNER_PASSWORD=BossPass!2026 嘅 server）：node scripts/lease-rent-test.mjs
const ORIGIN = "http://localhost:3200";
const B = ORIGIN + "/api/trpc/";
let pass = 0, fail = 0;
const ck = (l, c, d) => { c ? pass++ : fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c ? "" : "  → " + JSON.stringify(d).slice(0, 500)}`); };
function client() { let cookie = ""; return async (p, input, get) => {
  const url = B + p + (get ? `?input=${encodeURIComponent(JSON.stringify({ json: input }))}` : "");
  const r = await fetch(url, { method: get ? "GET" : "POST", headers: { "content-type": "application/json", cookie }, body: get ? undefined : JSON.stringify({ json: input ?? null }) });
  for (const c of r.headers.getSetCookie()) if (c.startsWith("gridbox_sid=")) cookie = c.split(";")[0];
  const j = await r.json(); return j.error ? { err: j.error.json.message, code: j.error.json.data?.code } : j.result.data.json; }; }

const anon = client(), boss = client(), staff = client();
await boss("account.login", { username: "boss", password: "BossPass!2026" });
const overview = async () => boss("shop.admin.leaseRentOverview", undefined, true);
const item = async (leaseId) => (await overview()).items.find((i) => i.leaseId === leaseId);
const month = (it, m) => it.months.find((x) => x.month === m);

const grids = await boss("shop.admin.listGrids", undefined, true);
const tid = await boss("shop.admin.createTenant", { name: "陳小姐" });
// 租約 2026-03-03 → 2026-08-31，免租 84 日（免租到 2026-05-25）→ 3、4 月整月免租
const lease = await boss("shop.admin.createLease", { gridId: grids.find((g) => g.code === "001").id, tenantId: tid, startDate: "2026-03-03", endDate: "2026-08-31", rentFreeDays: 84, monthlyRent: 500, deposit: 500 });
const lid = lease.id ?? lease;

const first = await overview();
const a = first.items.find((i) => i.leaseId === lid);
ck("回傳而家月份（香港時間）", /^\d{4}-\d{2}$/.test(first.currentMonth), first.currentMonth);
ck("租約期內逐月列出：6 個月（03–08）", a.months.map((m) => m.month).join() === "2026-03,2026-04,2026-05,2026-06,2026-07,2026-08", a.months.map((m) => m.month));
ck("整月免租：3、4 月；其餘未開單", a.months.map((m) => m.state).join() === "free,free,missing,missing,missing,missing", a.months.map((m) => m.state));
ck("未開單嘅月份預期金額 = 租約月租", month(a, "2026-06").amount === 500 && month(a, "2026-03").amount === 0, a.months);
ck("摘要：6 個月、2 免租、4 要收、0 已確認", a.summary.totalMonths === 6 && a.summary.freeMonths === 2 && a.summary.collectableMonths === 4 && a.summary.confirmedMonths === 0, a.summary);
const dueUnconfirmed = a.months.filter((m) => m.due && (m.state === "missing" || m.state === "unpaid"));
ck("到期未收月數 = 已到期而未確認嘅月份", a.summary.overdueMonths === dueUnconfirmed.length && a.summary.overdueAmount === dueUnconfirmed.length * 500, [a.summary, dueUnconfirmed.length]);

// 確認：未開單 → 自動開單 + 已收
const c1 = await boss("shop.admin.confirmLeaseMonth", { leaseId: lid, month: "2026-05", paidAt: "2026-05-28" });
ck("確認未開單嘅月份 → 自動開單並標記已收", c1.ok === true && c1.created === true, c1);
const b = await item(lid);
ck("該月變已收、金額 = 月租、收款日照填", month(b, "2026-05").state === "paid" && month(b, "2026-05").amount === 500 && month(b, "2026-05").paidAt === "2026-05-28", month(b, "2026-05"));
ck("已確認 1 個月、$500", b.summary.confirmedMonths === 1 && b.summary.confirmedAmount === 500, b.summary);
const rent = await boss("shop.admin.listRent", { month: "2026-05" }, true);
ck("租金頁（04）睇到呢張新開嘅租金單", rent.some((r) => r.leaseId === lid && r.type === "rent" && r.status === "paid" && r.amount === "500.00"), rent);

const c2 = await boss("shop.admin.confirmLeaseMonth", { leaseId: lid, month: "2026-05", paidAt: "2026-09-09" });
ck("重複確認 → 唔會開多張單、唔會改收款日", c2.created === false && month(await item(lid), "2026-05").paidAt === "2026-05-28" && (await boss("shop.admin.listRent", { month: "2026-05" }, true)).length === 1, c2);

// 已開單未收 → 確認
const unpaidId = await boss("shop.admin.createRentRecord", { leaseId: lid, month: "2026-06", type: "rent", amount: 480 });
ck("已開單未收嘅月份顯示未收（用單上金額）", month(await item(lid), "2026-06").state === "unpaid" && month(await item(lid), "2026-06").amount === 480, month(await item(lid), "2026-06"));
const c3 = await boss("shop.admin.confirmLeaseMonth", { leaseId: lid, month: "2026-06" });
const jun = month(await item(lid), "2026-06");
ck("確認已開單嘅月份 → 同一張單變已收（唔重開、保留單上金額）", c3.created === false && jun.state === "paid" && jun.amount === 480 && jun.recordId === (unpaidId.id ?? unpaidId), [c3, jun]);
ck("收款日預設用今日（香港日期）", /^\d{4}-\d{2}-\d{2}$/.test(jun.paidAt), jun);

// 改回未收
await boss("shop.admin.markRentUnpaid", { id: jun.recordId });
ck("改回未收之後該月回到未收、已確認數減少", month(await item(lid), "2026-06").state === "unpaid" && (await item(lid)).summary.confirmedMonths === 1, await item(lid));

// 租約期外嘅單
await boss("shop.admin.createRentRecord", { leaseId: lid, month: "2026-02", type: "rent", amount: 500 });
const d = await item(lid);
ck("租約期外嘅租金單唔入逐月表，但有計數提示", d.months.length === 6 && d.summary.outsideRecords === 1, d.summary);
await boss("shop.admin.createRentRecord", { leaseId: lid, month: "2026-05", type: "deposit", amount: 1000 });
ck("按金唔當月租（唔影響逐月表）", month(await item(lid), "2026-05").amount === 500, month(await item(lid), "2026-05"));

// 錯誤輸入
ck("月份唔喺租約期內 → BAD_REQUEST", (await boss("shop.admin.confirmLeaseMonth", { leaseId: lid, month: "2026-09" })).code === "BAD_REQUEST", null);
ck("租約開始前嘅月份 → BAD_REQUEST", (await boss("shop.admin.confirmLeaseMonth", { leaseId: lid, month: "2026-02" })).code === "BAD_REQUEST", null);
ck("唔存在嘅租約 → NOT_FOUND", (await boss("shop.admin.confirmLeaseMonth", { leaseId: 99999, month: "2026-05" })).code === "NOT_FOUND", null);
ck("月份格式唔啱 → BAD_REQUEST", (await boss("shop.admin.confirmLeaseMonth", { leaseId: lid, month: "2026-5" })).code === "BAD_REQUEST", null);
ck("收款日格式唔啱 → BAD_REQUEST", (await boss("shop.admin.confirmLeaseMonth", { leaseId: lid, month: "2026-07", paidAt: "9/9/2026" })).code === "BAD_REQUEST", null);

// 租約日期改咗 → 逐月表跟住變
await boss("shop.admin.updateLease", { id: lid, endDate: "2026-10-31" });
ck("修改租約結束日期 → 逐月表加返 9、10 月", (await item(lid)).months.length === 8, (await item(lid)).months.map((m) => m.month));
// 終止租約後仍然睇到
await boss("shop.admin.endLease", { id: lid });
ck("終止咗嘅租約仍然列出（睇返歷史）", !!(await item(lid)) && (await item(lid)).summary.confirmedMonths >= 1, await item(lid));

// 權限
ck("未登入 → UNAUTHORIZED", (await anon("shop.admin.leaseRentOverview", undefined, true)).code === "UNAUTHORIZED" && (await anon("shop.admin.confirmLeaseMonth", { leaseId: lid, month: "2026-05" })).code === "UNAUTHORIZED", null);
await boss("account.createAccount", { username: "staff7", password: "staff123", name: "店員", role: "staff" });
await staff("account.login", { username: "staff7", password: "staff123" });
ck("店員（唔係店主）→ FORBIDDEN", (await staff("shop.admin.leaseRentOverview", undefined, true)).code === "FORBIDDEN" && (await staff("shop.admin.confirmLeaseMonth", { leaseId: lid, month: "2026-07" })).code === "FORBIDDEN", null);

console.log(`  → ${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
