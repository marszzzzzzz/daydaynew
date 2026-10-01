// 端到端 loop 測試（4 個 phase，要喺空資料庫行）：BASE=http://localhost:3000 node scripts/loop-test.mjs <1|2|3|4>
// Phase 2–4 需要 server 以 OWNER_USERNAME=boss OWNER_PASSWORD=BossPass!2026 啟動；Phase 3 要 DEMO_MODE=true；Phase 3/4 要設 COOKIE_FILE
// 端到端 loop 測試：node e2e.mjs <phase>
const BASE = process.env.BASE ?? "http://localhost:3200";
const phase = process.argv[2];
let pass = 0, fail = 0;

class Client {
  constructor(name) { this.name = name; this.cookie = ""; }
  async call(path, input, method) {
    const isQuery = method === "GET";
    const url = `${BASE}/api/trpc/${path}` + (isQuery && input !== undefined ? `?input=${encodeURIComponent(JSON.stringify({ json: input }))}` : "");
    const res = await fetch(url, {
      method: isQuery ? "GET" : "POST",
      headers: { "content-type": "application/json", cookie: this.cookie },
      body: isQuery ? undefined : JSON.stringify({ json: input ?? null }),
    });
    const sc = res.headers.getSetCookie?.() ?? [];
    for (const c of sc) {
      const kv = c.split(";")[0];
      if (kv.startsWith("gridbox_sid=")) this.cookie = kv.endsWith("=") ? "" : kv;
    }
    const body = await res.json().catch(() => ({}));
    if (body.error) return { ok: false, status: res.status, code: body.error.json?.data?.code, message: body.error.json?.message };
    return { ok: true, status: res.status, data: body.result?.data?.json, setCookie: sc.join(" | ") };
  }
  q(path, input) { return this.call(path, input, "GET"); }
  m(path, input) { return this.call(path, input, "POST"); }
}

function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}  →  ${JSON.stringify(detail).slice(0, 300)}`); }
}

const anon = new Client("anon");

if (phase === "1") {
  console.log("── Phase 1：正式模式（DEMO_MODE=false，未設店主）");
  const h = await anon.q("shop.dbHealth");
  check("dbHealth ok + 70 格 + 冇用戶", h.ok && h.data.ok && h.data.counts.grids === 70 && h.data.counts.users === 0, h);
  check("dbHealth 冇示範租戶", h.data?.counts?.tenants === 0, h.data?.counts);
  const cfg = await anon.q("account.config");
  check("config: demoMode=false, hasOwner=false", cfg.ok && cfg.data.demoMode === false && cfg.data.hasOwner === false, cfg);

  const first = new Client("first");
  const r1 = await first.m("account.register", { username: "FirstGuy", password: "secret123", name: "搶先註冊者" });
  check("第一個公開註冊 → 只係租客（唔再自動做店主）", r1.ok && r1.data.role === "user", r1);
  check("session cookie: HttpOnly + SameSite=Lax", /HttpOnly/i.test(r1.setCookie ?? "") && /SameSite=Lax/i.test(r1.setCookie ?? ""), r1.setCookie);
  const me = await first.q("auth.me");
  check("auth.me 唔再回傳 passwordHash", me.ok && !("passwordHash" in me.data) && me.data.role === "user", me);
  const st = await first.q("shop.admin.stats");
  check("租客打 admin API → FORBIDDEN", !st.ok && st.code === "FORBIDDEN", st);

  const dup = await anon.m("account.register", { username: "firstguy", password: "secret123", name: "x" });
  check("重複用戶名（唔分大細楷）→ CONFLICT", !dup.ok && dup.code === "CONFLICT", dup);
  const demoName = await anon.m("account.register", { username: "demo-owner", password: "secret123", name: "x" });
  check("唔准註冊 demo- 開頭用戶名", !demoName.ok, demoName);
  const cn = await new Client("cn").m("account.register", { username: "陳小文", password: "secret123", name: "陳小文" });
  check("中文用戶名可以註冊", cn.ok && cn.data.role === "user", cn);
  const shortPw = await anon.m("account.register", { username: "shortpw", password: "123", name: "x" });
  check("密碼太短 → 中文錯誤訊息", !shortPw.ok && /密碼最少/.test(shortPw.message), shortPw);

  const d = await anon.m("account.demoLogin", { kind: "owner" });
  check("Demo 登入被拒（示範模式關閉）", !d.ok && d.code === "FORBIDDEN", d);
  const dl = await anon.m("account.login", { username: "demo-owner", password: "demo1234" });
  check("demo-owner 手動登入被拒", !dl.ok, dl);

  const login = await new Client("l").m("account.login", { username: "FIRSTGUY", password: "secret123" });
  check("登入成功（用戶名唔分大細楷）", login.ok && login.data.role === "user", login);

  const brute = new Client("brute");
  let last;
  for (let i = 0; i < 9; i++) last = await brute.m("account.login", { username: "firstguy", password: "wrong" + i });
  check("連續錯 8 次後鎖 15 分鐘", !last.ok && last.code === "TOO_MANY_REQUESTS", last);
  const okAfter = await brute.m("account.login", { username: "firstguy", password: "secret123" });
  check("鎖住期間正確密碼都唔俾入", !okAfter.ok && okAfter.code === "TOO_MANY_REQUESTS", okAfter);

  const forged = new Client("forged");
  forged.cookie = "gridbox_sid=eyJhbGciOiJIUzI1NiJ9.eyJ1bmlvbklkIjoibG9jYWw6Zmlyc3RndXkifQ.invalidsig";
  const fm = await forged.q("auth.me");
  check("偽造 session token → UNAUTHORIZED", !fm.ok && fm.code === "UNAUTHORIZED", fm);
}

if (phase === "2") {
  console.log("── Phase 2：用 OWNER_USERNAME 建立店主 + 完整業務流程");
  const h = await anon.q("shop.dbHealth");
  check("重啟後數據仍在（3 個用戶 + 店主）", h.data?.counts?.users === 3, h.data);
  const boss = new Client("boss");
  const bl = await boss.m("account.login", { username: "boss", password: "BossPass!2026" });
  check("店主登入 → admin", bl.ok && bl.data.role === "admin", bl);
  const cfg = await anon.q("account.config");
  check("config.hasOwner=true", cfg.data?.hasOwner === true, cfg);
  const first = new Client("first");
  await first.m("account.login", { username: "firstguy", password: "secret123" });
  const fr = await first.q("auth.me");
  check("之前搶先註冊嘅戶口仍然係租客", fr.data?.role === "user", fr);

  const stats = await boss.q("shop.admin.stats");
  check("店主睇到總覽（70 格）", stats.ok && stats.data.grids.total === 70, stats);

  const sa = await boss.m("account.createAccount", { username: "staff1", password: "staff123", name: "店員阿珍", role: "staff" });
  check("店主開店員戶口", sa.ok, sa);
  const ta = await boss.m("account.createAccount", { username: "tenant1", password: "tenant123", name: "租客陳", role: "user" });
  check("店主開租客戶口", ta.ok, ta);
  const badAdmin = await boss.m("account.createAccount", { username: "x2", password: "tenant123", name: "x", role: "admin" });
  check("唔可以經 API 開多個店主", !badAdmin.ok, badAdmin);

  const tid = (await boss.m("shop.admin.createTenant", { name: "陳小彤", phone: "91234567" })).data;
  check("建立租戶檔案", typeof tid === "number", tid);
  const link = await boss.m("shop.admin.updateTenant", { id: tid, userId: ta.data.id });
  check("連結租客戶口", link.ok, link);
  const grids = (await boss.q("shop.admin.listGrids")).data;
  const g24 = grids.find((g) => g.code === "024");
  const g17 = grids.find((g) => g.code === "017");
  check("格仔 024 係大格 $700", g24?.size === "L" && g24?.monthlyRent === "700.00", g24);
  const lease = await boss.m("shop.admin.createLease", { gridId: g24.id, tenantId: tid, startDate: "2026-09-01", endDate: "2027-02-28", rentFreeDays: 7, monthlyRent: 700, deposit: 700 });
  check("建立租約", lease.ok, lease);

  const staff = new Client("staff");
  await staff.m("account.login", { username: "staff1", password: "staff123" });
  const imp = await staff.m("shop.admin.importSales", { rows: [
    { saleDate: "2026-09-20", saleTime: "14:30", gridCode: "24", productName: "PKM散M4", quantity: "3", unitPrice: "125", note: "" },
    { saleDate: "2026-09-20", saleTime: "16:00", gridCode: "", productName: "掛頸風扇", quantity: "2", unitPrice: "30", note: "店舖直銷" },
    { saleDate: "2026-09-21", saleTime: "25:99", gridCode: "024", productName: "壞時間", quantity: "1", unitPrice: "10" },
    { saleDate: "2026-09-21", saleTime: "", gridCode: "999", productName: "唔存在格仔", quantity: "1", unitPrice: "10" },
    { saleDate: "2026-09-21", saleTime: "", gridCode: "017", productName: "冇租約", quantity: "1", unitPrice: "10" },
  ] });
  check("店員上載標準 CSV：2 行成功、3 行報錯", imp.ok && imp.data.inserted === 2 && imp.data.errors?.length === 3, imp);

  const bossSale = await boss.m("shop.admin.createSale", { gridId: g24.id, saleDate: "2026-09-22", productName: "店主入嘅單", quantity: 1, unitPrice: 50 });
  check("店主記錄銷售", bossSale.ok, bossSale);
  const staffEdit = await staff.m("shop.admin.updateSale", { id: bossSale.data?.id ?? bossSale.data, productName: "店員亂改" });
  check("店員改店主嘅記錄 → 被擋", !staffEdit.ok && /只可以修改自己/.test(staffEdit.message), staffEdit);
  const staffGrid = await staff.m("shop.admin.createGrid", { code: "071", size: "M", monthlyRent: 500 });
  check("店員開格仔 → FORBIDDEN", !staffGrid.ok && staffGrid.code === "FORBIDDEN", staffGrid);

  const tenant = new Client("tenant");
  await tenant.m("account.login", { username: "tenant1", password: "tenant123" });
  const ms = await tenant.q("shop.mySales", {});
  check("租客只睇到自己格仔 2 條銷售（唔包直銷）", ms.ok && ms.data.length === 2 && ms.data.every((r) => r.gridCode === "024"), ms);
  const sum = await tenant.q("shop.mySummary");
  check("租客累計金額 = 375 + 50 = 425", sum.ok && Number(sum.data.stats.totalAmount) === 425, sum.data?.stats);
  const tImp = await tenant.m("shop.admin.importSales", { rows: [{ saleDate: "2026-09-20", gridCode: "024", productName: "x", quantity: "1", unitPrice: "1" }] });
  check("租客上載 CSV → FORBIDDEN", !tImp.ok && tImp.code === "FORBIDDEN", tImp);
  const tSale = await tenant.m("shop.admin.createSale", { gridId: g24.id, saleDate: "2026-09-22", productName: "x", quantity: 1, unitPrice: 1 });
  check("租客記錄銷售 → FORBIDDEN", !tSale.ok && tSale.code === "FORBIDDEN", tSale);
  const tList = await tenant.q("shop.admin.listSales", {});
  check("租客睇全店銷售 → FORBIDDEN", !tList.ok, tList);

  const wk = await staff.q("shop.admin.weeklyReport", { weekStart: "2026-09-14" });
  check("週結報表：直銷 $60、全週 $435", wk.ok && Number(wk.data.direct.amount) === 60 && Number(wk.data.grand.amount) === 435, wk.data && { direct: wk.data.direct, grand: wk.data.grand });

  const gen = await boss.m("shop.admin.generateMonthRent", { month: "2026-09" });
  check("開立本月租金單", gen.ok, gen);
  const st2 = await boss.q("shop.admin.stats");
  // 本月銷售 = 當月記錄總和（測試數據日期固定，所以同 listSales 比對，唔依賴今日日期）
  const month = new Date().toISOString().slice(0, 7);
  const allSales = (await boss.q("shop.admin.listSales", {})).data ?? [];
  const monthSum = allSales.filter((r) => r.saleDate.startsWith(month)).reduce((a, r) => a + Number(r.totalAmount), 0);
  check("總覽：本月銷售 = 當月記錄總和、未收租金 $700", Number(st2.data?.sales.amount) === monthSum && Number(st2.data?.rent.unpaidAmount) === 700 && allSales.reduce((a, r) => a + Number(r.totalAmount), 0) === 485, st2.data && { sales: st2.data.sales, monthSum, rent: st2.data.rent });

  const delT = await boss.m("shop.admin.deleteTenant", { id: tid });
  check("刪除有記錄嘅租戶 → 中文提示（唔會留孤兒數據）", !delT.ok && /唔可以刪除/.test(delT.message), delT);

  const csv = await boss.m("shop.admin.exportCsv", { dataset: "sales" });
  check("匯出銷售 CSV", csv.ok && JSON.stringify(csv.data).includes("PKM散M4"), csv.ok);

  const rp = await boss.m("account.resetPassword", { userId: ta.data.id, password: "newpass123" });
  check("店主重設租客密碼", rp.ok, rp);
  const relog = await new Client("t2").m("account.login", { username: "tenant1", password: "newpass123" });
  check("租客用新密碼登入", relog.ok, relog);
  const demoGen = await boss.m("shop.admin.generateDemoData");
  check("正式模式唔准生成示範資料", !demoGen.ok && demoGen.code === "FORBIDDEN", demoGen);
}

if (phase === "3") {
  console.log("── Phase 3：DEMO_MODE=true");
  const cfg = await anon.q("account.config");
  check("config.demoMode=true", cfg.data?.demoMode === true, cfg);
  const d = new Client("demo");
  const r = await d.m("account.demoLogin", { kind: "owner" });
  check("店主 Demo 登入", r.ok && r.data.role === "admin", r);
  const dt = new Client("dt");
  const r2 = await dt.m("account.demoLogin", { kind: "tenant" });
  check("租戶 Demo 登入", r2.ok && r2.data.role === "user", r2);
  const cfgOwner = await anon.q("account.config");
  check("demo-owner 唔當真店主計", cfgOwner.data?.hasOwner === true, cfgOwner);
  const gen = await d.m("shop.admin.generateDemoData");
  check("示範模式下可以生成示範資料（4 租戶）", gen.ok && gen.data.tenants === 4, gen);
  const ms = await dt.q("shop.mySales", {});
  check("租戶 Demo 睇到示範銷售", ms.ok && ms.data.length > 0, ms.ok);
  // 儲低 demo cookie 畀 phase 4 用
  const fs = await import("node:fs");
  fs.writeFileSync(process.env.COOKIE_FILE, d.cookie);
}

if (phase === "4") {
  console.log("── Phase 4：關返 DEMO_MODE=false");
  const fs = await import("node:fs");
  const d = new Client("demo");
  d.cookie = fs.readFileSync(process.env.COOKIE_FILE, "utf8");
  const me = await d.q("auth.me");
  check("舊 demo 店主 session 即時失效", !me.ok && me.code === "UNAUTHORIZED", me);
  const boss = new Client("boss");
  await boss.m("account.login", { username: "boss", password: "BossPass!2026" });
  const us = await boss.q("shop.admin.listUsers");
  check("demo 戶口已自動刪除", us.ok && !us.data.some((u) => u.unionId.startsWith("local:demo-")), us.data?.map((u) => u.unionId));
  const clr = await boss.m("shop.admin.clearDemoData");
  check("清除示範營業資料", clr.ok && clr.data.removed === 4, clr);
  const h = await anon.q("shop.dbHealth");
  check("清除後只剩真實租戶 1 個（真實數據冇被刪）", h.data?.counts?.tenants === 1, h.data?.counts);
}

console.log(`  → ${pass} 通過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
