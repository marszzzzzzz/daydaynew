// 修改租約 API 測試（空資料庫、OWNER_USERNAME=boss OWNER_PASSWORD=BossPass!2026 嘅 server）：node scripts/lease-edit-test.mjs
const B = "http://localhost:3200/api/trpc/";
let pass = 0, fail = 0;
const ck = (l, c, d) => { c ? pass++ : fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c ? "" : "  → " + JSON.stringify(d).slice(0, 250)}`); };
function client() { let cookie = ""; return async (p, input, get) => {
  const url = B + p + (get ? `?input=${encodeURIComponent(JSON.stringify({ json: input }))}` : "");
  const r = await fetch(url, { method: get ? "GET" : "POST", headers: { "content-type": "application/json", cookie }, body: get ? undefined : JSON.stringify({ json: input ?? null }) });
  for (const c of r.headers.getSetCookie()) if (c.startsWith("gridbox_sid=")) cookie = c.split(";")[0];
  const j = await r.json(); return j.error ? { err: j.error.json.message, code: j.error.json.data?.code } : j.result.data.json; }; }

const boss = client();
await boss("account.login", { username: "boss", password: "BossPass!2026" });
const grid = (await boss("shop.admin.listGrids", undefined, true)).find((g) => g.code === "017");
const tid = await boss("shop.admin.createTenant", { name: "tinyu" });
const { id } = await boss("shop.admin.createLease", { gridId: grid.id, tenantId: tid, startDate: "2026-08-06", endDate: "2026-11-05", rentFreeDays: 21, monthlyRent: 700, deposit: 0, note: "原本" });
const get = async () => (await boss("shop.admin.listLeases", undefined, true)).find((l) => l.id === id);

const r = await boss("shop.admin.updateLease", { id, endDate: "2026-11-27", rentFreeDays: 22, monthlyRent: 750, deposit: 1400, note: "免租加喺尾" });
let l = await get();
ck("直接改結束日、免租期、月租、按金、備註", r.ok && l.endDate === "2026-11-27" && l.rentFreeDays === 22 && Number(l.monthlyRent) === 750 && Number(l.deposit) === 1400 && l.note === "免租加喺尾", l);
ck("修改唔會改租約狀態同格仔", l.status === "active" && l.gridCode === "017" && l.tenantName === "tinyu", l);
await boss("shop.admin.updateLease", { id, note: "" });
ck("備註可以清空", (await get()).note === "", (await get()).note);

const bad1 = await boss("shop.admin.updateLease", { id, startDate: "2026-12-01", endDate: "2026-11-01" });
ck("結束日早過開始日 → 拒絕", bad1.code === "BAD_REQUEST" && /結束日期/.test(bad1.err), bad1);
const bad2 = await boss("shop.admin.updateLease", { id, endDate: "2026-08-01" });
ck("只改結束日但早過現有開始日 → 拒絕", bad2.code === "BAD_REQUEST", bad2);
const bad3 = await boss("shop.admin.updateLease", { id, startDate: "2026-12-31" });
ck("只改開始日但遲過現有結束日 → 拒絕", bad3.code === "BAD_REQUEST", bad3);
ck("被拒之後原本資料冇變", (await get()).endDate === "2026-11-27" && (await get()).startDate === "2026-08-06", await get());
const missing = await boss("shop.admin.updateLease", { id: 999999, note: "x" });
ck("租約唔存在 → NOT_FOUND", missing.code === "NOT_FOUND", missing);
const neg = await boss("shop.admin.updateLease", { id, monthlyRent: -1 });
ck("月租負數 → 拒絕", !!neg.err, neg);

await boss("account.createAccount", { username: "staff7", password: "staff123", name: "店員", role: "staff" });
const staff = client();
await staff("account.login", { username: "staff7", password: "staff123" });
const st = await staff("shop.admin.updateLease", { id, note: "店員改" });
ck("店員改租約 → FORBIDDEN", st.code === "FORBIDDEN", st);
console.log(`  → ${pass} 通過 / ${fail} 失敗`);
