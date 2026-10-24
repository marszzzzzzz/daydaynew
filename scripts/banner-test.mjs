// 「最新宣傳」浮動橫幅 API 測試（空資料庫、OWNER_USERNAME=boss OWNER_PASSWORD=BossPass!2026 嘅 server）：node scripts/banner-test.mjs
const B = "http://localhost:3200/api/trpc/";
let pass = 0, fail = 0;
const ck = (l, c, d) => { c ? pass++ : fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c ? "" : "  → " + JSON.stringify(d).slice(0, 250)}`); };
function client() { let cookie = ""; return async (p, input, get) => {
  const url = B + p + (get ? `?input=${encodeURIComponent(JSON.stringify({ json: input }))}` : "");
  const r = await fetch(url, { method: get ? "GET" : "POST", headers: { "content-type": "application/json", cookie }, body: get ? undefined : JSON.stringify({ json: input ?? null }) });
  for (const c of r.headers.getSetCookie()) if (c.startsWith("gridbox_sid=")) cookie = c.split(";")[0];
  const j = await r.json(); return j.error ? { err: j.error.json.message, code: j.error.json.data?.code } : j.result.data.json; }; }
const hk = (d = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong" }).format(new Date(Date.now() + d * 86400000));

const anon = client();
const boss = client();
await boss("account.login", { username: "boss", password: "BossPass!2026" });
ck("未設定 → 公開頁冇橫幅", (await anon("banner.current", undefined, true)) === null, null);
const empty = await boss("banner.get", undefined, true);
ck("後台未設定 → 預設關閉、version 0", empty.enabled === false && empty.version === 0, empty);

const base = { enabled: true, title: "十月新租戶優惠", body: "首月免租 7 日，名額有限", linkUrl: "https://wa.me/85291234567", linkLabel: "WhatsApp 查詢", startDate: "", endDate: "" };
const s1 = await boss("banner.save", base);
ck("店主儲存 → version 1", s1.version === 1, s1);
const pub = await anon("banner.current", undefined, true);
ck("公開頁見到標題、內容、按鈕", pub?.title === base.title && pub.body === base.body && pub.linkUrl === base.linkUrl && pub.linkLabel === base.linkLabel && pub.version === 1, pub);
ck("公開資料唔包括後台欄位", pub && !("updatedBy" in pub) && !("enabled" in pub), pub);

const s2 = await boss("banner.save", { ...base, title: "十一月優惠" });
ck("再儲存 → version 2（訪客之前閂咗會再見到）", s2.version === 2 && (await anon("banner.current", undefined, true)).title === "十一月優惠", s2);

await boss("banner.save", { ...base, enabled: false });
ck("關閉 → 公開頁冇橫幅", (await anon("banner.current", undefined, true)) === null, null);
ck("關閉後後台內容保留", (await boss("banner.get", undefined, true)).title === base.title, null);

await boss("banner.save", { ...base, startDate: hk(1) });
ck("開始日喺聽日 → 今日未顯示", (await anon("banner.current", undefined, true)) === null, null);
await boss("banner.save", { ...base, startDate: hk(-3), endDate: hk(-1) });
ck("結束日係尋日 → 已過期唔顯示", (await anon("banner.current", undefined, true)) === null, null);
await boss("banner.save", { ...base, startDate: hk(), endDate: hk() });
ck("開始同結束都係今日（香港時間）→ 顯示", (await anon("banner.current", undefined, true))?.title === base.title, null);

const xss = await boss("banner.save", { ...base, linkUrl: "javascript:alert(1)" });
ck("javascript: 連結 → 拒絕", xss.code === "BAD_REQUEST", xss);
const badDates = await boss("banner.save", { ...base, startDate: "2026-12-01", endDate: "2026-11-01" });
ck("結束日早過開始日 → 拒絕", badDates.code === "BAD_REQUEST", badDates);
ck("被拒之後公開內容冇變", (await anon("banner.current", undefined, true))?.linkUrl === base.linkUrl, null);

await boss("account.createAccount", { username: "staff5", password: "staff123", name: "店員", role: "staff" });
const staff = client();
await staff("account.login", { username: "staff5", password: "staff123" });
ck("店員改橫幅 → FORBIDDEN", (await staff("banner.save", base)).code === "FORBIDDEN", null);
ck("未登入改橫幅 → UNAUTHORIZED", (await anon("banner.save", base)).code === "UNAUTHORIZED", null);
ck("未登入讀後台設定 → UNAUTHORIZED", (await anon("banner.get", undefined, true)).code === "UNAUTHORIZED", null);
console.log(`  → ${pass} 通過 / ${fail} 失敗`);
