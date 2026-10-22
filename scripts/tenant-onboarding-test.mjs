// 租戶第一次登入引導 API 測試（空資料庫、OWNER_USERNAME=boss OWNER_PASSWORD=BossPass!2026 嘅 server）：node scripts/tenant-onboarding-test.mjs
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
const acc = await boss("account.createAccount", { username: "may", password: "start123", name: "May", role: "user" });
const tid = await boss("shop.admin.createTenant", { name: "May 手作" });
await boss("shop.admin.updateTenant", { id: tid, userId: acc.id });

const may = client();
await may("account.login", { username: "may", password: "start123" });
let me = await may("auth.me", undefined, true);
ck("新租戶第一次登入：onboardedAt = null（要顯示引導）", me.onboardedAt === null, me);
let items = await may("shop.myItems", {}, true);
ck("租戶專區回傳聯絡資料（未填 = 空）", items.contact && items.contact.phone === "" && items.contact.email === "", items.contact);

// 聯絡資料
const badPhone = await may("shop.updateMyContact", { phone: "123", email: "" });
ck("電話唔係 8 位 → 拒絕", badPhone.code === "BAD_REQUEST" && /8 位/.test(badPhone.err), badPhone);
const badEmail = await may("shop.updateMyContact", { phone: "", email: "abc" });
ck("電郵格式錯 → 拒絕", badEmail.code === "BAD_REQUEST", badEmail);
const saved = await may("shop.updateMyContact", { phone: "+852 9123-4567", email: " may@example.com " });
ck("儲存聯絡資料：電話統一格式", saved.phone === "9123 4567" && saved.email === "may@example.com", saved);
const t = (await boss("shop.admin.listTenants", undefined, true)).find((x) => x.id === tid);
ck("店主後台即刻見到新電話同電郵", t.phone === "9123 4567" && t.email === "may@example.com", t);
ck("租戶名唔會被改", t.name === "May 手作", t);

// 改密碼
const wrong = await may("account.changePassword", { currentPassword: "nope123", newPassword: "mine2026" });
ck("舊密碼錯 → 拒絕", wrong.code === "BAD_REQUEST" && /舊密碼/.test(wrong.err), wrong);
const same = await may("account.changePassword", { currentPassword: "start123", newPassword: "start123" });
ck("新密碼同舊一樣 → 拒絕", same.code === "BAD_REQUEST", same);
const short = await may("account.changePassword", { currentPassword: "start123", newPassword: "abc" });
ck("新密碼太短 → 拒絕", short.code === "BAD_REQUEST", short);
const changed = await may("account.changePassword", { currentPassword: "start123", newPassword: "mine2026" });
ck("改密碼成功", changed.ok === true, changed);
ck("改完之後仍然保持登入", !(await may("auth.me", undefined, true)).err, null);
const oldLogin = await client()("account.login", { username: "may", password: "start123" });
ck("舊密碼登入唔到", !!oldLogin.err, oldLogin);
const newLogin = await client()("account.login", { username: "may", password: "mine2026" });
ck("新密碼登入到", newLogin.ok === true, newLogin);

// 完成引導
const done = await may("account.completeOnboarding", undefined);
me = await may("auth.me", undefined, true);
ck("完成引導：記錄 onboardedAt", done.ok && typeof me.onboardedAt === "string", me.onboardedAt);
const again = await may("account.completeOnboarding", undefined);
const me2 = await may("auth.me", undefined, true);
ck("重複完成唔會改第一次完成時間", again.ok && me2.onboardedAt === me.onboardedAt, [me.onboardedAt, me2.onboardedAt]);

// 權限 / 未連結
const lone = client();
await lone("account.register", { username: "lone", password: "lone123", name: "未連結" });
const loneContact = await lone("shop.updateMyContact", { phone: "91234567", email: "" });
ck("未連結租戶檔案 → 唔可以改聯絡資料", loneContact.code === "NOT_FOUND", loneContact);
const anon = await client()("account.changePassword", { currentPassword: "x", newPassword: "abcdefg" });
ck("未登入改密碼 → UNAUTHORIZED", anon.code === "UNAUTHORIZED", anon);
console.log(`  → ${pass} 通過 / ${fail} 失敗`);
