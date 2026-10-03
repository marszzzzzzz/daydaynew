// 租戶走勢圖 API 測試（先行 scripts/tenant-multigrid-test.mjs 準備 chris 租戶）
const B = "http://localhost:3200/api/trpc/";
let cookie = "", pass = 0, fail = 0;
const ck = (l, c, d) => { c ? pass++ : fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c ? "" : "  → " + JSON.stringify(d).slice(0, 300)}`); };
async function call(p, input, get) {
  const url = B + p + (get ? `?input=${encodeURIComponent(JSON.stringify({ json: input }))}` : "");
  const r = await fetch(url, { method: get ? "GET" : "POST", headers: { "content-type": "application/json", cookie }, body: get ? undefined : JSON.stringify({ json: input ?? null }) });
  for (const c of r.headers.getSetCookie()) if (c.startsWith("gridbox_sid=")) cookie = c.split(";")[0];
  const j = await r.json(); return j.error ? { err: j.error.json.message } : j.result.data.json;
}
// 走勢圖要店主先批准
await call("account.login", { username: "boss", password: "BossPass!2026" });
const ts = await call("shop.admin.listTenants", undefined, true);
await call("shop.admin.setTenantAnalytics", { id: ts.find((x) => x.name === "Chris").id, enabled: true });
cookie = "";
await call("account.login", { username: "chris", password: "chris123" });
const m = await call("shop.myTrend", { granularity: "month", from: "2025-09-01", to: "2026-08-31" }, true);
ck("月：12 個時段（包括冇銷售）", m.buckets.length === 12, m.buckets.map((b) => b.key));
ck("月：總數 = $16,310（038 $9,460 + 045 $6,850）", m.totalAmount === 16310 && m.buckets.reduce((a, b) => a + b.amount, 0) === 16310, m.totalAmount);
ck("月：6 月 $12,050、7 月 $1,500、8 月 $2,760", m.buckets.find((b) => b.key === "2026-06-01").amount === 12050 && m.buckets.find((b) => b.key === "2026-07-01").amount === 1500 && m.buckets.find((b) => b.key === "2026-08-01").amount === 2760, m.buckets.filter((b) => b.amount).map((b) => [b.key, b.amount]));
ck("頭 5 位貨品按金額排、最多 5 個", m.topProducts.length <= 5 && m.topProducts.every((p, i, a) => !i || a[i - 1].amount >= p.amount), m.topProducts);
ck("每個時段嘅 top 數值同貨品明細一致", m.buckets.every((b) => b.top.every((v, i) => v === (b.items.find((it) => it.name === m.topProducts[i].name)?.amount ?? 0))), null);
ck("每個時段明細加埋 = 時段總數", m.buckets.every((b) => Math.abs(b.items.reduce((a, it) => a + it.amount, 0) - b.amount) < 0.01), null);
const w = await call("shop.myTrend", { granularity: "week", from: "2026-06-01", to: "2026-06-30" }, true);
ck("週（下鑽 6 月）：時段由星期一開始、總數 $12,050", w.totalAmount === 12050 && w.buckets[0].key === "2026-06-01" && w.buckets.every((b) => new Date(b.key + "T00:00:00Z").getUTCDay() === 1), w.buckets.map((b) => [b.key, b.from, b.to, b.amount]));
ck("週：第一同最後時段剪返落期間入面", w.buckets.at(-1).to === "2026-06-30", w.buckets.at(-1));
const dd = await call("shop.myTrend", { granularity: "day", from: "2026-06-29", to: "2026-07-05" }, true);
ck("日（下鑽 1 週）：7 個時段、06-29 = $12,050", dd.buckets.length === 7 && dd.buckets[0].amount === 12050, dd.buckets.map((b) => [b.key, b.amount]));
const g = await call("shop.myTrend", { granularity: "month", from: "2025-09-01", to: "2026-08-31", gridCode: "038" }, true);
ck("格仔 038 篩選 = $9,460", g.totalAmount === 9460, g.totalAmount);
const steal = await call("shop.myTrend", { granularity: "month", from: "2025-09-01", to: "2026-08-31", gridCode: "024" }, true);
ck("揀人哋格仔 024 → $0（睇唔到人哋）", steal.totalAmount === 0, steal.totalAmount);
const big = await call("shop.myTrend", { granularity: "day", from: "2025-01-01", to: "2026-08-31" }, true);
ck("按日但期間太長 → 中文錯誤", big.err && /期間太長/.test(big.err), big);
cookie = "";
const anon = await call("shop.myTrend", { granularity: "month", from: "2026-01-01", to: "2026-08-31" }, true);
ck("未登入 → 拒絕", !!anon.err, anon);
console.log(`  → ${pass} 通過 / ${fail} 失敗`);
